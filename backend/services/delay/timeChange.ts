// Giờ bay đổi / chuyến hủy SAU KHI đã đặt phòng (spec 6.5, GĐ4). Rủi ro thấp: bay SỚM thì tự rút ngắn (không tốn thêm tiền);
// bay MUỘN thì KHÔNG tự gia hạn, chỉ ghi đề xuất + báo quầy (gia hạn do quầy yêu cầu, khách sạn đồng ý: services/delay/extensions.ts);
// hủy chuyến / mất giờ bay thì chỉ báo quầy. Gọi SAU commit từ flights.service (admin) và ingest (đối tác); không bao giờ ném lỗi.
import { db, json, withTransaction, type Db } from '../../database/pg';
import type { Actor } from '../../database/types';
import { logger } from '../../lib/logger';
import { writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { cancelLiveTrips } from '../shuttle/cascade';
import { dispatchDueForBooking } from '../shuttle/dispatch';
import { publish } from '../shuttle/events';
import { getConfig } from '../systemConfig';
import { roomChangedEmail } from '../email/templates/delayBooking';
import { enqueueEmail } from '../email/outbox';
import { contractPrice, loadContractRate } from './candidates';
import { leaveAtFor } from './batches';
import { emitDelay } from './events';

const SYSTEM: Actor = { type: 'SYSTEM' };
const DAY_MS = 24 * 3600_000;
const TOLERANCE_MS = 60_000; // lệch dưới 1 phút coi như không đổi

export interface FlightTimeChange { flightId: string; fromDep: Date | null; toDep: Date | null; status: string }

interface LiveOffer {
  id: string; batchId: string; groupId: string; bookingId: string; hotelId: string; roomTypeId: string; qty: number; status: string;
  payerId: string; stationId: string; origin: string; stay: { from: string; to: string };
}

export async function onFlightTimeChanged(p: FlightTimeChange): Promise<void> {
  try {
    const offers = (await db.query<LiveOffer>(
      `SELECT o.id, o.batch_id, o.group_id, o.booking_id, o.hotel_id, o.room_type_id, o.qty, o.status, bt.payer_id, bt.station_id, f.origin, b.stay
       FROM delay_room_offers o JOIN delay_batches bt ON bt.id = o.batch_id JOIN flights f ON f.id = bt.flight_id JOIN bookings b ON b.id = o.booking_id
       WHERE bt.flight_id = $1 AND o.status IN ('PENDING','CONFIRMED') AND b.status IN ('PENDING','CONFIRMED') ORDER BY o.seq`, [p.flightId])).rows;
    if (!offers.length) return;
    const minLead = (await getConfig('delay.minLeadMin')).value.minutes;
    for (const o of offers) await handle(o, p, minLead).catch((err) => logger.error({ err, offerId: o.id, flightId: p.flightId }, 'Xử lý đổi giờ bay cho offer lỗi'));
  } catch (err) {
    logger.error({ err, flightId: p.flightId }, 'onFlightTimeChanged lỗi');
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function alert(o: LiveOffer, kind: string, reason: string, proposedLeaveAt?: Date) {
  emitDelay({ type: 'alert', payerId: o.payerId, stationId: o.stationId, payload: { kind, groupId: o.groupId, batchId: o.batchId, reason, at: new Date().toISOString(), offerId: o.id, ...(proposedLeaveAt && { proposedLeaveAt: proposedLeaveAt.toISOString() }) } });
}

async function handle(o: LiveOffer, p: FlightTimeChange, minLead: number): Promise<void> {
  const ev = (type: string, data: Record<string, unknown>) => logBookingEvent(db, { bookingId: o.bookingId, hotelId: o.hotelId, actor: SYSTEM, type, data: { offerId: o.id, flightId: p.flightId, fromDep: iso(p.fromDep), toDep: iso(p.toDep), ...data } });
  if (p.status === 'CANCELLED') {
    await ev('DELAY_FLIGHT_CANCELLED', {});
    return alert(o, 'FLIGHT_CANCELLED', 'FLIGHT_CANCELLED');
  }
  if (!p.toDep) {
    await ev('DELAY_FLIGHT_TIME_UNKNOWN', {});
    return alert(o, 'FLIGHT_TIME_UNKNOWN', 'FLIGHT_TIME_UNKNOWN');
  }
  const drive = (await db.query<{ minutes: number }>(
    `SELECT (a->>'minutes')::int AS minutes FROM hotels h CROSS JOIN LATERAL jsonb_array_elements(h.airports) a WHERE h.id = $1 AND upper(a->>'iata') = upper($2) LIMIT 1`, [o.hotelId, o.origin])).rows[0];
  if (!drive) return logger.warn({ offerId: o.id }, 'Đổi giờ bay: KS không có thời gian xe tới sân bay, bỏ qua');
  const leave = await leaveAtFor(p.toDep, drive.minutes);
  const stayTo = new Date(o.stay.to);
  const diff = leave.getTime() - stayTo.getTime();

  if (diff > TOLERANCE_MS) { // BAY MUỘN HƠN: không đổi gì, ghi đề xuất + báo quầy (idempotent theo giờ rời đề xuất)
    const r = await db.query(
      `UPDATE delay_room_offers SET extension_status = 'PROPOSED', proposed_leave_at = $2, extension_requested_at = NULL, extension_responded_at = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('PENDING','CONFIRMED') AND NOT (extension_status IN ('PROPOSED','REQUESTED') AND proposed_leave_at = $2) RETURNING id`, [o.id, leave]);
    if (r.rows[0]) {
      await ev('DELAY_EXTENSION_PROPOSED', { stayTo: stayTo.toISOString(), proposedLeaveAt: leave.toISOString() });
      alert(o, 'FLIGHT_DELAYED_LATER', 'NEED_EXTENSION', leave);
    }
    return;
  }
  if (diff >= -TOLERANCE_MS) { await clearProposal(db, o.id); return; }

  // BAY SỚM HƠN: rút ngắn tự động, trừ khi giờ rời mới đã qua / quá sát (không đoán -> báo khẩn).
  if (leave.getTime() < Math.max(Date.now(), new Date(o.stay.from).getTime()) + minLead * 60_000) {
    await ev('DELAY_STAY_SHORTEN_URGENT', { stayTo: stayTo.toISOString(), newLeaveAt: leave.toISOString() });
    return alert(o, 'FLIGHT_EARLIER_URGENT', 'LEAVE_TOO_SOON');
  }
  const applied = await withTransaction(async (tx) => {
    const cur = (await tx.query<{ id: string }>("SELECT id FROM delay_room_offers WHERE id = $1 AND status IN ('PENDING','CONFIRMED') FOR UPDATE", [o.id])).rows[0];
    if (!cur) return false;
    const r = await applyNewStayEnd(tx, { ...o, newTo: leave, onlyEarlier: true, eventType: 'DELAY_STAY_SHORTENED', actor: SYSTEM, extra: { fromDep: iso(p.fromDep), toDep: iso(p.toDep) } });
    if (r) await clearProposal(tx, o.id);
    return !!r;
  });
  if (!applied) return;
  await dispatchDueForBooking(o.bookingId);
  if (o.status === 'CONFIRMED') await enqueueChangedEmails(o.id);
}

const clearProposal = (tx: Db, offerId: string) =>
  tx.query("UPDATE delay_room_offers SET extension_status = 'NONE', proposed_leave_at = NULL, extension_requested_at = NULL, updated_at = now() WHERE id = $1 AND extension_status IN ('PROPOSED','REQUESTED')", [offerId]);

export interface NewStayEnd {
  bookingId: string; hotelId: string; payerId: string; roomTypeId: string; qty: number; id: string; newTo: Date;
  onlyEarlier?: boolean; eventType: string; actor: Actor; extra?: Record<string, unknown>;
}

/**
 * Đổi giờ rời của một booking PAYER trong transaction của caller: bookings.stay.to/nights, hold phòng (room_reservations.ends_at, giữ nguyên phần dọn phòng),
 * giá hợp đồng theo khung mới (pricing.roomVnd/totalVnd), yêu cầu xe TO_AIRPORT (dời giờ đón; đã giao tài xế thì hủy chuyến cũ và điều lại; xe đã chạy thì giữ nguyên) và booking_events.
 * Trả null khi onlyEarlier mà giờ mới không còn sớm hơn (đã có người đổi trước). Caller tự dispatchDueForBooking + email SAU commit.
 */
export async function applyNewStayEnd(tx: Db, a: NewStayEnd): Promise<{ oldTo: Date } | null> {
  const b = (await tx.query<{ stay: { from: string; to: string; nights: number }; pricing: Record<string, any> }>('SELECT stay, pricing FROM bookings WHERE id = $1 FOR UPDATE', [a.bookingId])).rows[0];
  if (!b) return null;
  const from = new Date(b.stay.from), oldTo = new Date(b.stay.to);
  if (a.onlyEarlier && a.newTo.getTime() >= oldTo.getTime() - TOLERANCE_MS) return null;
  const nights = Math.max(1, Math.ceil((a.newTo.getTime() - from.getTime()) / DAY_MS));
  const rate = await loadContractRate(a.payerId, a.roomTypeId, from, a.newTo);
  const roomVnd = rate ? contractPrice(rate, from, a.newTo) * a.qty : undefined;
  const pricing = roomVnd === undefined ? b.pricing : { ...b.pricing, roomVnd, totalVnd: roomVnd + (b.pricing.shuttleVnd ?? 0) };
  // Offer đã nâng hạng: roomTypeId đã là hạng nâng (giữ hạng khi gia hạn/rút ngắn); tính lại phần chênh theo khung mới để ROOM + UPGRADE_DELTA vẫn = roomVnd.
  const upFrom = (await tx.query<{ t: string | null }>('SELECT upgrade_from_room_type_id AS t FROM delay_room_offers WHERE id = $1', [a.id])).rows[0]?.t;
  if (upFrom && rate) {
    const base = await loadContractRate(a.payerId, upFrom, from, a.newTo);
    const delta = base ? roomVnd! - contractPrice(base, from, a.newTo) * a.qty : 0;
    if (delta > 0) await tx.query('UPDATE delay_room_offers SET upgrade_delta_vnd = $2, updated_at = now() WHERE id = $1', [a.id, delta]);
  }
  await tx.query("UPDATE bookings SET stay = stay || jsonb_build_object('to', $2::text, 'nights', $3::int), pricing = $4::jsonb, updated_at = now() WHERE id = $1", [a.bookingId, a.newTo.toISOString(), nights, json(pricing)]);
  await tx.query("UPDATE room_reservations SET ends_at = $2::timestamptz + (ends_at - $3::timestamptz), updated_at = now() WHERE booking_id = $1 AND state IN ('HOLD','CONFIRMED','CHECKED_IN')", [a.bookingId, a.newTo, oldTo]);

  const sr = (await tx.query<{ id: string; status: string }>("SELECT id, status FROM shuttle_requests WHERE booking_id = $1 AND direction = 'TO_AIRPORT' AND status IN ('REQUESTED','ASSIGNED') FOR UPDATE", [a.bookingId])).rows[0];
  let shuttle = 'NONE';
  if (sr) {
    const started = (await tx.query("SELECT 1 FROM shuttle_trips WHERE request_id = $1 AND status IN ('ONBOARD','DROPPED_OFF')", [sr.id])).rowCount > 0;
    if (started) shuttle = 'STARTED_KEPT';
    else {
      (await cancelLiveTrips(tx, sr.id, a.actor, 'Đổi giờ rời khách sạn')).forEach(publish);
      await tx.query("UPDATE shuttle_requests SET pickup_at = $2, status = 'REQUESTED', driver = NULL, assigned_at = NULL, updated_at = now() WHERE id = $1", [sr.id, a.newTo]);
      shuttle = 'RESCHEDULED';
    }
  }
  await logBookingEvent(tx, { bookingId: a.bookingId, hotelId: a.hotelId, actor: a.actor, type: a.eventType, data: { offerId: a.id, oldTo: oldTo.toISOString(), newTo: a.newTo.toISOString(), roomVnd, shuttle, ...a.extra } });
  await writeAudit({ actor: a.actor, action: `DELAY_STAY.${a.eventType === 'DELAY_STAY_SHORTENED' ? 'SHORTEN' : 'EXTEND'}`, entity: { type: 'delay_room_offer', id: a.id }, hotelId: a.hotelId, bookingId: a.bookingId, before: { to: oldTo }, after: { to: a.newTo, roomVnd } }, tx);
  return { oldTo };
}

const addr = (x?: { line?: string; ward?: string; district?: string; city?: string } | null) => (x ? [x.line, x.ward, x.district, x.city].filter(Boolean).join(', ') : null);

/** roomChangedEmail cho mọi người trong offer có email (offer phải CONFIRMED); dedupe theo giờ rời mới. Không bao giờ ném lỗi. */
export async function enqueueChangedEmails(offerId: string): Promise<void> {
  try {
    const o = (await db.query<any>(
      `SELECT o.status, o.group_id, o.pax_ids, o.room_numbers, o.booking_id, b.code AS booking_code, b.stay, h.name AS hotel_name, h.address, h.contact
       FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id JOIN hotels h ON h.id = o.hotel_id WHERE o.id = $1`, [offerId])).rows[0];
    if (!o || o.status !== 'CONFIRMED') return;
    const pax = (await db.query<{ id: string; fullName: string; email: string | null }>(
      `SELECT id, full_name, COALESCE(contact_email, email) AS email FROM delay_flight_pax WHERE ${o.paxIds?.length ? 'id = ANY($1::uuid[])' : 'group_id = $1'} ORDER BY is_representative DESC, seq`, [o.paxIds?.length ? o.paxIds : o.groupId])).rows;
    const shuttles = (await db.query<{ direction: string; pickupAt: Date; location: string | null }>("SELECT direction, pickup_at, location FROM shuttle_requests WHERE booking_id = $1 AND status <> 'CANCELLED' ORDER BY seq DESC", [o.bookingId])).rows;
    const trip = (d: string) => { const s = shuttles.find((x) => x.direction === d); return s ? { at: s.pickupAt, location: s.location } : undefined; };
    const pickup = trip('TO_HOTEL'), returnTrip = trip('TO_AIRPORT');
    const to = new Date(o.stay.to);
    for (const x of pax) {
      if (!x.email) continue;
      try {
        const m = roomChangedEmail({
          guestName: x.fullName, offerStatus: o.status, bookingCode: o.bookingCode, hotel: { name: o.hotelName, address: addr(o.address), phone: o.contact?.phone ?? null },
          roomNumber: (o.roomNumbers ?? []).join(', ') || null, checkInAt: new Date(o.stay.from), checkoutAt: to, ...(pickup && { pickup }), ...(returnTrip && { returnTrip }),
        });
        await enqueueEmail({ to: x.email, toName: x.fullName, template: 'room-changed', ...m, dedupeKey: `room-changed:${offerId}:${x.id}:${to.getTime()}`, bookingId: o.bookingId });
      } catch (err) { logger.error({ err, offerId }, 'Enqueue email đổi giờ lỗi'); }
    }
  } catch (err) {
    logger.error({ err, offerId }, 'enqueueChangedEmails lỗi');
  }
}
