import type { AuthContext } from '../../lib/jwt';
import { db } from '../../database/pg';
import type { DelayFlightPaxDoc, FlightDoc } from '../../database/types';
import { AppError } from '../../lib/errors';

/** Phạm vi dữ liệu của nhân viên đơn vị chi trả: luôn khóa theo payer_id của tài khoản (và trạm nếu tài khoản bị khóa theo trạm). */
export function payerScope(auth: AuthContext): { payerId: string; stationId: string | null } {
  if (!auth.payerId) throw new AppError(403, 'FORBIDDEN', 'Chỉ dành cho tài khoản đơn vị chi trả');
  return { payerId: auth.payerId, stationId: auth.payerStationId ?? null };
}

const iso = (d: Date | undefined | null): string | null => (d ? new Date(d).toISOString() : null);
const SEL = "f.id, f.seq, f.code, f.airline, f.origin, f.dest, f.sched_dep, f.new_dep, f.status, f.cause, f.simulated, to_char(f.flight_date, 'YYYY-MM-DD') AS flight_date";

const flightView = (f: FlightDoc) => ({
  id: f.id, seq: f.seq, code: f.code, airline: f.airline, origin: f.origin, dest: f.dest ?? null, flightDate: f.flightDate,
  scheduledDepartureAt: iso(f.schedDep)!, newDepartureAt: iso(f.newDep), status: f.status, cause: f.cause, simulated: f.simulated,
  delayMinutes: f.newDep ? Math.round((new Date(f.newDep).getTime() - new Date(f.schedDep).getTime()) / 60_000) : null,
});

/** Chuyến DELAYED có hành khách của đơn vị (trong phạm vi trạm của tài khoản). Keyset theo seq giảm dần. */
export async function listPayerFlights(auth: AuthContext, q: { limit: number; cursor?: number }) {
  const { payerId, stationId } = payerScope(auth);
  const params: unknown[] = [payerId, stationId];
  let cur = '';
  if (q.cursor !== undefined) cur = `AND f.seq < $${params.push(q.cursor)}`;
  const rows = (
    await db.query<FlightDoc & { paxCount: number; groupCount: number }>(
      `SELECT ${SEL}, p.pax_count, p.group_count FROM flights f
       JOIN (SELECT flight_id, count(*) AS pax_count, count(DISTINCT pnr) AS group_count FROM delay_flight_pax WHERE payer_id = $1 AND ($2::uuid IS NULL OR station_id = $2) GROUP BY flight_id) p ON p.flight_id = f.id
       WHERE f.status = 'DELAYED' ${cur} ORDER BY f.seq DESC LIMIT ${q.limit + 1}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, q.limit);
  return { items: items.map((r) => ({ ...flightView(r), paxCount: r.paxCount, groupCount: r.groupCount })), nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

/** Hành khách của một chuyến, gom theo PNR. Chuyến không có hành khách của đơn vị này (hoặc ngoài trạm) -> 404 như không tồn tại. */
export async function listPayerFlightPassengers(auth: AuthContext, flightId: string) {
  const { payerId, stationId } = payerScope(auth);
  const pax = (
    await db.query<DelayFlightPaxDoc & { roomConfirmed: boolean }>(
      `SELECT p.*, EXISTS (SELECT 1 FROM delay_room_offers o WHERE o.status = 'CONFIRMED' AND (CASE WHEN cardinality(o.pax_ids) > 0 THEN p.id = ANY(o.pax_ids) ELSE o.group_id = p.group_id END)) AS room_confirmed
       FROM delay_flight_pax p WHERE p.flight_id = $1 AND p.payer_id = $2 AND ($3::uuid IS NULL OR p.station_id = $3) ORDER BY p.is_representative DESC, p.seq`,
      [flightId, payerId, stationId],
    )
  ).rows;
  if (!pax.length) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay');
  const f = (await db.query<FlightDoc>(`SELECT ${SEL} FROM flights f WHERE f.id = $1`, [flightId])).rows[0]!;
  const byPnr = new Map<string, (DelayFlightPaxDoc & { roomConfirmed: boolean })[]>();
  for (const p of pax) byPnr.set(p.pnr, [...(byPnr.get(p.pnr) ?? []), p]);
  const n = (list: DelayFlightPaxDoc[], c: string) => list.filter((p) => p.category === c).length;
  const groups = [...byPnr].map(([pnr, list]) => ({
    pnr, counts: { adult: n(list, 'ADULT'), child: n(list, 'CHILD'), infant: n(list, 'INFANT'), total: list.length },
    passengers: list.map((p) => ({ id: p.id, pnr: p.pnr, fullName: p.fullName, age: p.age, category: p.category, isRepresentative: p.isRepresentative, email: p.contactEmail ?? p.email ?? null, phone: p.contactPhone ?? p.phone ?? null, specialNeeds: p.specialNeeds, simulated: p.simulated, roomConfirmed: p.roomConfirmed })),
  }));
  return { flight: flightView(f), total: pax.length, groups };
}
