import { ObjectId } from 'mongodb';
import { col } from '../../db/collections';
import { withTransaction } from '../../db/mongo';
import type { BookingDoc, BookingStatus } from '../../db/types';
import { actorOf, writeAudit } from '../../lib/audit';
import { generateBookingCode } from '../../lib/codes';
import { AppError, isDuplicateKey } from '../../lib/errors';
import { canBook, isActive } from '../../lib/inventory';
import type { AuthContext } from '../../lib/jwt';
import { serviceFee, toNum, vnd } from '../../lib/money';
import { getConfig } from '../../lib/systemConfig';
import { PERM } from '../../config/permissions';
import type { CreateBookingBody, StaffListQuery } from './bookings.schema';

const DAY_MS = 24 * 3600 * 1000;
const HOLD_MS = 20 * 60_000; // đơn chờ khách sạn duyệt: giữ phòng 20 phút (BA §3.3, P-04)

// Khách vãng lai chỉ thấy các trường này (không lộ hotelId nội bộ, lịch sử người thao tác...).
export const toGuestView = (b: BookingDoc) => ({
  code: b.code,
  status: b.status,
  hotel: b.hotelSnapshot,
  stay: b.stay,
  lines: b.lines.map(({ roomTypeName, qty, subtotalVnd }) => ({ roomTypeName, qty, subtotalVnd: toNum(subtotalVnd) })),
  pricing: {
    roomVnd: toNum(b.pricing.roomVnd),
    shuttleVnd: toNum(b.pricing.shuttleVnd),
    serviceFeeVnd: toNum(b.pricing.serviceFeeVnd),
    discountVnd: toNum(b.pricing.discountVnd),
    totalVnd: toNum(b.pricing.totalVnd),
  },
  payment: { method: b.payment.method, status: b.payment.status },
  timeline: b.statusHistory.map(({ to, at }) => ({ to, at })),
});

// Phạm vi dữ liệu: tài khoản khách sạn CHỈ thấy hotelId của chính nó (lấy từ token, không từ tham số);
// chỉ quyền HOTEL_SCOPE_ALL (Admin) mới xem mọi khách sạn.
export function hotelScope(auth: AuthContext): { hotelId?: ObjectId } {
  if (auth.permissions.includes(PERM.HOTEL_SCOPE_ALL)) return {};
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return { hotelId: new ObjectId(auth.hotelId) };
}

/**
 * Tạo đơn (T1 trong docs/mongodb mục 6) — ví dụ đầy đủ của một transaction nhiều tài liệu:
 *  1) khóa tuần tự theo loại phòng ($inc inventory_locks) -> hai khách tranh phòng cuối, một bên tự retry
 *  2) đọc các đoạn đặt giao nhau + tính tồn bằng sweep-line
 *  3) ghi room_reservations + bookings + audit cùng một transaction
 * Bản đơn giản: 1 loại phòng, theo đêm, trả tại khách sạn. MoMo/xe/chuyến bay thêm ở các task riêng.
 */
