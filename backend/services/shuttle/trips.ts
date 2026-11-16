import type { BoardQuery, DriverTripsQuery, ExternalTripBody } from '@airrest/validation';
import { env } from '../../config/env';
import { db, withTransaction, type Db } from '../../database/pg';
import type { Actor, ShuttleRequestDoc, ShuttleTripDoc, TripStatus } from '../../database/types';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { AuthContext } from '../../lib/jwt';
import { publicUrl } from '../../lib/storage';
import { actorOf, writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { hotelScope } from '../scope';
import { allocateTrips, isFree, loadFleetAt } from './dispatch';
import { publishAll, type ShuttleEvent } from './events';
import { mirrorToMembers, tripMembers } from './members';
import { validateShareUrl } from './externalLink';
import { simFields } from './route';

// ---------- View ----------
const CTX = `SELECT t.*, r.direction, r.airport_iata, r.pickup_at, r.location, r.note, r.passengers, r.status AS request_status,
    b.code AS booking_code, b.guest, b.hotel_snapshot, v.plate, v.seats AS vehicle_seats, v.model, d.full_name AS driver_name, d.phone AS driver_phone, d.photo_key,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('requestId', l.request_id, 'bookingCode', mb.code, 'fullName', mb.guest->>'fullName', 'phone', mb.guest->>'phone', 'seats', l.seats, 'passengers', mr.passengers) ORDER BY l.created_at, l.request_id), '[]'::jsonb)
       FROM shuttle_trip_requests l JOIN bookings mb ON mb.id = l.booking_id JOIN shuttle_requests mr ON mr.id = l.request_id WHERE l.trip_id = t.id) AS members
  FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id JOIN bookings b ON b.id = t.booking_id
  LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN hotel_drivers d ON d.account_id = t.driver_account_id`;
export const photoUrlOf = (key?: string): string | null => (key ? (publicUrl(key) ?? null) : null);

const sumOf = (m: Array<Record<string, number>> | undefined, k: string): number => (m ?? []).reduce((s, x) => s + (x[k] ?? 0), 0);

/** Chuyến cho nhân sự khách sạn (đầy đủ). NEEDS_EXTERNAL kèm hạn xử lý + cờ quá hạn. */
export function staffTripView(r: any, now = new Date()) {
  const deadlineAt = r.status === 'NEEDS_EXTERNAL' ? new Date(r.pickupAt) : undefined;
  return {
    id: r.id, requestId: r.requestId, bookingId: r.bookingId, bookingCode: r.bookingCode, kind: r.kind, status: r.status, seats: r.seats, passengers: r.passengers + sumOf(r.members, 'passengers'), members: r.members ?? [],
    direction: r.direction, airport: r.airportIata, pickupAt: r.pickupAt, location: r.location ?? null, note: r.note ?? null,
    guest: r.guest ? { fullName: r.guest.fullName, phone: r.guest.phone, count: r.guest.count ?? 1 } : undefined,
    vehicle: r.vehicleId ? { id: r.vehicleId, plate: r.plate, seats: r.vehicleSeats, model: r.model ?? null } : null,
    driver: r.driverAccountId ? { accountId: r.driverAccountId, name: r.driverName, phone: r.driverPhone, photoUrl: photoUrlOf(r.photoKey) } : null,
    external: r.kind === 'EXTERNAL' ? { simulated: !!r.simulated, provider: r.provider ?? null, shareUrl: r.shareUrl ?? null, driverName: r.extDriverName ?? null, plate: r.extPlate ?? null, phone: r.extPhone ?? null, reason: r.externalReason ?? null, etaAt: r.extEtaAt ?? null } : null,
    times: { offeredAt: r.offeredAt ?? null, acceptedAt: r.acceptedAt ?? null, enRouteAt: r.enRouteAt ?? null, arrivedAt: r.arrivedAt ?? null, onboardAt: r.onboardAt ?? null, droppedOffAt: r.droppedOffAt ?? null, cancelledAt: r.cancelledAt ?? null, rejectedAt: r.rejectedAt ?? null },
    rejectReason: r.rejectReason ?? null,
    ...simFields(r),
    ...(deadlineAt && { deadlineAt, overdue: now.getTime() >= deadlineAt.getTime() - env.SHUTTLE_EXTERNAL_OVERDUE_MIN * 60_000 }),
  };
}

/** Chuyến cho tài xế: chỉ thông tin cần để đón khách. */
const driverTripView = (r: any) => ({
  id: r.id, status: r.status, seats: r.seats, bookingCode: r.bookingCode,
  vehicle: { plate: r.plate, seats: r.vehicleSeats, model: r.model ?? null },
  request: { id: r.requestId, direction: r.direction, airport: r.airportIata, pickupAt: r.pickupAt, passengers: r.passengers + sumOf(r.members, 'passengers'), note: r.note ?? null },
  members: (r.members ?? []).map((m: any) => ({ bookingCode: m.bookingCode, fullName: m.fullName, phone: m.phone, seats: m.seats, passengers: m.passengers })),
  pickup: r.direction === 'TO_HOTEL' ? (r.location ?? `Sân bay ${r.airportIata}`) : (r.location ?? r.hotelSnapshot?.name),
  dropoff: r.direction === 'TO_HOTEL' ? r.hotelSnapshot?.name : `Sân bay ${r.airportIata}`,
  guest: { fullName: r.guest?.fullName, phone: r.guest?.phone, count: r.guest?.count ?? 1 },
  acceptedAt: r.acceptedAt ?? null,
  ...simFields(r),
});

// ---------- Trạng thái ----------
/** Đồng bộ trạng thái yêu cầu theo các chuyến còn hiệu lực: mọi chuyến DROPPED_OFF -> DONE; mọi chuyến đã được nhận -> ASSIGNED; còn lại REQUESTED. */
async function syncRequest(tx: Db, requestId: string): Promise<void> {
  await syncOne(tx, requestId);
  // Yêu cầu của các booking thành viên đi theo trạng thái chuyến chung.
  for (const m of (await tx.query<{ requestId: string }>('SELECT l.request_id FROM shuttle_trip_requests l JOIN shuttle_trips t ON t.id = l.trip_id WHERE t.request_id = $1', [requestId])).rows) await syncOne(tx, m.requestId);
}
async function syncOne(tx: Db, requestId: string): Promise<void> {
  const st = (await tx.query<{ status: TripStatus }>("SELECT status FROM shuttle_trips t WHERE (t.request_id = $1 OR t.id IN (SELECT trip_id FROM shuttle_trip_requests WHERE request_id = $1)) AND t.status NOT IN ('CANCELLED','REJECTED')", [requestId])).rows.map((r) => r.status);
  if (!st.length) return;
  const next = st.every((s) => s === 'DROPPED_OFF') ? 'DONE' : st.every((s) => !['OFFERED', 'NEEDS_EXTERNAL'].includes(s)) ? 'ASSIGNED' : 'REQUESTED';
  await tx.query(
    `UPDATE shuttle_requests SET status = $2, assigned_at = CASE WHEN $2 = 'ASSIGNED' THEN coalesce(assigned_at, now()) ELSE assigned_at END,
       completed_at = CASE WHEN $2 = 'DONE' THEN now() ELSE completed_at END, updated_at = now() WHERE id = $1 AND status IN ('REQUESTED','ASSIGNED') AND status <> $2`,
    [requestId, next],
  );
}

type Step = 'accept' | 'reject' | 'start' | 'arrived' | 'onboard' | 'dropped-off';
const STEPS: Record<Step, { from: TripStatus[]; to: TripStatus; col: string }> = {
  accept: { from: ['OFFERED'], to: 'ACCEPTED', col: 'accepted_at' },
  reject: { from: ['OFFERED'], to: 'REJECTED', col: 'rejected_at' },
  start: { from: ['ACCEPTED'], to: 'EN_ROUTE', col: 'en_route_at' },
  arrived: { from: ['EN_ROUTE'], to: 'ARRIVED', col: 'arrived_at' },
  onboard: { from: ['ARRIVED'], to: 'ONBOARD', col: 'onboard_at' },
  'dropped-off': { from: ['ONBOARD'], to: 'DROPPED_OFF', col: 'dropped_off_at' },
};
const eventBase = (t: ShuttleTripDoc) => ({ hotelId: t.hotelId, bookingId: t.bookingId, requestId: t.requestId, tripId: t.id });

/**
 * Một bước chuyển trạng thái của chuyến. `who`: tài xế (chỉ chuyến OWN có driver_account_id = chính mình, đúng khách sạn) hoặc nhân sự (chỉ chuyến EXTERNAL).
 * Cập nhật CÓ ĐIỀU KIỆN trạng thái trong câu UPDATE nên hai lần bấm đồng thời chỉ một lần thắng (lần kia 409 INVALID_TRANSITION).
 * Không thấy chuyến trong phạm vi -> 404 TRIP_NOT_FOUND (không lộ chuyến của người/khách sạn khác).
 */
async function step(auth: AuthContext | undefined, who: 'driver' | 'staff' | 'system', tripId: string, s: Step, o: { reason?: string; requestId?: string } = {}) {
  const def = STEPS[s];
  const from = who !== 'driver' && s === 'arrived' ? (['ACCEPTED', 'EN_ROUTE'] as TripStatus[]) : def.from; // xe ngoài không có bước "bắt đầu đón"
  const actor: Actor = who === 'system' ? { type: 'SYSTEM' } : actorOf(auth);
  const scope = who === 'staff' ? hotelScope(auth!) : { hotelId: auth?.hotelId };
  const out = await withTransaction(async (tx) => {
    const own = who === 'driver' ? 'AND t.driver_account_id = $5 AND t.kind = \'OWN\'' : who === 'system' ? "AND (t.kind = 'OWN' OR t.simulated)" : "AND t.kind = 'EXTERNAL'";
    const params: unknown[] = [tripId, def.to, from, scope.hotelId ?? null, ...(who === 'driver' ? [auth!.sub] : [])];
    const t = (
      await tx.query<ShuttleTripDoc>(
        `UPDATE shuttle_trips t SET status = $2, ${def.col} = now(), ${s === 'reject' ? 'reject_reason = $6,' : ''} updated_at = now()
         WHERE t.id = $1 AND t.status = ANY($3::text[]) AND ($4::uuid IS NULL OR t.hotel_id = $4) ${own} RETURNING *`,
        s === 'reject' ? [...params, o.reason ?? null] : params,
      )
    ).rows[0];
    if (!t) {
      const seen = (await tx.query<{ kind: string }>('SELECT kind FROM shuttle_trips t WHERE t.id = $1 AND ($2::uuid IS NULL OR t.hotel_id = $2)' + (who === 'driver' ? ' AND t.driver_account_id = $3' : ''), who === 'driver' ? [tripId, scope.hotelId ?? null, auth!.sub] : [tripId, scope.hotelId ?? null])).rows[0];
      if (!seen) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến');
      if (who === 'staff' && seen.kind !== 'EXTERNAL') throw new AppError(409, 'NOT_EXTERNAL_TRIP', 'Chuyến xe của khách sạn do tài xế thao tác');
      throw new AppError(409, 'INVALID_TRANSITION', `Không thể chuyển sang ${def.to} từ trạng thái hiện tại`);
    }
    await tx.query('SELECT 1 FROM shuttle_requests WHERE id = $1 FOR UPDATE', [t.requestId]);
    await syncRequest(tx, t.requestId);
    const info = t.vehicleId ? (await tx.query<{ plate: string }>('SELECT plate FROM vehicles WHERE id = $1', [t.vehicleId])).rows[0] : undefined;
    await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: `TRIP_${def.to}`, data: { tripId: t.id, kind: t.kind, seats: t.seats, ...(info && { plate: info.plate }), ...(o.reason && { reason: o.reason }) } });
    await writeAudit({ actor, action: `TRIP.${def.to}`, entity: { type: 'shuttle_trip', id: t.id }, hotelId: t.hotelId, bookingId: t.bookingId, before: { status: from.length === 1 ? from[0] : undefined }, after: { status: def.to }, reasonNote: o.reason, requestId: o.requestId }, tx);
    const events: ShuttleEvent[] = [{ ...eventBase(t), type: `TRIP_${def.to}`, audience: ['GUEST', 'HOTEL', 'DRIVER'], driverAccountId: t.driverAccountId, payload: { status: def.to, seats: t.seats } }];
    const members = await tripMembers(tx, t.id);
    if (s !== 'reject') events.push(...(await mirrorToMembers(tx, t, actor, `TRIP_${def.to}`, { tripId: t.id, kind: t.kind, ...(info && { plate: info.plate }) }, { status: def.to })));
    if (s === 'reject') {
      // Xe/tài xế từ chối: loại các xe đã từ chối yêu cầu này rồi điều lại phần còn thiếu (hết xe -> chuyến EXTERNAL).
      const req = (await tx.query<ShuttleRequestDoc>("SELECT * FROM shuttle_requests WHERE id = $1 AND status IN ('REQUESTED','ASSIGNED')", [t.requestId])).rows[0];
      if (req) {
        const excluded = (await tx.query<{ vehicleId: string }>("SELECT vehicle_id FROM shuttle_trips WHERE request_id = $1 AND status = 'REJECTED' AND vehicle_id IS NOT NULL", [t.requestId])).rows.map((r) => r.vehicleId);
        // Chuyến chung bị từ chối: mỗi booking được điều lại riêng phần ghế của mình (gỡ liên kết trước), loại các xe đã từ chối.
        await tx.query('DELETE FROM shuttle_trip_requests WHERE trip_id = $1', [t.id]);
        const own = Math.max(1, t.seats - members.reduce((n, m) => n + m.seats, 0));
        events.push(...(await allocateTrips(tx, req, own, excluded, actor)).events);
        await syncRequest(tx, t.requestId);
        for (const m of members) {
          const mr = (await tx.query<ShuttleRequestDoc>("SELECT * FROM shuttle_requests WHERE id = $1 AND status IN ('REQUESTED','ASSIGNED') FOR UPDATE", [m.requestId])).rows[0];
          if (mr) { events.push(...(await allocateTrips(tx, mr, Math.max(1, m.seats), excluded, actor)).events); await syncRequest(tx, m.requestId); }
        }
      }
    }
    if (def.to === 'DROPPED_OFF') {
      const done = (await tx.query<{ status: string }>('SELECT status FROM shuttle_requests WHERE id = $1', [t.requestId])).rows[0];
      if (done?.status === 'DONE') await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: 'SHUTTLE_DONE', data: { requestId: t.requestId } });
      for (const m of members) {
        const md = (await tx.query<{ status: string }>('SELECT status FROM shuttle_requests WHERE id = $1', [m.requestId])).rows[0];
        if (md?.status === 'DONE') await logBookingEvent(tx, { bookingId: m.bookingId, hotelId: t.hotelId, actor, type: 'SHUTTLE_DONE', data: { requestId: m.requestId } });
      }
    }
    return { t, events };
  });
  publishAll(out.events);
  return { trip: out.t };
}

