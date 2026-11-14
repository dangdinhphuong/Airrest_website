// Xe đón (sân bay -> KS) và xe về (KS -> sân bay) cho đơn PAYER sau khi KS xác nhận (spec 6.6, GĐ3).
// Mỗi booking PAYER = MỘT yêu cầu xe cho cả đơn vị (không gom nhiều đơn vào một xe). Điều phối dùng lại allocateTrips của khách lẻ (dispatch.ts không đổi).
// Giá ghi ở shuttle_requests.price_vnd (billed=false): KHÔNG vào bookings.pricing/paid, không thu khách. GĐ5 lấy chi phí xe = SUM(price_vnd) các yêu cầu status <> 'CANCELLED' theo booking_id/batch_id.
import type { PaxCategory } from '@airrest/shared-types';
import { db, withTransaction } from '../../database/pg';
import type { Actor, ShuttleRequestDoc } from '../../database/types';
import { logger } from '../../lib/logger';
import { logBookingEvent } from '../bookings/bookingEvents';
import { allocateTrips, isFree, loadFleetAt } from '../shuttle/dispatch';
import { publishAll } from '../shuttle/events';
import { priceLeg } from '../shuttle/pricing';
import { planDelayVehicles, type DelayPax } from './vehicles/plan';

const SYSTEM: Actor = { type: 'SYSTEM' };
type Direction = 'TO_HOTEL' | 'TO_AIRPORT';
interface PaxRow { id: string; pnr: string; fullName: string; age: number; category: PaxCategory; specialNeeds: string[] | null }

/** Tạo (idempotent) + điều phối 2 yêu cầu xe của một offer CONFIRMED. Không bao giờ ném lỗi. */
export async function createDelayShuttles(offerId: string): Promise<void> {
  try {
    const o = (await db.query<any>(
      `SELECT o.group_id, o.pax_ids, o.booking_id, o.hotel_id, b.stay, b.status AS booking_status, b.guest, bt.pickup_point, s.airport_iata,
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
        if (id) await dispatchDelayRequest(id, pax);
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

/**
 * Như dispatchRequest nhưng cụm có trẻ em không bao giờ bị tách (spec 6.6): dùng planDelayVehicles trên đội xe rảnh của KS
 * -> một xe nhà đủ ghế trẻ em (loại các xe khác khỏi allocateTrips) | không có -> loại hết xe, allocateTrips tạo MỘT chuyến NEEDS_EXTERNAL nguyên cụm.
 * Cụm không trẻ em: allocateTrips nguyên bản (được dùng nhiều xe).
 */
async function dispatchDelayRequest(requestId: string, pax: PaxRow[]): Promise<void> {
  const events = await withTransaction(async (tx) => {
    const req = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    if (!req || req.status !== 'REQUESTED') return [];
    if ((await tx.query('SELECT 1 FROM shuttle_trips WHERE request_id = $1 LIMIT 1', [requestId])).rowCount > 0) return [];
    const hasChild = pax.some((p) => p.category !== 'ADULT');
    if (!hasChild) return (await allocateTrips(tx, req, req.passengers, [], SYSTEM)).events;
    await tx.query('SELECT 1 FROM vehicles WHERE hotel_id = $1 FOR UPDATE', [req.hotelId]); // khóa trước khi đọc đội xe để quyết định không bị đua
    const fleet = (await loadFleetAt(tx, req.hotelId, new Date(req.pickupAt))).filter(isFree);
    const childSeats = new Map((await tx.query<{ id: string; childSeats: number }>('SELECT id, child_seats FROM vehicles WHERE hotel_id = $1', [req.hotelId])).rows.map((v) => [v.id, v.childSeats]));
    const paxes: DelayPax[] = pax.map((p) => ({ id: p.id, pnr: p.pnr, age: p.age, category: p.category, specialNeeds: p.specialNeeds ?? [], clusterId: 'one' }));
    const plan = planDelayVehicles({ paxes, fleet: fleet.map((v) => ({ id: v.id, seats: v.seats, childSeats: childSeats.get(v.id) ?? 0 })) });
    const one = plan.vehicles.length === 1 && !plan.external.length ? plan.vehicles[0]! : undefined;
    const exclude = fleet.map((v) => v.id).filter((id) => id !== one?.vehicleId);
    await logBookingEvent(tx, { bookingId: req.bookingId, hotelId: req.hotelId, actor: SYSTEM, type: 'DELAY_CHILD_CLUSTER', data: { requestId, mode: one ? 'ONE_OWN_VEHICLE' : 'EXTERNAL_WHOLE_CLUSTER', vehicleId: one?.vehicleId, warnings: plan.warnings.map((w) => w.code) } });
    return (await allocateTrips(tx, req, one ? Math.max(1, one.seatsUsed) : req.passengers, exclude, SYSTEM)).events;
  });
  publishAll(events);
}
