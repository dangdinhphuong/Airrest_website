import { cancellationQuote, changeQuote, type CancellationTier } from '@airrest/business-logic';
import type { CreateChangeRequestBody } from '@airrest/validation';
import { randomUUID } from 'node:crypto';
import type { StaffRequestsQuery } from '@airrest/validation';
import { db, json, withTransaction, type Db } from '../../database/pg';
import { bookingFromRow, type Actor, type BookingDoc, type ChangeRequestDoc, type HotelDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { newVnpOrder } from '../../lib/vnpay';
import { actorOf, writeAudit } from '../audit';
import { cancelShuttlesForBooking } from '../shuttle/cascade';
import { isRoomAvailable } from '../rooms/availability';
import { hotelScope } from '../scope';
import { lookupBooking } from '../bookings/bookings.service';
import { emitBookingChange } from '../events';
import { getConfig } from '../systemConfig';

const DAY_MS = 24 * 3600_000;
export const CANCELLABLE = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'];
const CHANGEABLE = ['PENDING', 'CONFIRMED'];

type Template = 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE';

// Báo giá hủy tại thời điểm `now` (dựa trên gói chính sách của khách sạn + cấu hình cancellation.fee).
async function cancelQuoteFor(b: BookingDoc, now: Date) {
  const hotel = (await db.query<Pick<HotelDoc, 'policy'>>('SELECT policy FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const template = ((hotel?.policy as { cancellationTemplate?: Template } | undefined)?.cancellationTemplate ?? 'FLEXIBLE') as Template;
  const cfg = await getConfig('cancellation.fee', now);
  const tier = cfg.value[template] as CancellationTier;
  const q = cancellationQuote({
    tier, checkInAt: new Date(b.stay.from), now, roomVnd: b.pricing.roomVnd, nights: b.stay.nights, serviceFeeVnd: b.pricing.serviceFeeVnd,
    totalVnd: b.pricing.totalVnd, paidVnd: b.payment.paidVnd, refundedVnd: b.payment.refundedVnd,
  });
  return { template, configVersion: cfg.version, ...q };
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
    if (input.type === 'CHANGE' && !CHANGEABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CHANGEABLE', 'Đơn không thể đổi ngày ở trạng thái hiện tại');
    const pending = (await tx.query('SELECT 1 FROM change_requests WHERE booking_id = $1 AND status = \'PENDING\'', [b.id])).rows[0];
    if (pending) throw new AppError(409, 'REQUEST_ALREADY_PENDING', 'Đơn đã có một yêu cầu đang chờ xử lý');

    let quote: Record<string, unknown>;
    let newFrom: Date | null = null;
    let newTo: Date | null = null;
    if (input.type === 'CANCEL') {
      quote = { kind: 'CANCEL', ...(await cancelQuoteFor(b, now)) };
    } else {
      newFrom = input.newFrom;
      newTo = input.newTo;
      if (newFrom.getTime() === new Date(b.stay.from).getTime() && newTo.getTime() === new Date(b.stay.to).getTime()) throw new AppError(422, 'CHANGE_SAME_DATES', 'Ngày mới trùng ngày hiện tại');
      const cq = await cancelQuoteFor(b, now);
      if (cq.template === 'NON_REFUNDABLE' && cq.hoursBefore < 24) throw new AppError(409, 'CHANGE_NOT_ALLOWED', 'Gói không hoàn không cho đổi ngày trong vòng 24 giờ trước nhận phòng');
      const newNights = Math.max(1, Math.ceil((newTo.getTime() - newFrom.getTime()) / DAY_MS));
      const fee = await getConfig('pricing.serviceFee', now);
      quote = {
        kind: 'CHANGE', newNights,
        ...changeQuote({ unitPriceVnd: b.lines[0]!.unitPriceVnd, qty: b.lines.reduce((s, l) => s + l.qty, 0), oldNights: b.stay.nights, newNights, oldTotalVnd: b.pricing.totalVnd, fee: fee.value }),
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
async function createRequestRefund(tx: Db, b: BookingDoc, key: string, amountVnd: number, reasonCode: 'CANCEL_APPROVED' | 'CHANGE_DOWNSIZE', now: Date, requestId?: string): Promise<string | null> {
  const amount = Math.min(amountVnd, b.payment.paidVnd - b.payment.refundedVnd);
  if (amount <= 0) return null;
  const pay = (await tx.query<{ id: string }>("SELECT id FROM payments WHERE booking_id = $1 AND status = 'SUCCEEDED' ORDER BY paid_at DESC LIMIT 1", [b.id])).rows[0];
  if (!pay) return null;
  const { orderId, requestId: gw } = newVnpOrder(`RF${b.code}`);
  const ins = await tx.query<{ id: string }>(
    `INSERT INTO refunds (id, booking_id, hotel_id, payment_id, key, amount_vnd, reason_code, method, status, gateway, due_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'VNPAY','PENDING',$8::jsonb,'infinity',$9,$9) ON CONFLICT (key) DO NOTHING RETURNING id`,
    [randomUUID(), b.id, b.hotelId, pay.id, key, amount, reasonCode, json({ orderId, requestId: gw }), now],
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
  await cancelShuttlesForBooking(tx, b.id, actor, 'Booking đã hủy', requestId);
  const refundId = await createRequestRefund(tx, b, `cancel:${cr.id}`, Number(cr.quote.refundVnd ?? 0), 'CANCEL_APPROVED', now, requestId);
  await writeAudit({ actor, action: 'BOOKING.CANCEL', entity: { type: 'booking', id: b.id }, hotelId: b.hotelId, bookingId: b.id, before: { status: b.status }, after: { status: 'CANCELLED' }, requestId }, tx);
  return { refundId, newStatus: 'CANCELLED' };
}

async function applyChange(tx: Db, cr: ChangeRequestDoc, b: BookingDoc, actor: Actor, now: Date, requestId?: string) {
  if (!CHANGEABLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CHANGEABLE', 'Đơn không còn ở trạng thái có thể đổi ngày');
  const q = cr.quote as { newNights: number; newRoomVnd: number; newServiceFeeVnd: number; newTotalVnd: number; diffVnd: number };
  const newFrom = new Date(cr.newFrom!);
  const newTo = new Date(cr.newTo!);
  const line = b.lines[0]!;
  const rt = (await tx.query<{ totalRooms: number }>('SELECT total_rooms FROM room_types WHERE id = $1 FOR UPDATE', [line.roomTypeId])).rows[0]!;
  const hotel = (await tx.query<{ policy: { cleaningBufferMin?: number } }>('SELECT policy FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const resTo = new Date(newTo.getTime() + (hotel?.policy.cleaningBufferMin ?? 0) * 60_000);
  const qty = b.lines.reduce((s, l) => s + l.qty, 0);
  if (!(await isRoomAvailable(tx, { roomTypeId: line.roomTypeId, roomTotal: rt.totalRooms, from: newFrom, to: resTo, qty, excludeBookingId: b.id, now }))) {
    throw new AppError(409, 'SOLD_OUT', 'Không còn phòng trong khoảng ngày mới');
  }
  if (q.diffVnd > 0 && b.payment.paidVnd > 0) throw new AppError(409, 'CHANGE_NEEDS_PAYMENT', 'Đổi ngày làm tăng giá nhưng đơn đã thu tiền; chưa hỗ trợ thu thêm');
  // Đổi trên CÙNG hàng giữ chỗ: giữ chỗ mới và nhả chỗ cũ là một thao tác nguyên tử, khách không mất phòng giữa chừng.
  await tx.query('UPDATE room_reservations SET starts_at = $2, ends_at = $3, updated_at = $4 WHERE booking_id = $1 AND state IN (\'HOLD\',\'CONFIRMED\')', [b.id, newFrom, resTo, now]);
  await tx.query(
    `UPDATE bookings SET stay = jsonb_build_object('type','NIGHT','from',$2::timestamptz,'to',$3::timestamptz,'nights',$4::int), stay_from = $2,
       lines = jsonb_set(lines, '{0,subtotalVnd}', to_jsonb($5::bigint)),
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