export const driverStep = (auth: AuthContext, tripId: string, s: Step, o: { reason?: string; requestId?: string } = {}) => step(auth, 'driver', tripId, s, o);
/** Mô phỏng tự chuyển trạng thái (SHUTTLE_SIM_AUTO; chuyến OWN hoặc chuyến EXTERNAL có cờ simulated): CÙNG đường đi với tài xế (transaction, booking_events actor SYSTEM, publish). Bấm tay thắng: trạng thái đã đổi -> 409 INVALID_TRANSITION. */
export const systemStep = (tripId: string, s: Extract<Step, 'start' | 'arrived' | 'onboard' | 'dropped-off'>) => step(undefined, 'system', tripId, s);
export const staffStep = (auth: AuthContext, tripId: string, s: Extract<Step, 'arrived' | 'onboard' | 'dropped-off'>, requestId?: string) => step(auth, 'staff', tripId, s, { requestId });

// ---------- Đóng chuyến không thành (không đổi billing/hoàn tiền) ----------
export const NO_SHOW_NOTE = 'no_show'; // khách không có mặt tại điểm đón
export const AUTO_CLOSED_NOTE = 'auto_expired'; // vòng quét đóng chuyến quá hạn

/** Sau khi một chuyến vừa bị CANCELLED (trong transaction): ghi nhật ký/audit/sự kiện; hết chuyến còn hiệu lực thì đóng luôn yêu cầu (CANCELLED), không thì đồng bộ trạng thái. */
async function afterTripClosed(tx: Db, t: ShuttleTripDoc, actor: Actor, note: string, requestId?: string): Promise<ShuttleEvent[]> {
  await tx.query('SELECT 1 FROM shuttle_requests WHERE id = $1 FOR UPDATE', [t.requestId]);
  await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: 'TRIP_CANCELLED', data: { tripId: t.id, seats: t.seats, note } });
  await writeAudit({ actor, action: 'TRIP.CANCEL', entity: { type: 'shuttle_trip', id: t.id }, hotelId: t.hotelId, bookingId: t.bookingId, reasonNote: note, requestId }, tx);
  const events: ShuttleEvent[] = [{ ...eventBase(t), type: 'TRIP_CANCELLED', audience: ['GUEST', 'HOTEL', 'DRIVER'], driverAccountId: t.driverAccountId, payload: { status: 'CANCELLED', reason: note } }];
  // Chuyến chung nhiều booking: khách của các booking thành viên cùng thấy chuyến bị hủy; yêu cầu của họ đóng theo cùng quy tắc.
  events.push(...(await mirrorToMembers(tx, t, actor, 'TRIP_CANCELLED', { tripId: t.id, seats: t.seats, note }, { status: 'CANCELLED', reason: note })));
  const targets = [{ requestId: t.requestId, bookingId: t.bookingId }, ...(await tripMembers(tx, t.id))];
  for (const x of targets) {
    const closed = await tx.query(
      `UPDATE shuttle_requests s SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now()
       WHERE s.id = $1 AND s.status IN ('REQUESTED','ASSIGNED')
         AND NOT EXISTS (SELECT 1 FROM shuttle_trips w WHERE (w.request_id = $1 OR w.id IN (SELECT trip_id FROM shuttle_trip_requests WHERE request_id = $1)) AND w.status NOT IN ('CANCELLED','REJECTED')) RETURNING id`,
      [x.requestId, note],
    );
    if (closed.rowCount) {
      await logBookingEvent(tx, { bookingId: x.bookingId, hotelId: t.hotelId, actor, type: 'SHUTTLE_CANCELLED', data: { requestId: x.requestId, note } });
      await writeAudit({ actor, action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id: x.requestId }, hotelId: t.hotelId, bookingId: x.bookingId, reasonNote: note, requestId }, tx);
      events.push({ type: 'SHUTTLE_CANCELLED', hotelId: t.hotelId, bookingId: x.bookingId, requestId: x.requestId, audience: ['GUEST', 'HOTEL'], payload: { status: 'CANCELLED', reason: note } });
    } else await syncRequest(tx, x.requestId);
  }
  return events;
}

