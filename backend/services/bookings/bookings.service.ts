import { randomUUID } from 'node:crypto';
import { canBook, isActive, serviceFee } from '@airrest/business-logic';
import type { CreateBookingBody, StaffListQuery } from '@airrest/validation';
import { PERM } from '../../config/permissions';
import { env } from '../../config/env';
import { db, json, withTransaction } from '../../database/pg';
import { bookingFromRow, type BookingDecisionDoc, type BookingDoc, type BookingStatus, type HotelDoc, type RoomTypeDoc } from '../../database/types';
import { generateBookingCode } from '../../lib/codes';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { escapeLike } from '../../lib/zod';
import { intervalsForCheck, loadActiveIntervals } from '../rooms/availability';
import { newVnpOrder, vnpDate, vnpKeys } from '../../lib/vnpay';
import { actorOf, writeAudit } from '../audit';
import { hotelScope } from '../scope';
import { getDecision, lazyExpire } from './decisions';
import { emitBookingChange } from '../events';
import { getConfig } from '../systemConfig';

const DAY_MS = 24 * 3600 * 1000;
export const approvalHoldMs = async (): Promise<number> => (await getConfig('booking.hold')).value.approvalExpireMin * 60_000;
export const HOLD_MS = 20 * 60_000; // đơn chờ khách sạn duyệt: giữ phòng 20 phút (BA §3.3, P-04)

// Khách vãng lai chỉ thấy các trường này (không lộ hotelId nội bộ, lịch sử người thao tác...).
export const toGuestView = (b: BookingDoc, decision?: BookingDecisionDoc) => ({
  code: b.code,
  status: b.status,
  hotel: b.hotelSnapshot,
  stay: b.stay,
  lines: b.lines.map(({ roomTypeName, qty, subtotalVnd }) => ({ roomTypeName, qty, subtotalVnd })),
  pricing: {
    roomVnd: b.pricing.roomVnd,
    shuttleVnd: b.pricing.shuttleVnd,
    serviceFeeVnd: b.pricing.serviceFeeVnd,
    discountVnd: b.pricing.discountVnd,
    totalVnd: b.pricing.totalVnd,
  },
  payment: { method: b.payment.method, status: b.payment.status },
  expiresAt: b.expiresAt,
  timeline: b.statusHistory.map(({ to, at }) => ({ to, at })),
  ...(decision && { decision: { status: decision.decision, reason: decision.reason, decidedAt: decision.decidedAt, alternatives: decision.alternatives } }), // không lộ decidedBy
});

export { hotelScope };

/**
 * Tạo đơn (T1 trong docs/mongodb mục 6) — ví dụ đầy đủ của một transaction nhiều bảng:
 *  1) khóa tuần tự theo loại phòng (SELECT ... FOR UPDATE) -> hai khách tranh phòng cuối, bên đến sau chờ rồi thấy hết phòng
 *  2) đọc các đoạn đặt giao nhau + tính tồn bằng sweep-line
 *  3) ghi bookings + room_reservations (+ payments nếu VNPay) + audit cùng một transaction
 * Bản đơn giản: 1 loại phòng, theo đêm; trả tại khách sạn hoặc VNPay (đơn PENDING_PAYMENT + bản ghi payments, link tạo sau commit). Xe/chuyến bay ở task riêng.
 */
