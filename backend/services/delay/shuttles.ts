// Xe đón (sân bay -> KS) và xe về (KS -> sân bay) cho đơn PAYER sau khi KS xác nhận (spec 6.6, GĐ3).
// Mỗi booking PAYER = MỘT yêu cầu xe cho cả đơn vị (không gom nhiều đơn vào một xe). Điều phối dùng lại allocateTrips của khách lẻ (dispatch.ts không đổi).
// Giá ghi ở shuttle_requests.price_vnd (billed=false): KHÔNG vào bookings.pricing/paid, không thu khách. GĐ5 lấy chi phí xe = SUM(price_vnd) các yêu cầu status <> 'CANCELLED' theo booking_id/batch_id.
import type { PaxCategory } from '@airrest/shared-types';
import { db, withTransaction } from '../../database/pg';
import type { Actor, ShuttleRequestDoc } from '../../database/types';
import { logger } from '../../lib/logger';
import { logBookingEvent } from '../bookings/bookingEvents';
import { allocateTrips, isFree, loadFleetAt } from '../shuttle/dispatch';
import { tripMembers } from '../shuttle/members';
import { publishAll, type ShuttleEvent } from '../shuttle/events';
import { env } from '../../config/env';
import type { Db } from '../../database/pg';
import { priceLeg } from '../shuttle/pricing';
import { planDelayVehicles, type DelayPax } from './vehicles/plan';

const SYSTEM: Actor = { type: 'SYSTEM' };
type Direction = 'TO_HOTEL' | 'TO_AIRPORT';
interface PaxRow { id: string; pnr: string; fullName: string; age: number; category: PaxCategory; specialNeeds: string[] | null }

