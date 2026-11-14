import { env } from '../../config/env';
import { db, withTransaction, type Db } from '../../database/pg';
import type { Actor, ShuttleRequestDoc, ShuttleTripDoc } from '../../database/types';
import { logger } from '../../lib/logger';
import { writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { publishAll, type ShuttleEvent } from './events';

const SYSTEM: Actor = { type: 'SYSTEM' };
// Chuyến còn "giữ" xe và tài xế (xe không được điều thêm chuyến trùng giờ).
export const BUSY_STATUSES = ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD'] as const;

// ---------- Hàm THUẦN: chọn xe ----------
export interface PlanVehicle { id: string; seats: number }
export interface PlanResult { assignments: { vehicleId: string; seats: number }[]; remaining: number }

/**
 * Ít xe nhất đủ chỗ. Một xe đủ chỗ: lấy xe nhỏ nhất đủ. Không: lấy xe lớn trước đến khi đủ, rồi thu nhỏ xe cuối
 * (thay bằng xe nhỏ nhất còn lại vẫn đủ phần dư). Hết xe vẫn thiếu: dùng hết xe, `remaining` > 0 (phần chuyển xe ngoài).
 * `seats` trong kết quả là số KHÁCH xe đó chở (không phải sức chứa).
 */
export function planVehicles(passengers: number, freeVehicles: PlanVehicle[]): PlanResult {
  const need = Math.max(0, Math.floor(passengers));
  if (need === 0) return { assignments: [], remaining: 0 };
  const asc = [...freeVehicles].sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id));
  const single = asc.find((v) => v.seats >= need);
  if (single) return { assignments: [{ vehicleId: single.id, seats: need }], remaining: 0 };

  const pool = [...asc].reverse();
  const picked: PlanVehicle[] = [];
  let cap = 0;
  while (pool.length && cap < need) {
    const v = pool.shift()!;
    picked.push(v);
    cap += v.seats;
  }
  if (cap < need) return { assignments: picked.map((v) => ({ vehicleId: v.id, seats: v.seats })), remaining: need - cap };
  const last = picked.pop()!;
  const rest = need - picked.reduce((s, v) => s + v.seats, 0);
  picked.push([last, ...pool].filter((v) => v.seats >= rest).sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id))[0]!);
  let left = need;
  return { assignments: picked.map((v) => { const seats = Math.min(v.seats, left); left -= seats; return { vehicleId: v.id, seats }; }), remaining: 0 };
}

// ---------- Xe rảnh ----------
export interface FleetVehicle {
  id: string; plate: string; seats: number; model?: string; active: boolean;
  driverAccountId?: string; driverActive?: boolean; driverName?: string; driverPhone?: string; busy: boolean;
}

/** Toàn bộ xe của khách sạn kèm cờ `busy` tại giờ `at` (có chuyến khác lệch giờ đón < SHUTTLE_VEHICLE_WINDOW_MIN). `excludeTripId`: bỏ chuyến đang xét. */
export async function loadFleetAt(tx: Db, hotelId: string, at: Date, excludeTripId?: string): Promise<FleetVehicle[]> {
  return (
    await tx.query<FleetVehicle>(
      `SELECT v.id, v.plate, v.seats, v.model, v.active, v.driver_account_id, d.active AS driver_active, d.full_name AS driver_name, d.phone AS driver_phone,
         EXISTS (SELECT 1 FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id
                 WHERE t.vehicle_id = v.id AND t.status = ANY($2::text[]) AND ($4::uuid IS NULL OR t.id <> $4)
                   AND abs(extract(epoch FROM (r.pickup_at - $3::timestamptz))) < $5 * 60) AS busy
       FROM vehicles v LEFT JOIN hotel_drivers d ON d.account_id = v.driver_account_id
       WHERE v.hotel_id = $1 ORDER BY v.seats, v.plate`,
      [hotelId, [...BUSY_STATUSES], at, excludeTripId ?? null, env.SHUTTLE_VEHICLE_WINDOW_MIN],
    )
  ).rows;
}
export const isFree = (v: FleetVehicle): boolean => v.active && !!v.driverAccountId && !!v.driverActive && !v.busy;

