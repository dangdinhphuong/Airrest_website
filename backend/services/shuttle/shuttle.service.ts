import { shuttlePrice } from '@airrest/business-logic';
import type { AssignShuttleBody, CreateShuttleBody, ShuttleListQuery, ShuttleQuoteBody } from '@airrest/validation';
import { db, json, withTransaction } from '../../database/pg';
import { bookingFromRow, type BookingDoc, type HotelDoc, type ShuttleRequestDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { lookupBooking } from '../bookings/bookings.service';
import { hotelScope } from '../scope';
import { getConfig } from '../systemConfig';

export { cancelShuttlesForBooking } from './cascade';

const DAY_MS = 24 * 3600_000;
const ELIGIBLE = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

export interface ShuttleGuestView {
  id: string; direction: string; airport: string; pickupAt: Date; location?: string; note?: string; priceVnd: number; status: string;
  driver?: { name: string; phone: string }; updatedAt: Date;
}
const guestView = (s: ShuttleRequestDoc): ShuttleGuestView => ({
  id: s.id, direction: s.direction, airport: s.airportIata, pickupAt: s.pickupAt, location: s.location, note: s.note, priceVnd: s.priceVnd, status: s.status, driver: s.driver, updatedAt: s.updatedAt,
});

// Kiểm tra và tính giá; dùng chung cho báo giá và tạo yêu cầu.
async function price(b: BookingDoc, i: ShuttleQuoteBody, now: Date, checkWindow: boolean) {
  if (!ELIGIBLE.includes(b.status)) throw new AppError(409, 'BOOKING_NOT_ELIGIBLE', 'Đơn không còn hiệu lực để yêu cầu xe');
  const hotel = (await db.query<Pick<HotelDoc, 'airports'>>('SELECT airports FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const ap = hotel?.airports.find((a) => a.iata.toUpperCase() === i.airport);
  if (!ap) throw new AppError(422, 'AIRPORT_NOT_SERVED', 'Khách sạn không phục vụ sân bay này');
  const cfg = await getConfig('pricing.shuttle', now);
  const p = shuttlePrice(cfg.value, ap.km, i.pickupAt);
  if (!p) throw new AppError(422, 'SHUTTLE_OUT_OF_RANGE', 'Quãng đường vượt giới hạn phục vụ');
  if (checkWindow) {
    const t = i.pickupAt.getTime();
    if (t < now.getTime() || t < new Date(b.stay.from).getTime() - DAY_MS || t > new Date(b.stay.to).getTime() + DAY_MS) {
      throw new AppError(422, 'PICKUP_OUT_OF_STAY_WINDOW', 'Giờ đón phải nằm trong khoảng lưu trú (±24 giờ) và chưa qua');
    }
  }
  return { ...p, km: ap.km, configVersion: cfg.version };
}

export async function quoteShuttle(i: ShuttleQuoteBody) {
  const b = await lookupBooking(i.code, i.phone);
  const p = await price(b, i, new Date(), false);
  return { priceVnd: p.priceVnd, distanceKm: p.km, night: p.night, configVersion: p.configVersion };
}

export async function createShuttleRequest(i: CreateShuttleBody, requestId?: string): Promise<ShuttleGuestView> {
  const found = await lookupBooking(i.code, i.phone);
  try {
    return await withTransaction(async (tx) => {
      const b = bookingFromRow((await tx.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [found.id])).rows[0]!);
      const p = await price(b, i, new Date(), true);
      const s = (
        await tx.query<ShuttleRequestDoc>(
          `INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, location, note, price_vnd, config_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [b.id, b.hotelId, i.direction, i.airport, p.km, i.pickupAt, i.location || null, i.note || null, p.priceVnd, p.configVersion],
        )
      ).rows[0]!;
      await writeAudit({ actor: { type: 'GUEST' }, action: 'SHUTTLE.REQUEST', entity: { type: 'shuttle', id: s.id }, hotelId: b.hotelId, bookingId: b.id, after: { direction: i.direction, priceVnd: p.priceVnd }, requestId }, tx);
      return guestView(s);
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'SHUTTLE_ALREADY_REQUESTED', 'Đơn đã có yêu cầu xe cùng chiều đang hoạt động');
    throw e;
  }
}

export async function listGuestShuttles(code: string, phone: string): Promise<ShuttleGuestView[]> {
  const b = await lookupBooking(code, phone);
  return (await db.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE booking_id = $1 ORDER BY seq DESC', [b.id])).rows.map(guestView);
}

export async function cancelShuttleByGuest(id: string, code: string, phone: string, requestId?: string): Promise<ShuttleGuestView> {
  const b = await lookupBooking(code, phone);
  return withTransaction(async (tx) => {
    const s = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 AND booking_id = $2 FOR UPDATE', [id, b.id])).rows[0];
    if (!s) throw new AppError(404, 'SHUTTLE_NOT_FOUND', 'Không tìm thấy yêu cầu xe');
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'SHUTTLE_NOT_CANCELLABLE', 'Yêu cầu xe không thể hủy ở trạng thái hiện tại');
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [id])).rows[0]!;
    await writeAudit({ actor: { type: 'GUEST' }, action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: b.id, requestId }, tx);
    return guestView(next);
  });
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

export async function assignShuttle(auth: AuthContext, id: string, input: AssignShuttleBody, requestId?: string): Promise<ShuttleRequestDoc> {
  return withTransaction(async (tx) => {
    const s = await lockShuttle(tx, auth, id);
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể gán tài xế khi xe ở trạng thái ${s.status}`);
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
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'DONE', completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [id])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'SHUTTLE.COMPLETE', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: s.bookingId, requestId }, tx);
    return next;
  });
}

export async function cancelShuttleByStaff(auth: AuthContext, id: string, note: string, requestId?: string): Promise<ShuttleRequestDoc> {
  return withTransaction(async (tx) => {
    const s = await lockShuttle(tx, auth, id);
    if (!['REQUESTED', 'ASSIGNED'].includes(s.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể hủy khi xe ở trạng thái ${s.status}`);
    const next = (await tx.query<ShuttleRequestDoc>("UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, note])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id }, hotelId: s.hotelId, bookingId: s.bookingId, reasonNote: note, requestId }, tx);
    return next;
  });
}