/** Tài xế báo "khách không có mặt": chỉ chuyến OWN của chính mình đang ARRIVED -> CANCELLED (cancel_note = no_show). Phí xe không đổi (không hoàn). */
export async function driverNoShow(auth: AuthContext, tripId: string, requestId?: string) {
  const actor = actorOf(auth);
  const events = await withTransaction(async (tx) => {
    const t = (
      await tx.query<ShuttleTripDoc>(
        `UPDATE shuttle_trips SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $4, updated_at = now()
         WHERE id = $1 AND status = 'ARRIVED' AND kind = 'OWN' AND driver_account_id = $2 AND ($3::uuid IS NULL OR hotel_id = $3) RETURNING *`,
        [tripId, auth.sub, auth.hotelId ?? null, NO_SHOW_NOTE],
      )
    ).rows[0];
    if (!t) {
      const seen = (await tx.query('SELECT 1 FROM shuttle_trips WHERE id = $1 AND driver_account_id = $2 AND ($3::uuid IS NULL OR hotel_id = $3)', [tripId, auth.sub, auth.hotelId ?? null])).rowCount;
      throw seen ? new AppError(409, 'INVALID_TRANSITION', 'Chỉ báo khách không có mặt khi xe đã tới điểm đón') : new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến');
    }
    return afterTripClosed(tx, t, actor, NO_SHOW_NOTE, requestId);
  });
  publishAll(events);
  return { ok: true };
}