/** Tạo (idempotent) + điều phối 2 yêu cầu xe của một offer CONFIRMED. Không bao giờ ném lỗi. */
export async function createDelayShuttles(offerId: string): Promise<void> {
  try {
    const o = (await db.query<any>(
      `SELECT o.id AS offer_id, o.group_id, o.pax_ids, o.booking_id, o.hotel_id, b.stay, b.status AS booking_status, b.guest, bt.pickup_point, s.airport_iata,
              h.name AS hotel_name, h.address, h.airports, g.code AS group_code, h.amenities
       FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id JOIN delay_batches bt ON bt.id = o.batch_id JOIN payer_stations s ON s.id = bt.station_id
         JOIN hotels h ON h.id = o.hotel_id JOIN delay_groups g ON g.id = o.group_id
       WHERE o.id = $1 AND o.status = 'CONFIRMED'`, [offerId])).rows[0];
    if (!o || o.bookingStatus !== 'CONFIRMED') return;
    const pax = (await db.query<PaxRow>(
      `SELECT id, pnr, full_name, age, category, special_needs FROM delay_flight_pax WHERE ${o.paxIds?.length ? 'id = ANY($1::uuid[])' : 'group_id = $1'} ORDER BY is_representative DESC, seq`,
      [o.paxIds?.length ? o.paxIds : o.groupId])).rows;
    if (!pax.length) return;
    const now = new Date();
    const stayFrom = new Date(o.stay.from), stayTo = new Date(o.stay.to);
    const a = o.address as { line?: string; ward?: string; district?: string; city?: string } | null;
    const hotelPlace = [o.hotelName, a && [a.line, a.ward, a.district, a.city].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
    const note = `Delay ${o.groupCode ?? ''} - liên hệ: ${o.guest.fullName} ${o.guest.phone ?? ''}; đại diện: ${pax[0]!.fullName}; ${pax.length} khách`.slice(0, 500);
    const legs: Array<{ direction: Direction; pickupAt: Date; location: string }> = [
      { direction: 'TO_HOTEL', pickupAt: new Date(Math.max(now.getTime(), stayFrom.getTime())), location: o.pickupPoint ?? '' },
      { direction: 'TO_AIRPORT', pickupAt: stayTo, location: hotelPlace },
    ];
    for (const l of legs) {
      try {
        const id = await insertLeg(o, l, pax.length, note, now);
        if (id) await dispatchDelayRequest(id, pax, o.offerId, o.groupId);
      } catch (err) { logger.error({ err, offerId, direction: l.direction }, 'Tạo xe delay lỗi'); }
    }
  } catch (err) { logger.error({ err, offerId }, 'createDelayShuttles lỗi'); }
}

async function insertLeg(o: any, l: { direction: Direction; pickupAt: Date; location: string }, passengers: number, note: string, now: Date): Promise<string | undefined> {
  const free = new Set<string>(o.amenities).has('SHUTTLE_FREE') || new Set<string>(o.amenities).has('SHUTTLE');
  const p = await priceLeg(o.airports, { airport: o.airportIata, pickupAt: l.pickupAt }, now);
  return withTransaction(async (tx) => {
    // ON CONFLICT DO NOTHING: ràng buộc shuttle_one_active (booking, direction) chặn tạo lại khi đã có yêu cầu chưa hủy.
    const r = (await tx.query<{ id: string }>(
      `INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, location, note, price_vnd, config_version, passengers, billed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false) ON CONFLICT DO NOTHING RETURNING id`,
      [o.bookingId, o.hotelId, l.direction, o.airportIata, p.km, l.pickupAt, l.location || null, note, free ? 0 : p.priceVnd, p.configVersion, passengers])).rows[0];
    if (!r) return undefined;
    await logBookingEvent(tx, { bookingId: o.bookingId, hotelId: o.hotelId, actor: SYSTEM, type: 'SHUTTLE_REQUESTED', data: { requestId: r.id, direction: l.direction, airport: o.airportIata, pickupAt: l.pickupAt, passengers, delay: true } });
    return r.id;
  });
}

const PAX_COLS = 'p.id, p.pnr, p.full_name, p.age, p.category, p.special_needs';
const toDelayPax = (pax: PaxRow[]): DelayPax[] => pax.map((p) => ({ id: p.id, pnr: p.pnr, age: p.age, category: p.category, specialNeeds: p.specialNeeds ?? [], clusterId: 'one' }));
const seatsOf = (pax: PaxRow[]) => pax.filter((p) => p.category !== 'INFANT').length;

/**
 * Gộp vào chuyến xe nhà ĐÃ có của booking cùng nhóm (cùng KS, cùng chiều, giờ gần nhau, chưa lên xe) nếu cả cụm vẫn vừa đúng xe đó (ghế + ghế trẻ em).
 * Chỉ áp dụng khi cụm có trẻ em. Mỗi yêu cầu xe vẫn riêng theo booking (giá/số khách không đổi); chỉ thêm liên kết chuyến-booking và cộng ghế.
 */
async function tryJoinSiblingTrip(tx: Db, req: ShuttleRequestDoc, pax: PaxRow[], offerId: string, groupId: string): Promise<ShuttleEvent[] | undefined> {
  const cands = (await tx.query<{ id: string; vehicleId: string; seats: number; status: string; requestId: string; bookingId: string; vSeats: number; childSeats: number }>(
    `SELECT t.id, t.vehicle_id, t.seats, t.status, t.request_id, t.booking_id, v.seats AS v_seats, v.child_seats
     FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id JOIN delay_room_offers o ON o.booking_id = r.booking_id JOIN vehicles v ON v.id = t.vehicle_id
     WHERE o.group_id = $1 AND o.hotel_id = $2 AND o.id <> $3 AND o.status = 'CONFIRMED' AND r.direction = $4 AND r.status IN ('REQUESTED','ASSIGNED')
       AND t.kind = 'OWN' AND t.status IN ('OFFERED','ACCEPTED') AND abs(extract(epoch FROM (r.pickup_at - $5::timestamptz))) < $6 * 60
     ORDER BY t.seq FOR UPDATE OF t`,
    [groupId, req.hotelId, offerId, req.direction, req.pickupAt, env.SHUTTLE_VEHICLE_WINDOW_MIN])).rows;
  for (const c of cands) {
    const bookings = [c.bookingId, ...(await tripMembers(tx, c.id)).map((m) => m.bookingId)];
    const have = (await tx.query<PaxRow>(`SELECT ${PAX_COLS} FROM delay_flight_pax p WHERE p.id IN (SELECT unnest(o.pax_ids) FROM delay_room_offers o WHERE o.status = 'CONFIRMED' AND o.booking_id = ANY($1::uuid[]))`, [bookings])).rows;
    const plan = planDelayVehicles({ paxes: toDelayPax([...have, ...pax]), fleet: [{ id: c.vehicleId, seats: c.vSeats, childSeats: c.childSeats }] });
    if (plan.vehicles.length !== 1 || plan.external.length) continue;
    const mine = seatsOf(pax);
    await tx.query('INSERT INTO shuttle_trip_requests (trip_id, request_id, booking_id, seats) VALUES ($1,$2,$3,$4)', [c.id, req.id, req.bookingId, mine]);
    await tx.query('UPDATE shuttle_trips SET seats = seats + $2, updated_at = now() WHERE id = $1', [c.id, mine]);
    if (c.status === 'ACCEPTED') await tx.query("UPDATE shuttle_requests SET status = 'ASSIGNED', assigned_at = now(), updated_at = now() WHERE id = $1", [req.id]);
    const base = { hotelId: req.hotelId, tripId: c.id };
    await logBookingEvent(tx, { bookingId: req.bookingId, hotelId: req.hotelId, actor: SYSTEM, type: 'DELAY_CHILD_CLUSTER', data: { requestId: req.id, mode: 'JOIN_SIBLING_TRIP', tripId: c.id, vehicleId: c.vehicleId } });
    await logBookingEvent(tx, { bookingId: req.bookingId, hotelId: req.hotelId, actor: SYSTEM, type: 'TRIP_OFFERED', data: { tripId: c.id, vehicleId: c.vehicleId, seats: mine, shared: true } });
    return [
      { ...base, type: 'TRIP_OFFERED', bookingId: req.bookingId, requestId: req.id, audience: ['GUEST'], payload: { status: c.status, seats: mine } },
      { ...base, type: 'TRIP_REASSIGNED', bookingId: c.bookingId, requestId: c.requestId, audience: ['HOTEL', 'DRIVER'], payload: { status: c.status, seats: c.seats + mine } },
    ];
  }
  return undefined;
}

/**
 * Như dispatchRequest nhưng cụm có trẻ em không bao giờ bị tách (spec 6.6): dùng planDelayVehicles trên đội xe rảnh của KS
 * -> một xe nhà đủ ghế trẻ em (loại các xe khác khỏi allocateTrips) | không có -> loại hết xe, allocateTrips tạo MỘT chuyến NEEDS_EXTERNAL nguyên cụm.
 * Cụm là các offer cùng nhóm tại cùng KS (gia đình nhiều phòng = nhiều booking): offer sau gộp vào chuyến của offer trước nếu xe còn vừa (tryJoinSiblingTrip);
 * offer đầu chọn xe cho cả cụm (kể cả các offer anh em còn chờ xác nhận) nhưng chỉ ghi ghế của chính mình. Không trẻ em: allocateTrips nguyên bản (được dùng nhiều xe).
 */
async function dispatchDelayRequest(requestId: string, pax: PaxRow[], offerId: string, groupId: string): Promise<void> {
  const events = await withTransaction(async (tx) => {
    const req = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    if (!req || req.status !== 'REQUESTED') return [];
    if ((await tx.query('SELECT 1 FROM shuttle_trips WHERE request_id = $1 UNION ALL SELECT 1 FROM shuttle_trip_requests WHERE request_id = $1 LIMIT 1', [requestId])).rowCount > 0) return [];
    // Anh em còn chờ xác nhận (cùng nhóm, cùng KS): giữ chỗ trong kế hoạch xe. Chỉ khi có pax_ids (nhóm nhiều phòng).
    const pending = (await tx.query<PaxRow>(
      `SELECT ${PAX_COLS} FROM delay_flight_pax p WHERE p.id IN (SELECT unnest(o.pax_ids) FROM delay_room_offers o WHERE o.group_id = $1 AND o.hotel_id = $2 AND o.id <> $3 AND o.status = 'PENDING')`,
      [groupId, req.hotelId, offerId])).rows;
    const confirmedSibs = (await tx.query<PaxRow>(
      `SELECT ${PAX_COLS} FROM delay_flight_pax p WHERE p.id IN (SELECT unnest(o.pax_ids) FROM delay_room_offers o WHERE o.group_id = $1 AND o.hotel_id = $2 AND o.id <> $3 AND o.status = 'CONFIRMED')`,
      [groupId, req.hotelId, offerId])).rows;
    const hasChild = [...pax, ...pending, ...confirmedSibs].some((p) => p.category !== 'ADULT');
    if (!hasChild) return (await allocateTrips(tx, req, req.passengers, [], SYSTEM)).events;
    await tx.query('SELECT 1 FROM vehicles WHERE hotel_id = $1 FOR UPDATE', [req.hotelId]); // khóa trước khi đọc đội xe để quyết định không bị đua
    const joined = await tryJoinSiblingTrip(tx, req, pax, offerId, groupId);
    if (joined) return joined;
    const fleet = (await loadFleetAt(tx, req.hotelId, new Date(req.pickupAt))).filter(isFree);
    const childSeats = new Map((await tx.query<{ id: string; childSeats: number }>('SELECT id, child_seats FROM vehicles WHERE hotel_id = $1', [req.hotelId])).rows.map((v) => [v.id, v.childSeats]));
    const planFor = (ps: PaxRow[]) => planDelayVehicles({ paxes: toDelayPax(ps), fleet: fleet.map((v) => ({ id: v.id, seats: v.seats, childSeats: childSeats.get(v.id) ?? 0 })) });
    const single = (p: ReturnType<typeof planFor>) => (p.vehicles.length === 1 && !p.external.length ? p.vehicles[0]! : undefined);
    let plan = planFor([...pax, ...pending]);
    let one = single(plan);
    if (!one && pending.length) { plan = planFor(pax); one = single(plan); } // cả cụm không vừa một xe: quay về chỉ phần của offer này
    const exclude = fleet.map((v) => v.id).filter((id) => id !== one?.vehicleId);
    await logBookingEvent(tx, { bookingId: req.bookingId, hotelId: req.hotelId, actor: SYSTEM, type: 'DELAY_CHILD_CLUSTER', data: { requestId, mode: one ? 'ONE_OWN_VEHICLE' : 'EXTERNAL_WHOLE_CLUSTER', vehicleId: one?.vehicleId, warnings: plan.warnings.map((w) => w.code) } });
    return (await allocateTrips(tx, req, one ? Math.max(1, seatsOf(pax)) : req.passengers, exclude, SYSTEM)).events;
  });
  publishAll(events);
}
