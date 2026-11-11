import { randomUUID } from 'node:crypto';
import { canBook, isActive, serviceFee } from '@airrest/business-logic';
import type { CreateBookingBody, StaffListQuery } from '@airrest/validation';
import { PERM } from '../../config/permissions';
import { env } from '../../config/env';
import { db, json, withTransaction } from '../../database/pg';
import { bookingFromRow, type BookingDoc, type BookingStatus, type HotelDoc, type RoomTypeDoc } from '../../database/types';
import { generateBookingCode } from '../../lib/codes';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { momoKeys, newMomoOrder } from '../../lib/momo';
import { actorOf, writeAudit } from '../audit';
import { emitBookingChange } from '../events';
import { getConfig } from '../systemConfig';

const DAY_MS = 24 * 3600 * 1000;
export const HOLD_MS = 20 * 60_000; // đơn chờ khách sạn duyệt: giữ phòng 20 phút (BA §3.3, P-04)

// Khách vãng lai chỉ thấy các trường này (không lộ hotelId nội bộ, lịch sử người thao tác...).
export const toGuestView = (b: BookingDoc) => ({
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
});

// Phạm vi dữ liệu: tài khoản khách sạn CHỈ thấy hotelId của chính nó (lấy từ token, không từ tham số);
// chỉ quyền HOTEL_SCOPE_ALL (Admin) mới xem mọi khách sạn.
export function hotelScope(auth: AuthContext): { hotelId?: string } {
  if (auth.permissions.includes(PERM.HOTEL_SCOPE_ALL)) return {};
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return { hotelId: auth.hotelId };
}

/**
 * Tạo đơn (T1 trong docs/mongodb mục 6) — ví dụ đầy đủ của một transaction nhiều bảng:
 *  1) khóa tuần tự theo loại phòng (SELECT ... FOR UPDATE) -> hai khách tranh phòng cuối, bên đến sau chờ rồi thấy hết phòng
 *  2) đọc các đoạn đặt giao nhau + tính tồn bằng sweep-line
 *  3) ghi bookings + room_reservations (+ payments nếu MoMo) + audit cùng một transaction
 * Bản đơn giản: 1 loại phòng, theo đêm; trả tại khách sạn hoặc MoMo (đơn PENDING_PAYMENT + bản ghi payments, link tạo sau commit). Xe/chuyến bay ở task riêng.
 */