export async function createBooking(input: CreateBookingBody, requestId?: string, accountId?: string): Promise<BookingDoc> {
  const by = accountId ? ({ type: 'PASSENGER', id: accountId } as const) : ({ type: 'GUEST' } as const);
  if (input.paymentMethod === 'VNPAY' && !env.VNPAY_ENABLED) throw new AppError(409, 'VNPAY_DISABLED', 'Thanh toán VNPay hiện chưa được bật');
  const online = input.paymentMethod === 'VNPAY';
  const roomType = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE id = $1 AND hotel_id = $2 AND active', [input.roomTypeId, input.hotelId])).rows[0];
  const hotel = roomType && (await db.query<HotelDoc>("SELECT * FROM hotels WHERE id = $1 AND status = 'ACTIVE'", [input.hotelId])).rows[0];
  if (!roomType || !hotel) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng');

  // Giá được tính LẠI ở server từ dữ liệu trong DB, không tin số client gửi.
  const nights = Math.max(1, Math.ceil((input.to.getTime() - input.from.getTime()) / DAY_MS));
  const unit = roomType.pricing.baseNightVnd;
  const roomVnd = unit * input.qty * nights;
  const feeCfg = await getConfig('pricing.serviceFee'); // khóa giá: lưu version vào đơn
  const feeVnd = serviceFee(roomVnd, feeCfg.value);
  const totalVnd = roomVnd + feeVnd;

  // Thêm khoảng đệm dọn phòng vào cuối khoảng giữ (khớp BR-BKG-02, mặc định 0).
  const resFrom = input.from;
  const resTo = new Date(input.to.getTime() + hotel.policy.cleaningBufferMin * 60_000);
  const needsApproval = hotel.approval.manual;
  const approvalMs = await approvalHoldMs();
  const holdCfg = online ? await getConfig('booking.hold') : undefined; // P-03: thời gian giữ chỗ chờ thanh toán

  // Mã đơn ngẫu nhiên: trùng (rất hiếm) thì sinh lại và chạy lại transaction.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateBookingCode();
    try {
      const booking = await withTransaction(async (tx) => {
        const now = new Date();
        await tx.query('SELECT 1 FROM room_types WHERE id = $1 FOR UPDATE', [roomType.id]);

        const active = intervalsForCheck(await loadActiveIntervals(tx, roomType.id, resFrom, resTo, now), now);
        if (!canBook(roomType.totalRooms, active, { from: resFrom, to: resTo, qty: input.qty })) {
          throw new AppError(409, 'SOLD_OUT', 'Loại phòng này đã hết trong khoảng thời gian bạn chọn');
        }

        const bookingId = randomUUID();
        const reservationId = randomUUID();
        // VNPay: giữ chỗ chờ thanh toán trước; sau khi trả tiền mới sang CONFIRMED/PENDING (xem payments.service).
        const status: BookingStatus = online ? 'PENDING_PAYMENT' : needsApproval ? 'PENDING' : 'CONFIRMED';
        const holdMs = holdCfg ? holdCfg.value.holdMinutes * 60_000 : approvalMs;
        const holdExpiresAt = online || needsApproval ? new Date(now.getTime() + holdMs) : undefined;

        const booking: BookingDoc = {
          id: bookingId,
          seq: 0,
          code,
          status,
          hotelId: input.hotelId,
          guest: input.guest,
          hotelSnapshot: { name: hotel.name },
          stay: { type: 'NIGHT', from: input.from, to: input.to, nights },
          lines: [{ lineNo: 1, roomTypeId: roomType.id, roomTypeName: roomType.name, qty: input.qty, unitPriceVnd: unit, subtotalVnd: roomVnd, reservationId }],
          pricing: {
            roomVnd,
            shuttleVnd: 0,
            serviceFeeVnd: feeVnd,
            discountVnd: 0,
            totalVnd,
            params: { configVersions: { serviceFee: feeCfg.version, ...(holdCfg && { bookingHold: holdCfg.version }) } },
          },
          payment: { method: online ? 'VNPAY' : 'AT_HOTEL', status: 'UNPAID', paidVnd: 0, refundedVnd: 0 },
          shuttle: { tripType: 'NONE', legCount: 0 },
          ...(holdExpiresAt && { expiresAt: holdExpiresAt }),
          statusHistory: [{ to: status, at: now, by }],
          changeCount: 0,
          flags: { disputeOpen: false, payoutHeld: false, needsCall: false },
          v: 1,
          createdAt: now,
          updatedAt: now,
        };
        const ins = await tx.query<{ seq: number }>(
          `INSERT INTO bookings (id, code, status, hotel_id, guest, hotel_snapshot, stay, stay_from, lines, pricing, payment_method, payment_status, paid_vnd, refunded_vnd,
                                 shuttle, expires_at, status_history, change_count, flags, v, created_at, updated_at, account_id)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,'UNPAID',0,0,$12::jsonb,$13,$14::jsonb,0,$15::jsonb,1,$16,$16,$17) RETURNING seq`,
          [bookingId, code, status, input.hotelId, json(booking.guest), json(booking.hotelSnapshot), json(booking.stay), input.from, json(booking.lines), json(booking.pricing),
            booking.payment.method, json(booking.shuttle), holdExpiresAt ?? null, json(booking.statusHistory), json(booking.flags), now, accountId ?? null],
        );
        booking.seq = ins.rows[0]!.seq;

        await tx.query(
          `INSERT INTO room_reservations (id, hotel_id, room_type_id, kind, booking_id, qty, starts_at, ends_at, state, hold_expires_at, created_at, updated_at)
           VALUES ($1,$2,$3,'BOOKING',$4,$5,$6,$7,$8,$9,$10,$10)`,
          [reservationId, input.hotelId, roomType.id, bookingId, input.qty, resFrom, resTo, online || needsApproval ? 'HOLD' : 'CONFIRMED', holdExpiresAt ?? null, now],
        );
        if (online) {
          const { orderId, requestId: gwRequestId } = newVnpOrder(code);
          await tx.query(
            `INSERT INTO payments (id, booking_id, hotel_id, method, amount_vnd, status, txn_ref, gateway, created_at, updated_at)
             VALUES ($1,$2,$3,'VNPAY',$4,'INITIATED',$5,$6::jsonb,$7,$7)`,
            [randomUUID(), bookingId, input.hotelId, totalVnd, orderId, json({ tmnCode: vnpKeys.tmnCode, orderId, requestId: gwRequestId, createDate: vnpDate(now) }), now],
          );
        }
        await writeAudit(
          { actor: by, action: 'BOOKING.CREATE', entity: { type: 'booking', id: bookingId }, hotelId: input.hotelId, bookingId, after: { code, status, totalVnd }, requestId },
          tx,
        );
        return booking;
      });
      emitBookingChange({ code: booking.code, status: booking.status, hotelId: booking.hotelId, updatedAt: booking.updatedAt, isNew: true });
      return booking;
    } catch (e) {
      if (isDuplicateKey(e) && attempt < 2) continue; // trùng mã đơn -> thử mã khác
      throw e;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Không tạo được mã đặt phòng');
}

// Tra cứu đơn của khách vãng lai: phải khớp CẢ mã lẫn SĐT; sai thì cùng một lỗi 404 (không lộ mã nào tồn tại).
export { getDecision };
export async function lookupBooking(code: string, phone: string): Promise<BookingDoc> {
  const row = (await db.query("SELECT * FROM bookings WHERE code = $1 AND guest->>'phone' = $2", [code, phone])).rows[0];
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn với thông tin đã nhập');
  const b = bookingFromRow(row);
  if (b.status === 'PENDING' && b.expiresAt && b.expiresAt <= new Date()) {
    await lazyExpire(b.id); // job quét có thể chưa chạy: khách vẫn thấy EXPIRED ngay
    return bookingFromRow((await db.query('SELECT * FROM bookings WHERE id = $1', [b.id])).rows[0]!);
  }
  return b;
}

// Danh sách đơn (keyset pagination theo seq, mới nhất trước). `scope.hotelId` rỗng = mọi khách sạn (admin); `q.hotelId` chỉ lọc thêm khi scope rỗng.
export async function listBookings(scope: { hotelId?: string }, q: StaffListQuery & { hotelId?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  const hotelId = scope.hotelId ?? q.hotelId;
  if (hotelId) add('hotel_id = ?', hotelId);
  if (q.status) add('status = ?', q.status);
  if (q.code) add("code ILIKE ? || '%'", escapeLike(q.code));
  if (q.from) add('stay_from >= ?', q.from);
  if (q.to) add('stay_from < ?', q.to);
  if (q.cursor !== undefined) add('seq < ?', q.cursor);
  const rows = (
    await db.query(`SELECT * FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)
  ).rows.map(({ statusHistory: _h, ...r }) => bookingFromRow(r)); // danh sách không kèm lịch sử trạng thái
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.seq : null };
}

// Lễ tân: luôn khóa theo khách sạn trong token (tham số hotelId bị bỏ qua).
export const listHotelBookings = (auth: AuthContext, q: StaffListQuery) => listBookings(hotelScope(auth), q);

// Chi tiết một đơn kèm lịch sử trạng thái + quyết định; ngoài phạm vi thì cùng lỗi 404.
export async function getBookingDetail(scope: { hotelId?: string }, id: string): Promise<{ booking: BookingDoc; decision?: BookingDecisionDoc }> {
  const row = (await db.query('SELECT * FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [id, scope.hotelId ?? null])).rows[0];
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
  return { booking: bookingFromRow(row), decision: await getDecision(id) };
}

// Đổi trạng thái có điều kiện (máy trạng thái): chỉ CONFIRMED -> CHECKED_IN.
// Điều kiện `status` + `hotel_id` nằm TRONG câu UPDATE nên không ghi đè lẫn nhau, không vượt phạm vi khách sạn.
export async function checkIn(auth: AuthContext, bookingId: string, requestId?: string): Promise<BookingDoc> {
  const scope = hotelScope(auth);
  const now = new Date();
  const updated = await withTransaction(async (tx) => {
    const hist = json([{ from: 'CONFIRMED', to: 'CHECKED_IN', at: now, by: actorOf(auth) }]);
    const row = (
      await tx.query(
        `UPDATE bookings SET status = 'CHECKED_IN', checked_in_at = $2, updated_at = $2, status_history = status_history || $3::jsonb, v = v + 1
         WHERE id = $1 AND status = 'CONFIRMED' AND ($4::uuid IS NULL OR hotel_id = $4) RETURNING *`,
        [bookingId, now, hist, scope.hotelId ?? null],
      )
    ).rows[0];
    if (!row) return null;
    const b = bookingFromRow(row);
    await tx.query("UPDATE room_reservations SET state = 'CHECKED_IN', updated_at = $2 WHERE booking_id = $1 AND state = 'CONFIRMED'", [bookingId, now]);
    await writeAudit(
      { actor: actorOf(auth), action: 'BOOKING.CHECKIN', entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: 'CONFIRMED' }, after: { status: 'CHECKED_IN' }, requestId },
      tx,
    );
    return b;
  });
  if (!updated) throw new AppError(409, 'INVALID_STATE', 'Đơn không tồn tại hoặc không ở trạng thái CONFIRMED');
  emitBookingChange({ code: updated.code, status: updated.status, hotelId: updated.hotelId, updatedAt: updated.updatedAt, isNew: false });
  return updated;
}

// Chuyển trạng thái sau check-in (check-out, no-show) cùng khuôn với checkIn: cập nhật có điều kiện + audit cùng transaction.
// Ngoài phạm vi khách sạn / không tồn tại -> 404 (không lộ tồn tại); sai trạng thái -> 409 INVALID_STATE. Không đụng tiền.
async function transitionStay(
  auth: AuthContext,
  bookingId: string,
  o: { from: BookingStatus; to: BookingStatus; action: string; reservation: { from: string; to: string }; dueOnly?: boolean },
  requestId?: string,
): Promise<BookingDoc> {
  const scope = hotelScope(auth);
  const now = new Date();
  const updated = await withTransaction(async (tx) => {
    const cur = (await tx.query<{ status: BookingStatus; stayFrom: Date }>('SELECT status, stay_from FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [bookingId, scope.hotelId ?? null])).rows[0];
    if (!cur) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
    if (cur.status !== o.from) throw new AppError(409, 'INVALID_STATE', `Đơn không ở trạng thái ${o.from}`);
    if (o.dueOnly) {
      // Chỉ đánh dấu không đến khi đã tới/qua NGÀY nhận phòng theo giờ Việt Nam.
      const due = (await tx.query<{ due: boolean }>("SELECT (($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS due", [now, cur.stayFrom])).rows[0]!.due;
      if (!due) throw new AppError(409, 'NO_SHOW_NOT_DUE', 'Chưa tới ngày nhận phòng nên chưa thể đánh dấu không đến');
    }
    const hist = json([{ from: o.from, to: o.to, at: now, by: actorOf(auth) }]);
    const row = (
      await tx.query(
        `UPDATE bookings SET status = $2, updated_at = $3, status_history = status_history || $4::jsonb, v = v + 1 WHERE id = $1 AND status = $5 RETURNING *`,
        [bookingId, o.to, now, hist, o.from],
      )
    ).rows[0];
    if (!row) throw new AppError(409, 'INVALID_STATE', `Đơn không ở trạng thái ${o.from}`);
    const b = bookingFromRow(row);
    await tx.query('UPDATE room_reservations SET state = $3, updated_at = $2 WHERE booking_id = $1 AND state = $4', [bookingId, now, o.reservation.to, o.reservation.from]);
    await writeAudit({ actor: actorOf(auth), action: o.action, entity: { type: 'booking', id: bookingId }, hotelId: b.hotelId, bookingId, before: { status: o.from }, after: { status: o.to }, requestId }, tx);
    return b;
  });
  emitBookingChange({ code: updated.code, status: updated.status, hotelId: updated.hotelId, updatedAt: updated.updatedAt, isNew: false });
  return updated;
}

/** CHECKED_IN -> CHECKED_OUT (giải phóng giữ chỗ: reservation COMPLETED). Doanh thu "đã thực hiện" tính theo trạng thái này. */
export const checkOut = (auth: AuthContext, bookingId: string, requestId?: string) =>
  transitionStay(auth, bookingId, { from: 'CHECKED_IN', to: 'CHECKED_OUT', action: 'BOOKING.CHECKOUT', reservation: { from: 'CHECKED_IN', to: 'COMPLETED' } }, requestId);

/** CONFIRMED -> NO_SHOW khi đã tới/qua ngày nhận phòng (giờ VN). Chỉ đổi trạng thái + nhả giữ chỗ, KHÔNG đụng tiền. */
export const markNoShow = (auth: AuthContext, bookingId: string, requestId?: string) =>
  transitionStay(auth, bookingId, { from: 'CONFIRMED', to: 'NO_SHOW', action: 'BOOKING.NOSHOW', reservation: { from: 'CONFIRMED', to: 'RELEASED' }, dueOnly: true }, requestId);
