import type { AssignShuttleBody, CallNowBody, CreateShuttleBody, HotelShuttleQuoteBody, ShuttleListQuery, ShuttleQuoteBody } from '@airrest/validation';
import { env } from '../../config/env';
import { db, json, withTransaction, type Db } from '../../database/pg';
import { bookingFromRow, type BookingDoc, type HotelDoc, type ShuttleRequestDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { lookupBooking } from '../bookings/bookings.service';
import { hotelFeatures } from '../hotels/catalog';
import { hotelScope } from '../scope';
import { createRequestRefund } from '../changeRequests/changeRequests.service';
import { untakenLegs } from './billing';
import { priceLeg, resolvePassengers } from './pricing';
import { cancelLiveTrips, cancelShuttlesForBooking } from './cascade';
import { dispatchRequest } from './dispatch';
import { publishAll, type ShuttleEvent } from './events';
import { loadGuestShuttles, type ShuttleGuestView } from './guestView';

export { cancelShuttlesForBooking };
export type { ShuttleGuestView };

const DAY = 24 * 3600_000;
const ELIGIBLE = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

// Kiểm tra và tính giá; dùng chung cho báo giá và tạo yêu cầu. Số khách đi xe: mặc định = guests của đơn, không vượt guests.
async function price(b: BookingDoc, i: ShuttleQuoteBody, now: Date, checkWindow: boolean) {
  if (!ELIGIBLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_ELIGIBLE', 'Đơn không còn hiệu lực để yêu cầu xe');
  const passengers = resolvePassengers(b.guest.count ?? 1, i.passengers);
  const hotel = (await db.query<Pick<HotelDoc, 'airports'>>('SELECT airports FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const p = await priceLeg(hotel?.airports ?? [], i, now, checkWindow ? b.stay : undefined);
  return { ...p, passengers };
}

export async function quoteShuttle(i: ShuttleQuoteBody) {
  const b = await lookupBooking(i.code, i.phone);
  const p = await price(b, i, new Date(), false);
  return { priceVnd: p.priceVnd, distanceKm: p.km, night: p.night, configVersion: p.configVersion, passengers: p.passengers };
}

/**
 * Báo giá TRƯỚC khi có đơn (công khai, theo khách sạn). Dùng đúng `priceLeg` của luồng tạo đơn/yêu cầu xe nên số tiền khớp sau khi đặt.
 * Khách sạn không có xe -> { offered: false }. Khách sạn 'free' -> offered, free, giá 0. Thiếu pickupAt: tính giá ban ngày (phụ thu đêm cần giờ đón).
 */
export async function quoteHotelShuttle(hotelId: string, i: HotelShuttleQuoteBody) {
  const hotel = (await db.query<HotelDoc>("SELECT * FROM hotels WHERE id = $1 AND status = 'ACTIVE'", [hotelId])).rows[0];
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const mode = hotelFeatures(hotel).shuttle;
  if (mode === 'none') return { offered: false, free: false, legs: [], totalVnd: 0 };
  const now = new Date();
  const day = new Date(Math.floor(now.getTime() / DAY) * DAY + 5 * 3600_000); // 12:00 giờ VN: không dính phụ thu đêm
  const legs = [];
  for (const l of i.legs) {
    const airport = l.airport ?? hotel.airports[0]?.iata.toUpperCase();
    if (!airport) throw new AppError(422, 'AIRPORT_NOT_SERVED', 'Khách sạn không phục vụ sân bay nào');
    const p = await priceLeg(hotel.airports, { airport, pickupAt: l.pickupAt ?? day }, now);
    legs.push({ direction: l.direction, airport, distanceKm: p.km, priceVnd: mode === 'free' ? 0 : p.priceVnd, night: p.night });
  }
  return { offered: true, free: mode === 'free', legs, totalVnd: legs.reduce((a, l) => a + l.priceVnd, 0), ...(i.passengers && { passengers: i.passengers }), ...(i.guests && { guests: i.guests }) };
}

export async function createShuttleRequest(i: CreateShuttleBody, requestId?: string, via?: 'CALL_NOW'): Promise<ShuttleGuestView> {
  const found = await lookupBooking(i.code, i.phone);
  let s: ShuttleRequestDoc;
  try {
    s = await withTransaction(async (tx) => {
      const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [found.id])).rows[0]!);
      const p = await price(b, i, new Date(), true);
      const s = (
        await tx.query<ShuttleRequestDoc>(
          `INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, location, note, price_vnd, config_version, passengers)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [b.id, b.hotelId, i.direction, i.airport, p.km, i.pickupAt, i.location || null, i.note || null, p.priceVnd, p.configVersion, p.passengers],
        )
      ).rows[0]!;
      await writeAudit({ actor: { type: 'GUEST' }, action: 'SHUTTLE.REQUEST', entity: { type: 'shuttle', id: s.id }, hotelId: b.hotelId, bookingId: b.id, after: { direction: i.direction, priceVnd: p.priceVnd, passengers: p.passengers }, requestId }, tx);
      await logBookingEvent(tx, { bookingId: b.id, hotelId: b.hotelId, actor: { type: 'GUEST' }, type: via === 'CALL_NOW' ? 'SHUTTLE_CALL_NOW' : 'SHUTTLE_REQUESTED', data: { requestId: s.id, direction: i.direction, airport: i.airport, pickupAt: i.pickupAt, passengers: p.passengers } });
      return s;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'SHUTTLE_ALREADY_REQUESTED', 'Đơn đã có yêu cầu xe cùng chiều đang hoạt động');
    throw e;
  }
  // Giờ đón trong vòng SHUTTLE_DISPATCH_LEAD_MIN: điều phối ngay (ngoài transaction tạo yêu cầu; lỗi không làm hỏng việc tạo, vòng quét sẽ thử lại).
  if (new Date(s.pickupAt).getTime() - Date.now() <= env.SHUTTLE_DISPATCH_LEAD_MIN * 60_000) await dispatchRequest(s.id).catch(() => undefined);
  return (await loadGuestShuttles(s.bookingId, s.id))[0]!;
}

/** Khách gọi xe ngay chiều ra sân bay: giờ đón = bây giờ + SHUTTLE_CALL_NOW_MIN. Đơn phải CONFIRMED/CHECKED_IN; trùng yêu cầu đang hoạt động -> 409 SHUTTLE_ALREADY_REQUESTED. */
export async function callShuttleNow(i: CallNowBody, requestId?: string): Promise<ShuttleGuestView> {
  const b = await lookupBooking(i.code, i.phone);
  if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status)) throw new AppError(409, 'BOOKING_NOT_ELIGIBLE', 'Chỉ gọi xe ngay khi đơn đã xác nhận hoặc đang lưu trú');
  const airport = i.airport ?? (await db.query<Pick<HotelDoc, 'airports'>>('SELECT airports FROM hotels WHERE id = $1', [b.hotelId])).rows[0]?.airports[0]?.iata.toUpperCase();
  if (!airport) throw new AppError(422, 'AIRPORT_NOT_SERVED', 'Khách sạn không phục vụ sân bay nào');
  return createShuttleRequest({ code: i.code, phone: i.phone, direction: 'TO_AIRPORT', airport, pickupAt: new Date(Date.now() + env.SHUTTLE_CALL_NOW_MIN * 60_000), passengers: i.passengers, location: i.location, note: i.note }, requestId, 'CALL_NOW');
}

/**
 * Khách hủy xe (tự đi): được khi chưa có chuyến nào ONBOARD (đã lên xe -> 409 TRIP_ALREADY_STARTED).
 * Tiền (chính sách mới): KHÔNG BAO GIỜ hoàn tiền xe khi khách hủy/không đi, kể cả hủy sớm trước khi tài xế nhận; số tiền đơn đã thu (pricing, phí DV) giữ nguyên.
 * Ngoại lệ duy nhất: đơn AT_HOTEL (chưa thu tiền online) + chiều chưa có tài xế nhận -> giảm tổng đơn phải trả (không có gì để hoàn).
 * Yêu cầu xe tạo sau khi có đơn (billed = false): giữ quy tắc cũ, không thu/hoàn riêng.
 */
export async function cancelShuttleByGuest(id: string, code: string, phone: string, requestId?: string): Promise<ShuttleGuestView> {
  const found = await lookupBooking(code, phone);
  const events = await withTransaction(async (tx) => {
    // Khóa đơn TRƯỚC yêu cầu (cùng thứ tự với luồng hủy đơn) để không deadlock.
    const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [found.id])).rows[0]!);
    const s = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 AND booking_id = $2 FOR UPDATE', [id, b.id])).rows[0];
    if (!s) throw new AppError(404, 'SHUTTLE_NOT_FOUND', 'Không tìm thấy yêu cầu xe');
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'SHUTTLE_NOT_CANCELLABLE', 'Yêu cầu xe không thể hủy ở trạng thái hiện tại');
    const actor = { type: 'GUEST' } as const;
    const reduceTotal = b.payment.method === 'AT_HOTEL' && (await untakenLegs(tx, b.id, id)).length > 0; // tính TRƯỚC khi hủy chuyến
    const ev = await cancelLiveTrips(tx, id, actor, 'Khách hủy xe', { rejectIfStarted: true, requestId });
    await tx.query("UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = $1", [id]);
    if (reduceTotal) {
      const now = new Date();
      const left = b.shuttle.legCount - 1;
      await tx.query(
        `UPDATE bookings SET pricing = pricing || jsonb_build_object('shuttleVnd', (pricing->>'shuttleVnd')::bigint - $2::bigint, 'totalVnd', (pricing->>'totalVnd')::bigint - $2::bigint),
           shuttle = jsonb_build_object('tripType', $3::text, 'legCount', $4::int), updated_at = $5, v = v + 1 WHERE id = $1`,
        [b.id, s.priceVnd, left <= 0 ? 'NONE' : left === 1 ? 'ONE_WAY' : 'ROUND_TRIP', Math.max(0, left), now],
      );
    }
    await writeAudit({ actor, action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: b.id, after: { refunded: false, totalReduced: reduceTotal, priceVnd: s.priceVnd }, requestId }, tx);
    await logBookingEvent(tx, { bookingId: b.id, hotelId: s.hotelId, actor, type: 'SHUTTLE_CANCELLED', data: { requestId: id, refundVnd: 0, note: s.billed && s.priceVnd > 0 && !reduceTotal ? 'khách hủy, không hoàn phí xe' : 'khách hủy xe' } });
    return [...ev, { type: 'SHUTTLE_CANCELLED', hotelId: s.hotelId, bookingId: b.id, requestId: id, audience: ['HOTEL' as const, 'GUEST' as const], payload: { status: 'CANCELLED' } }];
  });
  publishAll(events);
  return (await loadGuestShuttles(found.id, id))[0]!;
}

// ---------- Vận hành (khách sạn / OPS) ----------

export async function listStaffShuttles(auth: AuthContext, q: ShuttleListQuery) {
  const scope = hotelScope(auth);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (scope.hotelId) add('s.hotel_id = ?', scope.hotelId);
  if (q.status) add('s.status = ?', q.status);
  if (q.cursor !== undefined) add('s.seq < ?', q.cursor);
  const rows = (
    await db.query<any>(
      `SELECT s.*, b.code AS booking_code, b.guest->>'fullName' AS guest_name FROM shuttle_requests s JOIN bookings b ON b.id = s.booking_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.seq DESC LIMIT ${q.limit + 1}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1].seq : null };
}

async function lockShuttle(tx: Parameters<Parameters<typeof withTransaction>[0]>[0], auth: AuthContext, id: string) {
  const scope = hotelScope(auth);
  const s = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [id, scope.hotelId ?? null])).rows[0];
  if (!s) throw new AppError(404, 'SHUTTLE_NOT_FOUND', 'Không tìm thấy yêu cầu xe');
  return s;
}

// Quan hệ với luồng chuyến mới: yêu cầu đã có chuyến thì chuyến (shuttle_trips) là nguồn sự thật, gán tay tên/SĐT và "hoàn tất" cũ bị chặn.
async function assertNoLiveTrips(tx: Db, requestId: string): Promise<void> {
  if ((await tx.query("SELECT 1 FROM shuttle_trips WHERE request_id = $1 AND status NOT IN ('CANCELLED','REJECTED') LIMIT 1", [requestId])).rowCount > 0) {
    throw new AppError(409, 'USE_TRIP_FLOW', 'Yêu cầu đã được điều phối theo chuyến: dùng bảng điều phối và thao tác theo chuyến');
  }
}

export async function assignShuttle(auth: AuthContext, id: string, input: AssignShuttleBody, requestId?: string): Promise<ShuttleRequestDoc> {
  return withTransaction(async (tx) => {
    const s = await lockShuttle(tx, auth, id);
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể gán tài xế khi xe ở trạng thái ${s.status}`);
    await assertNoLiveTrips(tx, id);
    const b = (await tx.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [s.bookingId])).rows[0]!;
    if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status)) throw new AppError(409, 'BOOKING_NOT_CONFIRMED', 'Chỉ gán xe cho đơn đã được xác nhận');
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'ASSIGNED', driver = $2::jsonb, assigned_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [id, json({ name: input.driverName, phone: input.driverPhone })])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'SHUTTLE.ASSIGN', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: s.bookingId, before: { driver: s.driver }, after: { driver: next.driver }, requestId }, tx);
    return next;
  });
}

export async function completeShuttle(auth: AuthContext, id: string, requestId?: string): Promise<ShuttleRequestDoc> {
  return withTransaction(async (tx) => {
    const s = await lockShuttle(tx, auth, id);
    if (s.status !== 'ASSIGNED') throw new AppError(409, 'INVALID_TRANSITION', `Không thể hoàn tất khi xe ở trạng thái ${s.status}`);
    await assertNoLiveTrips(tx, id);
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'DONE', completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [id])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'SHUTTLE.COMPLETE', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: s.bookingId, requestId }, tx);
    return next;
  });
}

export async function cancelShuttleByStaff(auth: AuthContext, id: string, note: string, requestId?: string): Promise<ShuttleRequestDoc> {
  const events: ShuttleEvent[] = [];
  const out = await withTransaction(async (tx) => {
    const s = await lockShuttle(tx, auth, id);
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể hủy khi xe ở trạng thái ${s.status}`);
    events.push(...(await cancelLiveTrips(tx, id, actorOf(auth), note, { rejectIfStarted: true, requestId })));
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, note])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: s.bookingId, reasonNote: note, requestId }, tx);
    await logBookingEvent(tx, { bookingId: s.bookingId, hotelId: s.hotelId, actor: actorOf(auth), type: 'SHUTTLE_CANCELLED', data: { requestId: id, note } });
    events.push({ type: 'SHUTTLE_CANCELLED', hotelId: s.hotelId, bookingId: s.bookingId, requestId: id, audience: ['HOTEL', 'GUEST'], payload: { status: 'CANCELLED' } });
    return next;
  });
  publishAll(events);
  return out;
}