// ---------- Điều phối ----------
export interface AllocateResult { trips: ShuttleTripDoc[]; events: ShuttleEvent[] }

/**
 * Tạo chuyến cho `pax` khách của yêu cầu: xe OWN (OFFERED) cho phần xe rảnh chở được, phần còn lại MỘT chuyến EXTERNAL NEEDS_EXTERNAL.
 * Gọi trong transaction đã khóa yêu cầu. Khóa các xe của khách sạn để hai lần điều phối đồng thời không chọn trùng một xe.
 */
export async function allocateTrips(tx: Db, req: ShuttleRequestDoc, pax: number, excludeVehicleIds: string[], actor: Actor): Promise<AllocateResult> {
  await tx.query('SELECT 1 FROM vehicles WHERE hotel_id = $1 FOR UPDATE', [req.hotelId]);
  const fleet = await loadFleetAt(tx, req.hotelId, new Date(req.pickupAt));
  const free = fleet.filter((v) => isFree(v) && !excludeVehicleIds.includes(v.id));
  const plan = planVehicles(pax, free);
  const trips: ShuttleTripDoc[] = [];
  const events: ShuttleEvent[] = [];
  const base = { hotelId: req.hotelId, bookingId: req.bookingId, requestId: req.id };

  for (const a of plan.assignments) {
    const v = fleet.find((x) => x.id === a.vehicleId)!;
    const t = (
      await tx.query<ShuttleTripDoc>(
        `INSERT INTO shuttle_trips (request_id, booking_id, hotel_id, kind, vehicle_id, driver_account_id, seats, status, offered_at)
         VALUES ($1,$2,$3,'OWN',$4,$5,$6,'OFFERED', now()) RETURNING *`,
        [req.id, req.bookingId, req.hotelId, v.id, v.driverAccountId, a.seats],
      )
    ).rows[0]!;
    trips.push(t);
    await logBookingEvent(tx, { ...base, actor, type: 'TRIP_OFFERED', data: { tripId: t.id, vehicleId: v.id, plate: v.plate, seats: a.seats, passengers: pax } });
    events.push({ ...base, type: 'TRIP_OFFERED', tripId: t.id, audience: ['DRIVER', 'HOTEL', 'GUEST'], driverAccountId: v.driverAccountId, payload: { status: 'OFFERED', seats: a.seats } });
  }
  if (plan.remaining > 0) {
    const t = (
      await tx.query<ShuttleTripDoc>(
        `INSERT INTO shuttle_trips (request_id, booking_id, hotel_id, kind, seats, status, external_reason) VALUES ($1,$2,$3,'EXTERNAL',$4,'NEEDS_EXTERNAL','NO_FREE_VEHICLE') RETURNING *`,
        [req.id, req.bookingId, req.hotelId, plan.remaining],
      )
    ).rows[0]!;
    trips.push(t);
    await logBookingEvent(tx, { ...base, actor, type: 'EXTERNAL_NEEDED', data: { tripId: t.id, seats: plan.remaining, reason: 'NO_FREE_VEHICLE', passengers: pax, ownVehicles: plan.assignments.length } });
    events.push({ ...base, type: 'EXTERNAL_NEEDED', tripId: t.id, audience: ['HOTEL', 'GUEST'], payload: { status: 'NEEDS_EXTERNAL', seats: plan.remaining } });
  }
  await writeAudit({ actor, action: 'SHUTTLE.DISPATCH', entity: { type: 'shuttle', id: req.id }, hotelId: req.hotelId, bookingId: req.bookingId, after: { passengers: pax, own: plan.assignments, externalSeats: plan.remaining } }, tx);
  return { trips, events };
}

