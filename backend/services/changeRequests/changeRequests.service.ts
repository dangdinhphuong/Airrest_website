import { stayNights } from '../../lib/nights';
import { cancellationQuote, changeQuote, type CancellationTier } from '@airrest/business-logic';
import type { CreateChangeRequestBody } from '@airrest/validation';
import { randomUUID } from 'node:crypto';
import type { StaffRequestsQuery } from '@airrest/validation';
import { db, json, withTransaction, type Db } from '../../database/pg';
import { bookingFromRow, type Actor, type BookingDoc, type ChangeRequestDoc, type HotelDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { newGatewayOrder } from '../../lib/momo';
import { actorOf, writeAudit } from '../audit';
import { legRefundedVnd } from '../shuttle/billing';
import { cancelShuttlesForBooking } from '../shuttle/cascade';
import { isRoomAvailable } from '../rooms/availability';
import { hotelScope } from '../scope';
import { lookupBooking } from '../bookings/bookings.service';
import { emitBookingChange } from '../events';
import { publishBookingStatus } from '../shuttle/events';
import { getConfig } from '../systemConfig';

export const CANCELLABLE = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'];
const CHANGEABLE = ['PENDING', 'CONFIRMED'];

type Template = 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE';

// Báo giá hủy tại thời điểm `now` (dựa trên gói chính sách của khách sạn + cấu hình cancellation.fee).
// Xe đặt cùng đơn tách riêng khỏi chính sách phòng: KHÔNG hoàn tiền xe (khách không đi), phần xe đã thu hiển thị là 'giữ lại'.
// Phần PHÒNG tính đúng như cũ trên (phòng + phí DV) -> đơn không chọn xe cho kết quả y hệt trước đây.
async function cancelQuoteFor(b: BookingDoc, now: Date, q: Db = db) {
  // Chính sách chốt lúc đặt (flags.cancellationTemplate); đơn cũ chưa lưu thì theo chính sách hiện tại của khách sạn.
  const hotel = b.flags.cancellationTemplate ? undefined : (await db.query<Pick<HotelDoc, 'policy'>>('SELECT policy FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const template = (b.flags.cancellationTemplate ?? (hotel?.policy as { cancellationTemplate?: Template } | undefined)?.cancellationTemplate ?? 'FLEXIBLE') as Template;
  const cfg = await getConfig('cancellation.fee', now);
  const tier = cfg.value[template] as CancellationTier;
  const paid = b.payment.paidVnd;
  const shuttleVnd = b.pricing.shuttleVnd ?? 0;
  const shuttleRefundVnd = 0;
  const shuttleKeepVnd = paid > 0 ? shuttleVnd : 0;
  const paidRoomFee = paid > 0 ? Math.max(0, paid - (await legRefundedVnd(q, b.id)) - shuttleVnd) : 0;
  const rq = cancellationQuote({
    tier, checkInAt: new Date(b.stay.from), now, roomVnd: b.pricing.roomVnd, nights: b.stay.nights, serviceFeeVnd: b.pricing.serviceFeeVnd,
    totalVnd: b.pricing.totalVnd - shuttleVnd, paidVnd: paid > 0 ? paidRoomFee : 0, refundedVnd: b.payment.refundedVnd,
  });
  return { template, configVersion: cfg.version, ...rq, keepVnd: rq.keepVnd + shuttleKeepVnd, refundVnd: rq.refundVnd + shuttleRefundVnd, shuttleRefundVnd, shuttleKeepVnd };
}

export async function quoteCancellation(code: string, phone: string) {
  const b = await lookupBooking(code, phone);
  if (!CANCELLABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CANCELLABLE', 'Đơn không thể hủy ở trạng thái hiện tại');
  const q = await cancelQuoteFor(b, new Date());
  return { bookingCode: b.code, status: b.status, ...q };
}

export async function createChangeRequest(input: CreateChangeRequestBody, requestId?: string): Promise<ChangeRequestDoc> {
  const found = await lookupBooking(input.code, input.phone); // 404 chung khi sai mã/SĐT
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [found.id])).rows[0]!);
    if (input.type === 'CANCEL' && !CANCELLABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CANCELLABLE', 'Đơn không thể hủy ở trạng thái hiện tại');
    // shortcut: đơn có dòng theo giờ chưa hỗ trợ đổi ngày (đổi giờ vào = hủy + đặt lại); nâng cấp khi cần đổi giờ vào trực tiếp.
    if (input.type === 'CHANGE' && b.lines.some((l) => l.kind === 'HOURLY')) throw new AppError(422, 'CHANGE_NOT_SUPPORTED_HOURLY', 'Đơn có phòng theo giờ chưa hỗ trợ đổi ngày. Bạn có thể hủy đơn rồi đặt lại giờ khác.');
    if (input.type === 'CHANGE' && !CHANGEABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CHANGEABLE', 'Đơn không thể đổi ngày ở trạng thái hiện tại');
    const pending = (await tx.query('SELECT 1 FROM change_requests WHERE booking_id = $1 AND status = \'PENDING\'', [b.id])).rows[0];
    if (pending) throw new AppError(409, 'REQUEST_ALREADY_PENDING', 'Đơn đã có một yêu cầu đang chờ xử lý');

    let quote: Record<string, unknown>;
    let newFrom: Date | null = null;
    let newTo: Date | null = null;
    if (input.type === 'CANCEL') {
      quote = { kind: 'CANCEL', ...(await cancelQuoteFor(b, now, tx)) };
    } else {
      newFrom = input.newFrom;
      newTo = input.newTo;
      if (newFrom.getTime() === new Date(b.stay.from).getTime() && newTo.getTime() === new Date(b.stay.to).getTime()) throw new AppError(422, 'CHANGE_SAME_DATES', 'Ngày mới trùng ngày hiện tại');
      const cq = await cancelQuoteFor(b, now, tx);
      if (cq.template === 'NON_REFUNDABLE' && cq.hoursBefore < 24) throw new AppError(409, 'CHANGE_NOT_ALLOWED', 'Gói không hoàn không cho đổi ngày trong vòng 24 giờ trước nhận phòng');
      const newNights = stayNights(newFrom, newTo);
      const fee = await getConfig('pricing.serviceFee', now);
      quote = {
        kind: 'CHANGE', newNights,
        ...changeQuote({ unitPriceVnd: b.lines.reduce((s, l) => s + l.unitPriceVnd * l.qty, 0), qty: 1, // tổng giá một đêm của mọi dòng phòng
           oldNights: b.stay.nights, newNights, oldTotalVnd: b.pricing.totalVnd, fee: fee.value, shuttleVnd: b.pricing.shuttleVnd ?? 0 }),
        shuttleVnd: b.pricing.shuttleVnd ?? 0, // để applyChange phát hiện báo giá cũ nếu xe đổi trong lúc chờ duyệt
      };
    }
    let created: ChangeRequestDoc;
    try {
      created = (
        await tx.query<ChangeRequestDoc>(
          `INSERT INTO change_requests (booking_id, hotel_id, type, reason_code, reason_note, new_from, new_to, quote, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
          [b.id, b.hotelId, input.type, input.reasonCode, input.reasonNote || null, newFrom, newTo, json(quote), json({ type: 'GUEST' })],
        )
      ).rows[0]!;
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(409, 'REQUEST_ALREADY_PENDING', 'Đơn đã có một yêu cầu đang chờ xử lý');
      throw e;
    }
    await writeAudit({ actor: { type: 'GUEST' }, action: 'CHANGE_REQUEST.CREATE', entity: { type: 'change_request', id: created.id }, hotelId: b.hotelId, bookingId: b.id, after: { type: input.type, reasonCode: input.reasonCode }, requestId }, tx);
    return { created, booking: b };
  });
  // Lễ tân thấy realtime: phát lại trạng thái booking hiện tại.
  emitBookingChange({ code: out.booking.code, status: out.booking.status, hotelId: out.booking.hotelId, updatedAt: new Date(), isNew: false });
  return out.created;
}

export interface GuestRequestView {
  id: string; type: string; status: string; reasonCode: string; newFrom?: Date; newTo?: Date; quote: unknown;
  decisionNote?: string; decidedAt?: Date; createdAt: Date; refund?: { status: string; amountVnd: number; dueAt: Date };
}

export async function listGuestRequests(code: string, phone: string): Promise<GuestRequestView[]> {
  const b = await lookupBooking(code, phone);
  const rows = (
    await db.query<any>(
      `SELECT cr.id, cr.type, cr.status, cr.reason_code, cr.new_from, cr.new_to, cr.quote, cr.decision_note, cr.decided_at, cr.created_at,
              r.status AS refund_status, r.amount_vnd AS refund_amount, r.due_at AS refund_due
       FROM change_requests cr LEFT JOIN refunds r ON r.key IN ('cancel:' || cr.id, 'change:' || cr.id)
       WHERE cr.booking_id = $1 ORDER BY cr.seq DESC`,
      [b.id],
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id, type: r.type, status: r.status, reasonCode: r.reasonCode, newFrom: r.newFrom, newTo: r.newTo, quote: r.quote,
    decisionNote: r.decisionNote, decidedAt: r.decidedAt, createdAt: r.createdAt,
    ...(r.refundStatus && { refund: { status: r.refundStatus, amountVnd: r.refundAmount, dueAt: r.refundDue } }),
  }));
}

// ---------- Nhân sự khách sạn / admin xử lý ----------

export async function listStaffRequests(auth: AuthContext, q: StaffRequestsQuery) {
  const scope = hotelScope(auth);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (scope.hotelId) add('cr.hotel_id = ?', scope.hotelId);
  if (q.status) add('cr.status = ?', q.status);
  if (q.cursor !== undefined) add('cr.seq < ?', q.cursor);
  const rows = (
    await db.query<any>(
      `SELECT cr.*, b.code AS booking_code, b.guest->>'fullName' AS guest_name, b.stay, b.status AS booking_status
       FROM change_requests cr JOIN bookings b ON b.id = cr.booking_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY cr.seq DESC LIMIT ${q.limit + 1}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1].seq : null };
}

// Lệnh hoàn do hủy/đổi: chỉ GHI (PENDING, due_at vô hạn), không gọi cổng thanh toán; luồng thanh toán bật lại sẽ kích hoạt.
export async function createRequestRefund(tx: Db, b: BookingDoc, key: string, amountVnd: number, reasonCode: 'CANCEL_APPROVED' | 'CHANGE_DOWNSIZE', now: Date, requestId?: string): Promise<string | null> {
  const amount = Math.min(amountVnd, b.payment.paidVnd - b.payment.refundedVnd - (await legRefundedVnd(tx, b.id))); // trừ phần chiều xe đã hoàn riêng
  if (amount <= 0) return null;
  const pay = (await tx.query<{ id: string; method: string }>("SELECT id, method FROM payments WHERE booking_id = $1 AND status = 'SUCCEEDED' ORDER BY paid_at DESC LIMIT 1", [b.id])).rows[0];
  if (!pay) return null;
  const { orderId, requestId: gw } = newGatewayOrder(pay.method, `RF${b.code}`);
  const ins = await tx.query<{ id: string }>(
    `INSERT INTO refunds (id, booking_id, hotel_id, payment_id, key, amount_vnd, reason_code, method, status, gateway, due_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$10,'PENDING',$8::jsonb,'infinity',$9,$9) ON CONFLICT (key) DO NOTHING RETURNING id`,
    [randomUUID(), b.id, b.hotelId, pay.id, key, amount, reasonCode, json({ orderId, requestId: gw }), now, pay.method],
  );
  const id = ins.rows[0]?.id ?? null;
  if (id) await writeAudit({ actor: { type: 'SYSTEM' }, action: 'REFUND.CREATE', entity: { type: 'refund', id }, hotelId: b.hotelId, bookingId: b.id, after: { amountVnd: amount, reasonCode }, requestId }, tx);
  return id;
}

async function applyCancel(tx: Db, cr: ChangeRequestDoc, b: BookingDoc, actor: Actor, now: Date, requestId?: string) {
  if (!CANCELLABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CANCELLABLE', 'Đơn không còn ở trạng thái có thể hủy');
  await tx.query(
    `UPDATE bookings SET status = 'CANCELLED', updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1 WHERE id = $1`,
    [b.id, now, json([{ from: b.status, to: 'CANCELLED', at: now, by: actor, reasonCode: 'CANCEL_APPROVED' }])],
  );
  await tx.query("UPDATE room_reservations SET state = 'RELEASED', updated_at = $2 WHERE booking_id = $1 AND state IN ('HOLD','CONFIRMED')", [b.id, now]);
  // Số hoàn = phần phòng theo báo giá đã duyệt; tiền xe không bao giờ hoàn (báo giá có shuttleRefundVnd = 0).
  await cancelShuttlesForBooking(tx, b.id, actor, 'Booking đã hủy', requestId);
  const refundId = await createRequestRefund(tx, b, `cancel:${cr.id}`, Number(cr.quote.refundVnd ?? 0), 'CANCEL_APPROVED', now, requestId);
  await writeAudit({ actor, action: 'BOOKING.CANCEL', entity: { type: 'booking', id: b.id }, hotelId: b.hotelId, bookingId: b.id, before: { status: b.status }, after: { status: 'CANCELLED' }, requestId }, tx);
  publishBookingStatus(b, 'CANCELLED');
  return { refundId, newStatus: 'CANCELLED' };
}

async function applyChange(tx: Db, cr: ChangeRequestDoc, b: BookingDoc, actor: Actor, now: Date, requestId?: string) {
  if (!CHANGEABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CHANGEABLE', 'Đơn không còn ở trạng thái có thể đổi ngày');
  const q = cr.quote as { newNights: number; newRoomVnd: number; newServiceFeeVnd: number; newTotalVnd: number; diffVnd: number; shuttleVnd?: number };
  if ((b.pricing.shuttleVnd ?? 0) !== (q.shuttleVnd ?? 0)) throw new AppError(409, 'QUOTE_STALE', 'Tiền xe của đơn đã thay đổi sau khi gửi yêu cầu; hãy gửi yêu cầu đổi ngày mới');
  const newFrom = new Date(cr.newFrom!);
  const newTo = new Date(cr.newTo!);
  // Khóa mọi loại phòng của đơn theo thứ tự id (cùng thứ tự với createBooking), rồi kiểm tồn từng dòng: thiếu một dòng thì không đổi gì.
  const totals = new Map((await tx.query<{ id: string; totalRooms: number }>('SELECT id, total_rooms FROM room_types WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [b.lines.map((l) => l.roomTypeId)])).rows.map((r) => [r.id, r.totalRooms]));
  const hotel = (await tx.query<{ policy: { cleaningBufferMin?: number } }>('SELECT policy FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const resTo = new Date(newTo.getTime() + (hotel?.policy.cleaningBufferMin ?? 0) * 60_000);
  const short: string[] = [];
  for (const l of b.lines) {
    if (!(await isRoomAvailable(tx, { roomTypeId: l.roomTypeId, roomTotal: totals.get(l.roomTypeId) ?? 0, from: newFrom, to: resTo, qty: l.qty, excludeBookingId: b.id, now }))) short.push(l.roomTypeName);
  }
  if (short.length) throw new AppError(409, 'SOLD_OUT', `Không còn phòng trong khoảng ngày mới: ${short.join(', ')}. Đơn giữ nguyên, chưa đổi gì.`, { soldOut: short });
  if (q.diffVnd > 0 && b.payment.paidVnd > 0) throw new AppError(409, 'CHANGE_NEEDS_PAYMENT', 'Đổi ngày làm tăng giá nhưng đơn đã thu tiền; chưa hỗ trợ thu thêm');
  // Đổi trên CÙNG hàng giữ chỗ: giữ chỗ mới và nhả chỗ cũ là một thao tác nguyên tử, khách không mất phòng giữa chừng.
  await tx.query('UPDATE room_reservations SET starts_at = $2, ends_at = $3, updated_at = $4 WHERE booking_id = $1 AND state IN (\'HOLD\',\'CONFIRMED\')', [b.id, newFrom, resTo, now]);
  await tx.query(
    `UPDATE bookings SET stay = jsonb_build_object('type','NIGHT','from',$2::timestamptz,'to',$3::timestamptz,'nights',$4::int), stay_from = $2,
       lines = (SELECT jsonb_agg(jsonb_set(l, '{subtotalVnd}', to_jsonb(((l->>'unitPriceVnd')::bigint * (l->>'qty')::bigint * $4::int))) ORDER BY o) FROM jsonb_array_elements(lines) WITH ORDINALITY AS t(l, o)),
       pricing = pricing || jsonb_build_object('roomVnd',$5::bigint,'serviceFeeVnd',$6::bigint,'totalVnd',$7::bigint),
       change_count = change_count + 1, updated_at = $8, status_history = status_history || $9::jsonb, v = v + 1 WHERE id = $1`,
    [b.id, newFrom, newTo, q.newNights, q.newRoomVnd, q.newServiceFeeVnd, q.newTotalVnd, now, json([{ from: b.status, to: b.status, at: now, by: actor, reasonCode: 'DATE_CHANGED' }])],
  );
  const refundId = q.diffVnd < 0 && b.payment.paidVnd > 0 ? await createRequestRefund(tx, b, `change:${cr.id}`, -q.diffVnd, 'CHANGE_DOWNSIZE', now, requestId) : null;
  await writeAudit(
    { actor, action: 'BOOKING.CHANGE', entity: { type: 'booking', id: b.id }, hotelId: b.hotelId, bookingId: b.id, before: { stay: b.stay, totalVnd: b.pricing.totalVnd }, after: { from: newFrom, to: newTo, totalVnd: q.newTotalVnd }, requestId },
    tx,
  );
  return { refundId, newStatus: b.status };
}

async function lockRequest(tx: Db, scope: { hotelId?: string }, id: string): Promise<ChangeRequestDoc> {
  const cr = (await tx.query<ChangeRequestDoc>('SELECT * FROM change_requests WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [id, scope.hotelId ?? null])).rows[0];
  if (!cr) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu');
  return cr;
}

export async function approveRequest(auth: AuthContext, id: string, note: string | undefined, requestId?: string): Promise<ChangeRequestDoc> {
  const scope = hotelScope(auth);
  const actor = actorOf(auth);
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    const cr = await lockRequest(tx, scope, id);
    if (cr.status === 'APPROVED') return { cr, replay: true as const };
    if (cr.status === 'REJECTED') throw new AppError(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu đã bị từ chối');
    const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [cr.bookingId])).rows[0]!);
    const r = cr.type === 'CANCEL' ? await applyCancel(tx, cr, b, actor, now, requestId) : await applyChange(tx, cr, b, actor, now, requestId);
    const done = (await tx.query<ChangeRequestDoc>("UPDATE change_requests SET status = 'APPROVED', decided_by = $2::jsonb, decided_at = $3, decision_note = $4, updated_at = $3 WHERE id = $1 AND status = 'PENDING' RETURNING *", [id, json(actor), now, note ?? null])).rows[0]!;
    await writeAudit({ actor, action: 'CHANGE_REQUEST.APPROVE', entity: { type: 'change_request', id }, hotelId: b.hotelId, bookingId: b.id, after: { type: cr.type, refundId: r.refundId, refundVnd: cr.quote.refundVnd ?? null, keepVnd: cr.quote.keepVnd ?? null }, requestId }, tx);
    return { cr: done, replay: false as const, booking: { code: b.code, status: r.newStatus, hotelId: b.hotelId } };
  });
  if (!out.replay) emitBookingChange({ ...out.booking!, updatedAt: new Date(), isNew: false });
  return out.cr;
}

export async function rejectRequest(auth: AuthContext, id: string, note: string, requestId?: string): Promise<ChangeRequestDoc> {
  const scope = hotelScope(auth);
  const actor = actorOf(auth);
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    const cr = await lockRequest(tx, scope, id);
    if (cr.status === 'REJECTED') return { cr, replay: true as const };
    if (cr.status === 'APPROVED') throw new AppError(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu đã được duyệt');
    const done = (await tx.query<ChangeRequestDoc>("UPDATE change_requests SET status = 'REJECTED', decided_by = $2::jsonb, decided_at = $3, decision_note = $4, updated_at = $3 WHERE id = $1 AND status = 'PENDING' RETURNING *", [id, json(actor), now, note])).rows[0]!;
    const b = (await tx.query<{ code: string; status: string; hotelId: string }>('SELECT code, status, hotel_id FROM bookings WHERE id = $1', [cr.bookingId])).rows[0]!;
    await writeAudit({ actor, action: 'CHANGE_REQUEST.REJECT', entity: { type: 'change_request', id }, hotelId: b.hotelId, bookingId: cr.bookingId, reasonNote: note, requestId }, tx);
    return { cr: done, replay: false as const, booking: b };
  });
  if (!out.replay) emitBookingChange({ ...out.booking!, updatedAt: new Date(), isNew: false });
  return out.cr;
}