/** Vòng quét: đóng chuyến chưa xong mà cả giờ đón lẫn lần cập nhật cuối đều cũ hơn SHUTTLE_STALE_TRIP_HOURS (chuyến mô phỏng đang chạy luôn có updated_at mới nên không bị đụng). */
export async function closeStaleTrips(now = new Date()): Promise<{ closed: number }> {
  if (!env.SHUTTLE_STALE_TRIP_HOURS) return { closed: 0 };
  const before = new Date(now.getTime() - env.SHUTTLE_STALE_TRIP_HOURS * 3600_000);
  const ids = (
    await db.query<{ id: string }>(
      `SELECT t.id FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id
       WHERE t.status = ANY($1::text[]) AND r.pickup_at < $2 AND t.updated_at < $2 ORDER BY r.pickup_at LIMIT 200`,
      [['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'NEEDS_EXTERNAL'], before],
    )
  ).rows;
  let closed = 0;
  for (const { id } of ids) {
    try {
      const events = await withTransaction(async (tx) => {
        const t = (
          await tx.query<ShuttleTripDoc>(
            `UPDATE shuttle_trips t SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $3, updated_at = now() FROM shuttle_requests r
             WHERE t.id = $1 AND r.id = t.request_id AND t.status = ANY($2::text[]) AND r.pickup_at < $4 AND t.updated_at < $4 RETURNING t.*`,
            [id, ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'NEEDS_EXTERNAL'], AUTO_CLOSED_NOTE, before],
          )
        ).rows[0];
        return t ? afterTripClosed(tx, t, { type: 'SYSTEM' }, AUTO_CLOSED_NOTE) : undefined;
      });
      if (events) { publishAll(events); closed++; }
    } catch (err) {
      logger.error({ err, tripId: id }, 'Đóng chuyến quá hạn lỗi (bỏ qua, vòng quét sẽ thử lại)');
    }
  }
  return { closed };
}

// ---------- Tài xế ----------
const ACTIVE_TRIP: TripStatus[] = ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD'];
export async function listDriverTrips(auth: AuthContext, q: DriverTripsQuery) {
  const rows = (
    await db.query<any>(`${CTX} WHERE t.driver_account_id = $1 AND t.hotel_id = $2 AND t.kind = 'OWN' AND t.status = ANY($3::text[]) ORDER BY r.pickup_at, t.seq LIMIT $4`, [auth.sub, auth.hotelId ?? null, q.status ? [q.status] : ACTIVE_TRIP, q.limit])
  ).rows;
  return { items: rows.map(driverTripView) };
}

// ---------- Nhân sự: xe ngoài, đổi xe, hủy ----------
async function lockStaffTrip(tx: Db, auth: AuthContext, id: string): Promise<ShuttleTripDoc> {
  const t = (await tx.query<ShuttleTripDoc>('SELECT * FROM shuttle_trips WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [id, hotelScope(auth).hotelId ?? null])).rows[0];
  if (!t) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến');
  return t;
}

/** Khách sạn nhập xe ngoài (hoặc đổi thông tin khi đã nhập): NEEDS_EXTERNAL|ACCEPTED -> ACCEPTED (EXTERNAL). Liên kết phải qua validateShareUrl. Nhân sự nhập tay luôn xóa cờ simulated. */
export const setExternalTrip = (auth: AuthContext, id: string, i: ExternalTripBody, requestId?: string) => externalSet(auth, id, i, requestId);
/** Mô phỏng tự "đặt xe ngoài" (SHUTTLE_SIM_AUTO): CÙNG đường đi với nhân sự (actor SYSTEM, cờ simulated). Chỉ khi chuyến còn NEEDS_EXTERNAL: nhân sự nhập trước -> 409 INVALID_TRANSITION. */
export const systemSetExternal = (id: string, i: ExternalTripBody) => externalSet(undefined, id, i);

async function externalSet(auth: AuthContext | undefined, id: string, i: ExternalTripBody, requestId?: string) {
  const link = validateShareUrl(i.shareUrl); // trước mọi truy vấn: link xấu luôn 422
  const sim = !auth;
  const actor: Actor = auth ? actorOf(auth) : { type: 'SYSTEM' };
  const out = await withTransaction(async (tx) => {
    const cur = auth ? await lockStaffTrip(tx, auth, id) : (await tx.query<ShuttleTripDoc>('SELECT * FROM shuttle_trips WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến');
    if (cur.kind !== 'EXTERNAL') throw new AppError(409, 'NOT_EXTERNAL_TRIP', 'Chuyến xe của khách sạn do tài xế thao tác');
    if (!(sim ? ['NEEDS_EXTERNAL'] : ['NEEDS_EXTERNAL', 'ACCEPTED']).includes(cur.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể nhập xe ngoài khi chuyến ở trạng thái ${cur.status}`);
    const t = (
      await tx.query<ShuttleTripDoc>(
        `UPDATE shuttle_trips SET status = 'ACCEPTED', accepted_at = coalesce(accepted_at, now()), provider = $2, share_url = $3, ext_driver_name = $4, ext_plate = $5, ext_phone = $6, ext_eta_at = $7, simulated = $8, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, i.provider, link.url, i.driverName ?? null, i.plate ?? null, i.phone ?? null, i.etaAt ?? null, sim],
      )
    ).rows[0]!;
    await syncRequest(tx, t.requestId);
    const data = { tripId: t.id, provider: i.provider, shareHost: link.host, replaced: cur.status === 'ACCEPTED', ...(sim && { simulated: true }) };
    await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: 'EXTERNAL_LINK_SET', data });
    await writeAudit({ actor, action: 'TRIP.EXTERNAL_SET', entity: { type: 'shuttle_trip', id }, hotelId: t.hotelId, bookingId: t.bookingId, before: { status: cur.status, provider: cur.provider, shareUrl: cur.shareUrl }, after: { provider: i.provider, shareUrl: link.url }, requestId }, tx);
    return { t, events: [{ ...eventBase(t), type: 'EXTERNAL_LINK_SET', audience: ['GUEST', 'HOTEL'], payload: { status: 'ACCEPTED', seats: t.seats } } as ShuttleEvent] };
  });
  publishAll(out.events);
  return auth ? { trip: await getStaffTrip(auth, id) } : { trip: out.t };
}

export async function getStaffTrip(auth: AuthContext, id: string) {
  const r = (await db.query<any>(`${CTX} WHERE t.id = $1 AND ($2::uuid IS NULL OR t.hotel_id = $2)`, [id, hotelScope(auth).hotelId ?? null])).rows[0];
  if (!r) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến');
  return staffTripView(r);
}

/** Gán tay: đổi xe cho chuyến chưa chạy (OFFERED/ACCEPTED, hoặc NEEDS_EXTERNAL chuyển thành xe của khách sạn). Xe phải rảnh, có tài xế, đủ chỗ; tài xế phải nhận lại. */
export async function reassignTrip(auth: AuthContext, id: string, vehicleId: string, requestId?: string) {
  const actor = actorOf(auth);
  const out = await withTransaction(async (tx) => {
    const cur = await lockStaffTrip(tx, auth, id);
    if (!['OFFERED', 'ACCEPTED', 'NEEDS_EXTERNAL'].includes(cur.status)) throw new AppError(409, 'INVALID_TRANSITION', `Không thể đổi xe khi chuyến ở trạng thái ${cur.status}`);
    const req = (await tx.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE id = $1 FOR UPDATE', [cur.requestId])).rows[0]!;
    await tx.query('SELECT 1 FROM vehicles WHERE hotel_id = $1 FOR UPDATE', [cur.hotelId]);
    const v = (await loadFleetAt(tx, cur.hotelId, new Date(req.pickupAt), cur.id)).find((x) => x.id === vehicleId);
    if (!v) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Không tìm thấy xe');
    if (!isFree(v)) throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Xe không rảnh (ngừng hoạt động, chưa có tài xế hoặc trùng giờ)');
    if (v.seats < cur.seats) throw new AppError(422, 'VEHICLE_TOO_SMALL', `Xe chỉ có ${v.seats} chỗ, chuyến cần ${cur.seats}`);
    const t = (
      await tx.query<ShuttleTripDoc>(
        `UPDATE shuttle_trips SET kind = 'OWN', vehicle_id = $2, driver_account_id = $3, status = 'OFFERED', offered_at = now(), accepted_at = NULL, external_reason = NULL,
           provider = NULL, share_url = NULL, ext_driver_name = NULL, ext_plate = NULL, ext_phone = NULL, ext_eta_at = NULL, simulated = false, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, v.id, v.driverAccountId],
      )
    ).rows[0]!;
    await syncRequest(tx, t.requestId);
    await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: 'TRIP_REASSIGNED', data: { tripId: t.id, fromVehicleId: cur.vehicleId ?? null, vehicleId: v.id, plate: v.plate, seats: t.seats } });
    await writeAudit({ actor, action: 'TRIP.REASSIGN', entity: { type: 'shuttle_trip', id }, hotelId: t.hotelId, bookingId: t.bookingId, before: { vehicleId: cur.vehicleId, status: cur.status }, after: { vehicleId: v.id, status: 'OFFERED' }, requestId }, tx);
    const events: ShuttleEvent[] = [{ ...eventBase(t), type: 'TRIP_REASSIGNED', audience: ['GUEST', 'HOTEL', 'DRIVER'], driverAccountId: t.driverAccountId, payload: { status: 'OFFERED', seats: t.seats } }];
    events.push(...(await mirrorToMembers(tx, t, actor, 'TRIP_REASSIGNED', { tripId: t.id, seats: t.seats }, { status: 'OFFERED' })));
    if (cur.driverAccountId && cur.driverAccountId !== t.driverAccountId) events.push({ ...eventBase(t), type: 'TRIP_CANCELLED', audience: ['DRIVER'], driverAccountId: cur.driverAccountId, payload: { status: 'CANCELLED' } });
    return events;
  });
  publishAll(out);
  return { trip: await getStaffTrip(auth, id) };
}

/** Nhân sự hủy một chuyến chưa lên xe (xe của khách sạn hoặc xe ngoài). */
export async function cancelTripByStaff(auth: AuthContext, id: string, note: string, requestId?: string) {
  const actor = actorOf(auth);
  const events = await withTransaction(async (tx) => {
    const cur = await lockStaffTrip(tx, auth, id);
    const r = await tx.query<ShuttleTripDoc>("UPDATE shuttle_trips SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now() WHERE id = $1 AND status = ANY($3::text[]) RETURNING *", [id, note, ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'NEEDS_EXTERNAL']]);
    if (!r.rowCount) throw new AppError(409, 'INVALID_TRANSITION', `Không thể hủy chuyến ở trạng thái ${cur.status}`);
    return afterTripClosed(tx, r.rows[0]!, actor, note, requestId); // hết chuyến còn hiệu lực -> đóng luôn yêu cầu (không treo REQUESTED)
  });
  publishAll(events);
  return { trip: await getStaffTrip(auth, id) };
}

// ---------- Bảng điều phối ----------
export async function shuttleBoard(auth: AuthContext, q: BoardQuery) {
  const scope = hotelScope(auth);
  const now = new Date();
  const reqs = (
    await db.query<any>(
      `SELECT s.*, b.code AS booking_code, b.guest, b.status AS booking_status FROM shuttle_requests s JOIN bookings b ON b.id = s.booking_id
       WHERE ($1::uuid IS NULL OR s.hotel_id = $1) AND s.status = ANY($2::text[]) ORDER BY s.pickup_at, s.seq LIMIT $3`,
      [scope.hotelId ?? null, q.status ? [q.status] : ['REQUESTED', 'ASSIGNED'], q.limit],
    )
  ).rows;
  const trips = reqs.length ? (await db.query<any>(`${CTX} WHERE t.request_id = ANY($1::uuid[]) OR t.id IN (SELECT trip_id FROM shuttle_trip_requests WHERE request_id = ANY($1::uuid[])) ORDER BY t.seq`, [reqs.map((r) => r.id)])).rows.map((r) => staffTripView(r, now)) : [];
  const requests = reqs.map((r) => ({
    id: r.id, bookingId: r.bookingId, bookingCode: r.bookingCode, direction: r.direction, airport: r.airportIata, pickupAt: r.pickupAt, location: r.location ?? null, note: r.note ?? null,
    passengers: r.passengers, status: r.status, bookingStatus: r.bookingStatus, guest: { fullName: r.guest?.fullName, phone: r.guest?.phone, count: r.guest?.count ?? 1 },
    trips: trips.filter((t) => t.requestId === r.id || t.members.some((m: { requestId: string }) => m.requestId === r.id)),
  }));
  const alerts = trips.filter((t) => t.status === 'NEEDS_EXTERNAL').map((t) => ({ type: 'NEEDS_EXTERNAL', tripId: t.id, requestId: t.requestId, bookingCode: t.bookingCode, seats: t.seats, deadlineAt: t.deadlineAt, overdue: t.overdue }));
  const vehicles = scope.hotelId
    ? (await loadFleetAt(db, scope.hotelId, now)).map((v) => ({
        id: v.id, plate: v.plate, seats: v.seats, model: v.model ?? null, active: v.active,
        driver: v.driverAccountId ? { accountId: v.driverAccountId, name: v.driverName, phone: v.driverPhone, active: !!v.driverActive } : null,
        state: !v.active ? 'INACTIVE' : !v.driverAccountId || !v.driverActive ? 'NO_DRIVER' : v.busy ? 'BUSY' : 'FREE',
      }))
    : [];
  return { requests, alerts, vehicles, config: { overdueMin: env.SHUTTLE_EXTERNAL_OVERDUE_MIN, vehicleWindowMin: env.SHUTTLE_VEHICLE_WINDOW_MIN } };
}