export type DispatchOutcome = { dispatched: true; trips: ShuttleTripDoc[] } | { dispatched: false; reason: 'NOT_FOUND' | 'NOT_REQUESTED' | 'ALREADY_DISPATCHED' | 'BOOKING_NOT_ELIGIBLE' };

/** Điều phối một yêu cầu (bỏ qua nếu đã điều hoặc đơn chưa CONFIRMED/CHECKED_IN). Idempotent: gọi lặp/đồng thời chỉ điều một lần. */
export async function dispatchRequest(requestId: string, actor: Actor = SYSTEM): Promise<DispatchOutcome> {
  const out = await withTransaction<{ o: DispatchOutcome; events: ShuttleEvent[] }>(async (tx) => {
    const req = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    const no = (reason: Extract<DispatchOutcome, { dispatched: false }>['reason']) => ({ o: { dispatched: false, reason } as DispatchOutcome, events: [] });
    if (!req) return no('NOT_FOUND');
    if (req.status !== 'REQUESTED') return no('NOT_REQUESTED');
    if ((await tx.query('SELECT 1 FROM shuttle_trips WHERE request_id = $1 LIMIT 1', [requestId])).rowCount > 0) return no('ALREADY_DISPATCHED');
    const b = (await tx.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [req.bookingId])).rows[0];
    if (!b || !['CONFIRMED', 'CHECKED_IN'].includes(b.status)) return no('BOOKING_NOT_ELIGIBLE');
    const r = await allocateTrips(tx, req, req.passengers, [], actor);
    return { o: { dispatched: true, trips: r.trips }, events: r.events };
  });
  publishAll(out.events);
  return out.o;
}

const dispatchQuietly = (id: string) => dispatchRequest(id).catch((err) => logger.error({ err, requestId: id }, 'Điều phối xe lỗi (bỏ qua, vòng quét sẽ thử lại)'));

/** Hook sau khi đơn được xác nhận/thanh toán xong: điều phối các yêu cầu của đơn đã tới hạn (còn <= SHUTTLE_DISPATCH_LEAD_MIN tới giờ đón). Không bao giờ ném lỗi. */
export async function dispatchDueForBooking(bookingId: string, now = new Date()): Promise<void> {
  try {
    const ids = (await db.query<{ id: string }>(DUE_SQL + ' AND booking_id = $3 ORDER BY pickup_at', [dueFrom(now), dueTo(now), bookingId])).rows;
    for (const r of ids) await dispatchQuietly(r.id);
  } catch (err) {
    logger.error({ err, bookingId }, 'dispatchDueForBooking lỗi');
  }
}

// Yêu cầu REQUESTED chưa có chuyến nào, giờ đón - LEAD <= now, và chưa quá cũ (giờ đón > now - cửa sổ xe) để không điều xe cho yêu cầu đã trôi qua.
const DUE_SQL = `SELECT id FROM shuttle_requests s WHERE status = 'REQUESTED' AND pickup_at <= $1 AND pickup_at > $2 AND NOT EXISTS (SELECT 1 FROM shuttle_trips t WHERE t.request_id = s.id)
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = s.booking_id AND b.status IN ('CONFIRMED','CHECKED_IN'))`;
const dueFrom = (now: Date) => new Date(now.getTime() + env.SHUTTLE_DISPATCH_LEAD_MIN * 60_000);
const dueTo = (now: Date) => new Date(now.getTime() - env.SHUTTLE_VEHICLE_WINDOW_MIN * 60_000);

/** Vòng quét định kỳ (server.ts). Nhiều tiến trình cùng quét vẫn an toàn: dispatchRequest khóa yêu cầu và kiểm tra đã điều. */
export async function dispatchDueRequests(now = new Date()): Promise<{ dispatched: number }> {
  const due = (await db.query<{ id: string }>(`${DUE_SQL} ORDER BY pickup_at LIMIT 100`, [dueFrom(now), dueTo(now)])).rows;
  let dispatched = 0;
  for (const r of due) if ((await dispatchQuietly(r.id))?.dispatched) dispatched++;
  return { dispatched };
}