export async function createBooking(input: CreateBookingBody, requestId?: string) {
  const hotelId = new ObjectId(input.hotelId);
  const roomType = await col.roomTypes().findOne({ _id: new ObjectId(input.roomTypeId), hotelId, active: true });
  const hotel = roomType && (await col.hotels().findOne({ _id: hotelId, status: 'ACTIVE' }));
  if (!roomType || !hotel) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng');

  // Giá được tính LẠI ở server từ dữ liệu trong DB, không tin số client gửi.
  const nights = Math.max(1, Math.ceil((input.to.getTime() - input.from.getTime()) / DAY_MS));
  const unit = Number(roomType.pricing.baseNightVnd);
  const roomVnd = unit * input.qty * nights;
  const feeCfg = await getConfig('pricing.serviceFee'); // khóa giá: lưu version vào đơn
  const feeVnd = serviceFee(roomVnd, feeCfg.value);
  const totalVnd = roomVnd + feeVnd;

  // Thêm khoảng đệm dọn phòng vào cuối khoảng giữ (khớp BR-BKG-02, mặc định 0).
  const resFrom = input.from;
  const resTo = new Date(input.to.getTime() + hotel.policy.cleaningBufferMin * 60_000);
  const needsApproval = hotel.approval.manual;

  // Mã đơn ngẫu nhiên: trùng (rất hiếm) thì sinh lại và chạy lại transaction.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateBookingCode();
    try {
      return await withTransaction(async (session) => {
        const now = new Date();
        await col.inventoryLocks().updateOne({ _id: roomType._id }, { $inc: { seq: 1 } }, { upsert: true, session });

        const overlapping = await col
          .roomReservations()
          .find(
            {
              roomTypeId: roomType._id,
              from: { $lt: resTo },
              to: { $gt: resFrom },
              $or: [{ state: { $in: ['CONFIRMED', 'CHECKED_IN'] } }, { state: 'HOLD', holdExpiresAt: { $gt: now } }],
            },
            { session, projection: { from: 1, to: 1, qty: 1, state: 1, holdExpiresAt: 1 } },
          )
          .toArray();
        const active = overlapping.filter((r) => isActive(r, now));
        if (!canBook(roomType.totalRooms, active, { from: resFrom, to: resTo, qty: input.qty })) {
          throw new AppError(409, 'SOLD_OUT', 'Loại phòng này đã hết trong khoảng thời gian bạn chọn');
        }

        const bookingId = new ObjectId();
        const reservationId = new ObjectId();
        const status: BookingStatus = needsApproval ? 'PENDING' : 'CONFIRMED';
        const holdExpiresAt = needsApproval ? new Date(now.getTime() + HOLD_MS) : undefined;

        await col.roomReservations().insertOne(
          {
            _id: reservationId,
            hotelId,
            roomTypeId: roomType._id,
            kind: 'BOOKING',
            bookingId,
            qty: input.qty,
            from: resFrom,
            to: resTo,
            state: needsApproval ? 'HOLD' : 'CONFIRMED',
            ...(holdExpiresAt && { holdExpiresAt }),
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );

        const booking: BookingDoc = {
          _id: bookingId,
          code,
          status,
          hotelId,
          guest: input.guest,
          hotelSnapshot: { name: hotel.name },
          stay: { type: 'NIGHT', from: input.from, to: input.to, nights },
          lines: [
            {
              lineNo: 1,
              roomTypeId: roomType._id,
              roomTypeName: roomType.name,
              qty: input.qty,
              unitPriceVnd: vnd(unit),
              subtotalVnd: vnd(roomVnd),
              reservationId,
            },
          ],
          pricing: {
            roomVnd: vnd(roomVnd),
            shuttleVnd: vnd(0),
            serviceFeeVnd: vnd(feeVnd),
            discountVnd: vnd(0),
            totalVnd: vnd(totalVnd),
            params: { configVersions: { serviceFee: feeCfg.version } },
          },
          payment: { method: 'AT_HOTEL', status: 'UNPAID', paidVnd: vnd(0), refundedVnd: vnd(0) },
          shuttle: { tripType: 'NONE', legCount: 0 },
          ...(holdExpiresAt && { expiresAt: holdExpiresAt }),
          statusHistory: [{ to: status, at: now, by: { type: 'GUEST' } }],
          changeCount: 0,
          flags: { disputeOpen: false, payoutHeld: false, needsCall: false },
          v: 1,
          createdAt: now,
          updatedAt: now,
        };
        await col.bookings().insertOne(booking, { session });
        await writeAudit(
          {
            actor: { type: 'GUEST' },
            action: 'BOOKING.CREATE',
            entity: { type: 'booking', id: bookingId.toHexString() },
            hotelId,
            bookingId,
            after: { code, status, totalVnd },
            requestId,
          },
          session,
        );
        return booking;
      });
    } catch (e) {
      if (isDuplicateKey(e) && attempt < 2) continue; // trùng mã đơn -> thử mã khác
      throw e;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Không tạo được mã đặt phòng');
}

// Tra cứu đơn của khách vãng lai: phải khớp CẢ mã lẫn SĐT; sai thì cùng một lỗi 404 (không lộ mã nào tồn tại).
export async function lookupBooking(code: string, phone: string) {
  const booking = await col.bookings().findOne({ code, 'guest.phone': phone });
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn với thông tin đã nhập');
  return booking;
}

// Danh sách đơn cho khách sạn (keyset pagination, mới nhất trước).
export async function listHotelBookings(auth: AuthContext, q: StaffListQuery) {
  const filter = {
    ...hotelScope(auth),
    ...(q.status && { status: q.status }),
    ...(q.cursor && { _id: { $lt: new ObjectId(q.cursor) } }),
  };
  const rows = await col
    .bookings()
    .find(filter, { projection: { statusHistory: 0 } })
    .sort({ _id: -1 })
    .limit(q.limit + 1)
    .toArray();
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?._id : null };
}

// Đổi trạng thái có điều kiện (máy trạng thái): chỉ CONFIRMED -> CHECKED_IN.
// Bộ lọc `status` + `hotelId` nằm TRONG câu update nên không ghi đè lẫn nhau, không vượt phạm vi khách sạn.
export async function checkIn(auth: AuthContext, bookingId: string, requestId?: string) {
  const _id = new ObjectId(bookingId);
  const now = new Date();
  const updated = await withTransaction(async (session) => {
    const b = await col.bookings().findOneAndUpdate(
      { _id, status: 'CONFIRMED', ...hotelScope(auth) },
      {
        $set: { status: 'CHECKED_IN', checkedInAt: now, updatedAt: now },
        $push: { statusHistory: { from: 'CONFIRMED', to: 'CHECKED_IN', at: now, by: actorOf(auth) } },
        $inc: { v: 1 },
      },
      { session, returnDocument: 'after' },
    );
    if (!b) return null;
    await col
      .roomReservations()
      .updateMany({ bookingId: _id, state: 'CONFIRMED' }, { $set: { state: 'CHECKED_IN', updatedAt: now } }, { session });
    await writeAudit(
      {
        actor: actorOf(auth),
        action: 'BOOKING.CHECKIN',
        entity: { type: 'booking', id: bookingId },
        hotelId: b.hotelId,
        bookingId: _id,
        before: { status: 'CONFIRMED' },
        after: { status: 'CHECKED_IN' },
        requestId,
      },
      session,
    );
    return b;
  });
  if (!updated) throw new AppError(409, 'INVALID_STATE', 'Đơn không tồn tại hoặc không ở trạng thái CONFIRMED');
  return updated;
}
