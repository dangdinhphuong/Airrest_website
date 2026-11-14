// Vòng đời offer delay sau khi gửi khách sạn: xác nhận / từ chối / hết hạn -> chuyển khách sạn (spec 2026-11-14 mục 6.4, 7c).
// Một hàng delay_room_offers = một đơn vị đặt (phòng hoặc cụm không tách) = một booking PAYER.
import type { PaxCategory } from '@airrest/shared-types';
import { afterCommit, db, json, withTransaction, type Db } from '../../database/pg';
import type { Actor } from '../../database/types';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { actorOf, writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { createPayerBooking } from '../bookings/bookings.service';
import { emitSettled, settlePayerBooking } from '../bookings/decisions';
import { hotelScope } from '../scope';
import { dispatchDueForBooking } from '../shuttle/dispatch';
import { getConfig } from '../systemConfig';
import { loadPlanHotels } from './candidates';
import { enqueueConfirmedEmails } from './confirmedEmails';
import { createDelayShuttles } from './shuttles';
import { emitDelay } from './events';
import { replan, type OfferUnit, type PlanPax } from './rooms/plan';

const SYSTEM: Actor = { type: 'SYSTEM' };

interface OfferRow {
  id: string; batchId: string; groupId: string; bookingId?: string; hotelId: string; roomTypeId: string; qty: number;
  status: string; expiresAt: Date; transferCount: number; rejectedHotelIds: string[]; createdAt: Date; upgradeDeltaVnd?: number;
}

const cleanRooms = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** Phát `delay:offer` cho khách sạn (B gọi sau khi tạo offer; transfer tự gọi). Payload không PII. */
export async function publishOffer(offerId: string, tx: Db = db): Promise<void> {
  const o = (await tx.query<{ hotelId: string; groupId: string; qty: number; expiresAt: Date; roomType: string }>(
    'SELECT o.hotel_id, o.group_id, o.qty, o.expires_at, rt.name AS room_type FROM delay_room_offers o JOIN room_types rt ON rt.id = o.room_type_id WHERE o.id = $1', [offerId])).rows[0];
  if (!o) return;
  afterCommit(() => emitDelay({ type: 'offer', hotelId: o.hotelId, payload: { offerId, expiresAt: new Date(o.expiresAt).toISOString(), groupId: o.groupId, rooms: [{ roomType: o.roomType, qty: o.qty }], cluster: o.qty > 1 } }));
}

const emitClosed = (o: { id: string; hotelId: string }, status: string) => afterCommit(() => emitDelay({ type: 'offer:closed', hotelId: o.hotelId, payload: { offerId: o.id, status } }));

/** Khách sạn xác nhận: bắt buộc số phòng đúng số lượng (cụm "sát nhau/thông nhau" là cam kết của KS, không kiểm vị trí). */
export async function confirmOffer(offerId: string, roomNumbers: string[], auth: AuthContext, requestId?: string): Promise<{ offerId: string; bookingId: string; roomNumbers: string[] }> {
  const scope = hotelScope(auth);
  const actor = actorOf(auth);
  const rooms = cleanRooms(roomNumbers);
  const out = await withTransaction(async (tx) => {
    const now = new Date();
    const o = (await tx.query<OfferRow>('SELECT * FROM delay_room_offers WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) FOR UPDATE', [offerId, scope.hotelId ?? null])).rows[0];
    if (!o) throw new AppError(404, 'OFFER_NOT_FOUND', 'Không tìm thấy yêu cầu đặt phòng');
    if (rooms.length !== o.qty) throw new AppError(422, 'ROOM_NUMBERS_MISMATCH', `Cần nhập đúng ${o.qty} số phòng khác nhau`, { qty: o.qty });
    if (o.status !== 'PENDING') throw new AppError(409, 'INVALID_STATE', 'Yêu cầu không còn ở trạng thái chờ xác nhận');
    if (new Date(o.expiresAt) <= now) throw new AppError(409, 'OFFER_EXPIRED', 'Yêu cầu đã hết hạn xác nhận'); // job sẽ chuyển khách sạn khác
    const change = await settlePayerBooking(tx, o.bookingId!, 'CONFIRMED', actor, undefined, now, requestId);
    if (!change) throw new AppError(409, 'INVALID_STATE', 'Đơn không còn chờ xác nhận');
    await tx.query("UPDATE delay_room_offers SET status = 'CONFIRMED', room_numbers = $2::text[], responded_at = $3, updated_at = $3 WHERE id = $1", [offerId, rooms, now]);
    await tx.query(
      `UPDATE delay_groups g SET updated_at = $2, status = CASE WHEN EXISTS (SELECT 1 FROM delay_room_offers x WHERE x.group_id = g.id AND x.status = 'PENDING') THEN 'OFFERED' ELSE 'CONFIRMED' END
       WHERE g.id = $1 AND g.status <> 'FAILED'`, [o.groupId, now]);
    await logBookingEvent(tx, { bookingId: o.bookingId!, hotelId: o.hotelId, actor, type: 'DELAY_OFFER_CONFIRMED', data: { offerId, roomNumbers: rooms } });
    await writeAudit({ actor, action: 'DELAY_OFFER.CONFIRM', entity: { type: 'delay_room_offer', id: offerId }, hotelId: o.hotelId, bookingId: o.bookingId, after: { roomNumbers: rooms }, requestId }, tx);
    emitClosed(o, 'CONFIRMED');
    return { change, bookingId: o.bookingId! };
  });
  emitSettled(out.change);
  await createDelayShuttles(offerId); // tạo + điều xe đón/về TRƯỚC khi enqueue email để thư có giờ xe (tự nuốt lỗi)
  await dispatchDueForBooking(out.bookingId);
  await enqueueConfirmedEmails(offerId); // sau commit, tự nuốt lỗi
  return { offerId, bookingId: out.bookingId, roomNumbers: rooms };
}

/** Đóng offer (từ chối rõ ràng hoặc hết hạn) rồi chuyển ngay. UPDATE có điều kiện status='PENDING' => chỉ một bên thắng. */
async function closeOffer(offerId: string, to: 'REJECTED' | 'EXPIRED', reason: string | undefined, actor: Actor, hotelId: string | undefined, requestId?: string): Promise<boolean> {
  const closed = await withTransaction(async (tx) => {
    const now = new Date();
    const o = (await tx.query<OfferRow>(
      `UPDATE delay_room_offers SET status = $2, reject_reason = $3, responded_at = $4, updated_at = $4,
         rejected_hotel_ids = CASE WHEN hotel_id = ANY(rejected_hotel_ids) THEN rejected_hotel_ids ELSE array_append(rejected_hotel_ids, hotel_id) END
       WHERE id = $1 AND status = 'PENDING' AND ($5::uuid IS NULL OR hotel_id = $5) RETURNING *`,
      [offerId, to, reason ?? null, now, hotelId ?? null])).rows[0];
    if (!o) return undefined;
    const change = await settlePayerBooking(tx, o.bookingId!, to, actor, reason, now, requestId);
    await logBookingEvent(tx, { bookingId: o.bookingId!, hotelId: o.hotelId, actor, type: `DELAY_OFFER_${to}`, data: { offerId, reason } });
    await writeAudit({ actor, action: `DELAY_OFFER.${to === 'EXPIRED' ? 'EXPIRE' : 'REJECT'}`, entity: { type: 'delay_room_offer', id: offerId }, hotelId: o.hotelId, bookingId: o.bookingId, reasonNote: reason, requestId }, tx);
    emitClosed(o, to);
    return { o, change };
  });
  if (!closed) return false;
  if (closed.change) emitSettled(closed.change);
  await transferSafe(offerId, to === 'EXPIRED' ? 'EXPIRED' : `REJECTED${reason ? `: ${reason}` : ''}`);
  return true;
}

/** KS từ chối rõ ràng: chuyển NGAY, không chờ hết 5'. */
export async function rejectOffer(offerId: string, reason: string, auth: AuthContext, requestId?: string): Promise<{ offerId: string }> {
  const scope = hotelScope(auth);
  if (!(await closeOffer(offerId, 'REJECTED', reason, actorOf(auth), scope.hotelId, requestId))) {
    const o = (await db.query<{ status: string }>('SELECT status FROM delay_room_offers WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [offerId, scope.hotelId ?? null])).rows[0];
    if (!o) throw new AppError(404, 'OFFER_NOT_FOUND', 'Không tìm thấy yêu cầu đặt phòng');
    throw new AppError(409, 'INVALID_STATE', 'Yêu cầu không còn ở trạng thái chờ xác nhận');
  }
  return { offerId };
}

/** Hệ thống: hết hạn = từ chối. Trả false nếu đã có người xử lý trước. */
export const expireOffer = (offerId: string, requestId?: string): Promise<boolean> => closeOffer(offerId, 'EXPIRED', undefined, SYSTEM, undefined, requestId);

/** Job: quét offer PENDING quá hạn. Nhiều instance cùng quét an toàn nhờ điều kiện trong UPDATE. */
export async function sweepExpiredOffers(now = new Date()): Promise<{ expired: number }> {
  const due = (await db.query<{ id: string }>("SELECT id FROM delay_room_offers WHERE status = 'PENDING' AND expires_at <= $1 ORDER BY expires_at LIMIT 100", [now])).rows;
  let expired = 0;
  for (const d of due) {
    try { if (await expireOffer(d.id)) expired++; } catch (err) { logger.error({ err, offerId: d.id }, 'Hết hạn offer delay lỗi'); }
  }
  return { expired };
}

async function transferSafe(offerId: string, reason: string): Promise<void> {
  try { await transferOffer(offerId, reason); } catch (err) {
    logger.error({ err, offerId }, 'Chuyển khách sạn lỗi');
    await failGroup(offerId, 'ERROR').catch(() => undefined); // không để nhóm treo im lặng
  }
}

async function failGroup(offerId: string, reason: 'MAX_TRANSFERS' | 'MAX_WAIT' | 'NO_ROOM' | 'ERROR'): Promise<void> {
  const g = (await db.query<{ groupId: string; batchId: string; payerId: string; stationId: string }>(
    `UPDATE delay_groups g SET status = 'FAILED', updated_at = now() FROM delay_room_offers o JOIN delay_batches b ON b.id = o.batch_id
     WHERE o.id = $1 AND g.id = o.group_id RETURNING g.id AS group_id, g.batch_id, b.payer_id, b.station_id`, [offerId])).rows[0];
  if (g) emitDelay({ type: 'alert', payerId: g.payerId, stationId: g.stationId, payload: { kind: 'DELAY_TRANSFER_FAILED', groupId: g.groupId, batchId: g.batchId, reason, at: new Date().toISOString() } });
}

/**
 * Chuyển một offer đã REJECTED/EXPIRED sang khách sạn khác (booking cũ đã bị hủy + nhả HOLD, không hoàn tiền).
 * Thành viên của đơn vị: cột pax_ids của offer (migration 019), rỗng thì toàn bộ hành khách của nhóm (đúng với cụm/nhóm một offer).
 */
export async function transferOffer(offerId: string, reason: string): Promise<{ newOfferId?: string; failed?: string }> {
  const o = (await db.query<OfferRow & { paxIds?: string[]; pnr: string; payerId: string; stationId: string; flightId: string; airportIata: string; simulated: boolean }>(
    `SELECT o.*, g.pnr, b.payer_id, b.station_id, b.flight_id, s.airport_iata, b.simulated
     FROM delay_room_offers o JOIN delay_groups g ON g.id = o.group_id JOIN delay_batches b ON b.id = o.batch_id JOIN payer_stations s ON s.id = b.station_id WHERE o.id = $1`, [offerId])).rows[0];
  if (!o) throw new AppError(404, 'OFFER_NOT_FOUND', 'Không tìm thấy offer');
  const old = (await db.query<{ stay: { from: Date; to: Date; nights: number }; guest: { fullName: string; phone: string; email?: string; count: number; children: number } }>('SELECT stay, guest FROM bookings WHERE id = $1', [o.bookingId])).rows[0]!;
  const fail = async (r: 'MAX_TRANSFERS' | 'MAX_WAIT' | 'NO_ROOM') => (await failGroup(offerId, r), { failed: r });

  const [maxT, maxW] = [(await getConfig('delay.maxTransfers')).value.count, (await getConfig('delay.maxWaitMin')).value.minutes];
  if (o.transferCount >= maxT) return fail('MAX_TRANSFERS');
  const first = (await db.query<{ t: Date }>('SELECT min(created_at) AS t FROM delay_room_offers WHERE group_id = $1', [o.groupId])).rows[0]!.t;
  if (Date.now() - new Date(first).getTime() > maxW * 60_000) return fail('MAX_WAIT');

  const paxRows = (await db.query<PlanPax & { category: PaxCategory }>(
    `SELECT id, pnr, age, category, is_representative, special_needs FROM delay_flight_pax
     WHERE ${o.paxIds?.length ? 'id = ANY($1::uuid[])' : 'group_id = $1'} ORDER BY id`, [o.paxIds?.length ? o.paxIds : o.groupId])).rows;
  const pax: PlanPax[] = paxRows.map((p: any) => ({ id: p.id, pnr: p.pnr, age: p.age, category: p.category, isRepresentative: !!p.isRepresentative, specialNeeds: p.specialNeeds ?? [] }));
  if (!pax.length) return fail('NO_ROOM');

  const from = new Date(old.stay.from), to = new Date(old.stay.to);
  const rejected = [...new Set([...o.rejectedHotelIds, o.hotelId])];
  const hotels = await loadPlanHotels({ payerId: o.payerId, airportIata: o.airportIata, from, to, excludedHotelIds: rejected });
  const confirmed = (await db.query<{ hotelId: string }>("SELECT DISTINCT hotel_id FROM delay_room_offers WHERE group_id = $1 AND status = 'CONFIRMED'", [o.groupId])).rows.map((r) => r.hotelId);
  const oldUnit: OfferUnit = { id: o.id, pnr: o.pnr, hotelId: o.hotelId, rooms: [{ roomTypeId: o.roomTypeId, paxIds: pax.map((p) => p.id) }], cluster: pax.some((p) => p.category !== 'ADULT'), adjacent: o.qty > 1, connecting: false };
  const res = replan({ pax, hotels, units: [oldUnit], failedUnitIds: [o.id], excludedHotelIds: rejected, confirmedHotelIdsByPnr: { [o.pnr]: confirmed } });
  const unit = res.replacements[0]?.unit;
  if (!unit) return fail('NO_ROOM');

  const qtyByType = new Map<string, number>();
  for (const r of unit.rooms) qtyByType.set(r.roomTypeId, (qtyByType.get(r.roomTypeId) ?? 0) + 1);
  const price = new Map(hotels.filter((h) => h.hotelId === unit.hotelId).flatMap((h) => h.roomTypes.map((t) => [t.roomTypeId, t.priceVnd] as const)));
  const contract = [...qtyByType].reduce((s, [t, q]) => s + (price.get(t) ?? 0) * q, 0); // priceVnd đã là giá cả khung from-to
  let booking;
  try {
    booking = await createPayerBooking({
      hotelId: unit.hotelId, rooms: [...qtyByType].map(([roomTypeId, qty]) => ({ roomTypeId, qty })), from, to,
      guest: { fullName: old.guest.fullName, phone: old.guest.phone, ...(old.guest.email && { email: old.guest.email }) },
      guests: old.guest.count, children: old.guest.children, batchId: o.batchId, groupId: o.groupId, simulated: o.simulated,
      ...(contract > 0 && { contractRoomVnd: contract }),
    });
  } catch (e) {
    if (e instanceof AppError && e.code === 'SOLD_OUT') return fail('NO_ROOM'); // tồn vừa bị lấy mất giữa lúc xếp và giữ
    throw e;
  }
  const total = [...qtyByType.values()].reduce((a, b) => a + b, 0);
  const newId = await withTransaction(async (tx) => {
    const id = (await tx.query<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, status, expires_at, transfer_count, rejected_hotel_ids, pax_ids)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9::uuid[],$10::uuid[]) RETURNING id`,
      [o.batchId, o.groupId, booking.id, unit.hotelId, unit.rooms[0]!.roomTypeId, total, booking.expiresAt, o.transferCount + 1, rejected, pax.map((p) => p.id)])).rows[0]!.id;
    await tx.query("UPDATE delay_groups SET status = 'OFFERED', updated_at = now() WHERE id = $1 AND status <> 'FAILED'", [o.groupId]);
    await logBookingEvent(tx, { bookingId: booking.id, hotelId: unit.hotelId, actor: SYSTEM, type: 'DELAY_OFFER_TRANSFERRED', data: { fromOfferId: offerId, reason, transferCount: o.transferCount + 1 } });
    if (o.upgradeDeltaVnd) { // khách sạn mới khác hạng: KHÔNG giữ nâng hạng, đơn mới tính theo hạng chuẩn; báo quầy để thông báo khách
      await logBookingEvent(tx, { bookingId: booking.id, hotelId: unit.hotelId, actor: SYSTEM, type: 'DELAY_UPGRADE_CANCELLED', data: { fromOfferId: offerId, reason: 'HOTEL_CHANGED', note: 'Nâng hạng đã bị hủy do đổi khách sạn', upgradeDeltaVnd: o.upgradeDeltaVnd } });
      afterCommit(() => emitDelay({ type: 'alert', payerId: o.payerId, stationId: o.stationId, payload: { kind: 'UPGRADE_CANCELLED', groupId: o.groupId, batchId: o.batchId, reason: 'HOTEL_CHANGED', at: new Date().toISOString(), offerId: id } }));
    }
    await publishOffer(id, tx);
    return id;
  }).catch(async (e) => {
    await withTransaction((tx) => settlePayerBooking(tx, booking.id, 'EXPIRED', SYSTEM, 'TRANSFER_FAILED', new Date())); // không để HOLD mồ côi (job cũ bỏ qua đơn PAYER)
    throw e;
  });
  return { newOfferId: newId };
}

/** Danh sách offer của khách sạn (hoặc mọi KS với admin scope). Không PII ngoài tên người đại diện + số khách + loại phòng. */
export async function listHotelOffers(auth: AuthContext, status?: string) {
  const scope = hotelScope(auth);
  return (await db.query(
    `SELECT o.id, o.group_id, o.status, o.qty, o.expires_at, o.room_numbers, o.transfer_count, rt.name AS room_type,
            b.guest->>'fullName' AS representative, (b.guest->>'count')::int AS guests,
            GREATEST(0, floor(extract(epoch FROM o.expires_at - now())))::int AS seconds_left
     FROM delay_room_offers o JOIN room_types rt ON rt.id = o.room_type_id LEFT JOIN bookings b ON b.id = o.booking_id
     WHERE ($1::uuid IS NULL OR o.hotel_id = $1) AND ($2::text IS NULL OR o.status = $2)
     ORDER BY o.seq DESC LIMIT 100`, [scope.hotelId ?? null, status ?? null])).rows;
}