export async function createBooking(input: CreateBookingBody, requestId?: string): Promise<BookingDoc> {
  if (input.paymentMethod === 'MOMO' && !env.MOMO_ENABLED) throw new AppError(409, 'MOMO_DISABLED', 'Thanh toán MoMo hiện chưa được bật');
  const momo = input.paymentMethod === 'MOMO';
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
  const holdCfg = momo ? await getConfig('booking.hold') : undefined; // P-03: thời gian giữ chỗ chờ thanh toán

  // Mã đơn ngẫu nhiên: trùng (rất hiếm) thì sinh lại và chạy lại transaction.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateBookingCode();
    try {
      const booking = await withTransaction(async (tx) => {
        const now = new Date();
        await tx.query('SELECT 1 FROM room_types WHERE id = $1 FOR UPDATE', [roomType.id]);

        const overlapping = (
          await tx.query<{ from: Date; to: Date; qty: number; state: 'HOLD' | 'CONFIRMED' | 'CHECKED_IN'; holdExpiresAt?: Date }>(
            `SELECT starts_at AS "from", ends_at AS "to", qty, state, hold_expires_at FROM room_reservations
             WHERE room_type_id = $1 AND starts_at < $3 AND ends_at > $2
               AND (state IN ('CONFIRMED','CHECKED_IN') OR (state = 'HOLD' AND hold_expires_at > $4))`,
            [roomType.id, resFrom, resTo, now],
          )
        ).rows;
        const active = overlapping.filter((r) => isActive(r, now));
        if (!canBook(roomType.totalRooms, active, { from: resFrom, to: resTo, qty: input.qty })) {
          throw new AppError(409, 'SOLD_OUT', 'Loại phòng này đã hết trong khoảng thời gian bạn chọn');
        }

        const bookingId = randomUUID();
        const reservationId = randomUUID();
        // MoMo: giữ chỗ chờ thanh toán trước; sau khi trả tiền mới sang CONFIRMED/PENDING (xem payments.service).
        const status: BookingStatus = momo ? 'PENDING_PAYMENT' : needsApproval ? 'PENDING' : 'CONFIRMED';
        const holdMs = holdCfg ? holdCfg.value.holdMinutes * 60_000 : HOLD_MS;
        const holdExpiresAt = momo || needsApproval ? new Date(now.getTime() + holdMs) : undefined;

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
          payment: { method: momo ? 'MOMO' : 'AT_HOTEL', status: 'UNPAID', paidVnd: 0, refundedVnd: 0 },
          shuttle: { tripType: 'NONE', legCount: 0 },
          ...(holdExpiresAt && { expiresAt: holdExpiresAt }),
          statusHistory: [{ to: status, at: now, by: { type: 'GUEST' } }],
          changeCount: 0,
          flags: { disputeOpen: false, payoutHeld: false, needsCall: false },
          v: 1,
          createdAt: now,
          updatedAt: now,
        };
        const ins = await tx.query<{ seq: number }>(
          `INSERT INTO bookings (id, code, status, hotel_id, guest, hotel_snapshot, stay, stay_from, lines, pricing, payment_method, payment_status, paid_vnd, refunded_vnd,
                                 shuttle, expires_at, status_history, change_count, flags, v, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,'UNPAID',0,0,$12::jsonb,$13,$14::jsonb,0,$15::jsonb,1,$16,$16) RETURNING seq`,
          [bookingId, code, status, input.hotelId, json(booking.guest), json(booking.hotelSnapshot), json(booking.stay), input.from, json(booking.lines), json(booking.pricing),
            booking.payment.method, json(booking.shuttle), holdExpiresAt ?? null, json(booking.statusHistory), json(booking.flags), now],
        );
        booking.seq = ins.rows[0]!.seq;

        await tx.query(
          `INSERT INTO room_reservations (id, hotel_id, room_type_id, kind, booking_id, qty, starts_at, ends_at, state, hold_expires_at, created_at, updated_at)
           VALUES ($1,$2,$3,'BOOKING',$4,$5,$6,$7,$8,$9,$10,$10)`,
          [reservationId, input.hotelId, roomType.id, bookingId, input.qty, resFrom, resTo, momo || needsApproval ? 'HOLD' : 'CONFIRMED', holdExpiresAt ?? null, now],
        );
        if (momo) {
          const { orderId, requestId: momoRequestId } = newMomoOrder(code);
          await tx.query(
            `INSERT INTO payments (id, booking_id, hotel_id, method, amount_vnd, status, momo_order_id, momo, created_at, updated_at)
             VALUES ($1,$2,$3,'MOMO',$4,'INITIATED',$5,$6::jsonb,$7,$7)`,
            [randomUUID(), bookingId, input.hotelId, totalVnd, orderId, json({ partnerCode: momoKeys.partnerCode, orderId, requestId: momoRequestId }), now],
          );
        }
        await writeAudit(
          { actor: { type: 'GUEST' }, action: 'BOOKING.CREATE', entity: { type: 'booking', id: bookingId }, hotelId: input.hotelId, bookingId, after: { code, status, totalVnd }, requestId },
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
export async function lookupBooking(code: string, phone: string): Promise<BookingDoc> {
  const row = (await db.query("SELECT * FROM bookings WHERE code = $1 AND guest->>'phone' = $2", [code, phone])).rows[0];
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn với thông tin đã nhập');
  return bookingFromRow(row);
}

// Danh sách đơn cho khách sạn (keyset pagination theo seq, mới nhất trước).
export async function listHotelBookings(auth: AuthContext, q: StaffListQuery) {
  const scope = hotelScope(auth);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (scope.hotelId) add('hotel_id = ?', scope.hotelId);
  if (q.status) add('status = ?', q.status);
  if (q.cursor !== undefined) add('seq < ?', q.cursor);
  const rows = (
    await db.query(`SELECT * FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)
  ).rows.map(({ statusHistory: _h, ...r }) => bookingFromRow(r)); // danh sách không kèm lịch sử trạng thái
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.seq : null };
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
