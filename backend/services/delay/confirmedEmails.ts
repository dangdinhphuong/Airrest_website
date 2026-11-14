// Email SAU KHI khách sạn xác nhận offer (spec 6.7): mỗi người trong offer một thư + người đại diện PNR một bản tổng hợp.
// Gọi sau commit của confirmOffer; không bao giờ ném lỗi (xác nhận không được hỏng vì thư).
import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { payerScope } from './queries';
import { enqueueEmail } from '../email/outbox';
import { groupSummaryEmail, roomConfirmedEmail, type GroupRow } from '../email/templates/delayBooking';

interface PaxRow { id: string; fullName: string; email: string | null; isRepresentative: boolean }

const addr = (a?: { line?: string; ward?: string; district?: string; city?: string } | null) => (a ? [a.line, a.ward, a.district, a.city].filter(Boolean).join(', ') : null);

export async function enqueueConfirmedEmails(offerId: string): Promise<void> {
  try {
    const o = (await db.query<any>(
      `SELECT o.id, o.status, o.group_id, o.pax_ids, o.room_numbers, o.booking_id, b.code AS booking_code, b.stay, h.name AS hotel_name, h.address, h.contact, g.code AS group_code
       FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id JOIN hotels h ON h.id = o.hotel_id JOIN delay_groups g ON g.id = o.group_id WHERE o.id = $1`, [offerId])).rows[0];
    if (!o || o.status !== 'CONFIRMED') return; // tuyệt đối không gửi trước khi CONFIRMED
    const pax = (await db.query<PaxRow>(
      `SELECT id, full_name, COALESCE(contact_email, email) AS email, is_representative FROM delay_flight_pax
       WHERE ${o.paxIds?.length ? 'id = ANY($1::uuid[])' : 'group_id = $1'} ORDER BY is_representative DESC, seq`, [o.paxIds?.length ? o.paxIds : o.groupId])).rows;
    const trips = await tripsOf(o.bookingId);

    let missing = 0;
    for (const p of pax) {
      if (!p.email) { missing++; continue; }
      await safe(() => enqueuePaxMail(o, p, trips, `room-confirmed:${offerId}:${p.id}`), offerId);
    }
    if (missing) logger.warn({ offerId, missing }, 'Email xác nhận phòng: bỏ qua người không có email');
    await safe(() => enqueueGroupSummary(o.groupId, o.groupCode), offerId);
  } catch (err) {
    logger.error({ err, offerId }, 'Enqueue email xác nhận phòng lỗi');
  }
}

async function tripsOf(bookingId: string) {
  const shuttles = (await db.query<{ direction: string; pickupAt: Date; location: string | null }>(
    "SELECT direction, pickup_at, location FROM shuttle_requests WHERE booking_id = $1 AND status <> 'CANCELLED' ORDER BY seq DESC", [bookingId])).rows;
  const trip = (d: string) => { const s = shuttles.find((x) => x.direction === d); return s ? { at: s.pickupAt, location: s.location } : undefined; };
  return { pickup: trip('TO_HOTEL'), returnTrip: trip('TO_AIRPORT') };
}

async function enqueuePaxMail(o: any, p: PaxRow, { pickup, returnTrip }: Awaited<ReturnType<typeof tripsOf>>, dedupeKey: string) {
  const m = roomConfirmedEmail({
    guestName: p.fullName, offerStatus: o.status, bookingCode: o.bookingCode,
    hotel: { name: o.hotelName, address: addr(o.address), phone: o.contact?.phone ?? null },
    roomNumber: (o.roomNumbers ?? []).join(', ') || null, checkInAt: new Date(o.stay.from), checkoutAt: new Date(o.stay.to),
    ...(pickup && { pickup }), ...(returnTrip && { returnTrip }),
  });
  return enqueueEmail({ to: p.email!, toName: p.fullName, template: 'room-confirmed', ...m, dedupeKey, bookingId: o.bookingId });
}

export const RESEND_MAX_PER_HOUR = 3;

/** Gửi lại email xác nhận phòng cho 1 hành khách của payer (nhân viên sửa email xong). Lỗi nghiệp vụ được ném (khác enqueueConfirmedEmails). */
export async function resendConfirmedEmail(auth: AuthContext, paxId: string) {
  const { payerId, stationId } = payerScope(auth);
  const p = (await db.query<PaxRow & { groupId: string }>(
    'SELECT id, full_name, group_id, COALESCE(contact_email, email) AS email, is_representative FROM delay_flight_pax WHERE id = $1 AND payer_id = $2 AND ($3::uuid IS NULL OR station_id = $3)', [paxId, payerId, stationId])).rows[0];
  if (!p) throw new AppError(404, 'PASSENGER_NOT_FOUND', 'Không tìm thấy hành khách');
  const o = (await db.query<any>(
    `SELECT o.id, o.status, o.pax_ids, o.room_numbers, o.booking_id, b.code AS booking_code, b.stay, h.name AS hotel_name, h.address, h.contact
     FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id JOIN hotels h ON h.id = o.hotel_id
     WHERE o.status = 'CONFIRMED' AND (CASE WHEN cardinality(o.pax_ids) > 0 THEN $1::uuid = ANY(o.pax_ids) ELSE o.group_id = $2 END) ORDER BY o.seq DESC LIMIT 1`, [paxId, p.groupId])).rows[0];
  if (!o) throw new AppError(409, 'OFFER_NOT_CONFIRMED', 'Phòng của hành khách này chưa được khách sạn xác nhận nên chưa gửi email được');
  if (!p.email) throw new AppError(422, 'PASSENGER_EMAIL_REQUIRED', 'Hành khách chưa có email. Hãy nhập email trước khi gửi lại');
  const prefix = `room-confirmed-resend:${o.id}:${paxId}:`;
  const { total, recent } = (await db.query<{ total: number; recent: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS recent FROM email_outbox WHERE dedupe_key LIKE $1", [`${prefix}%`])).rows[0]!;
  if (recent >= RESEND_MAX_PER_HOUR) throw new AppError(429, 'RESEND_LIMIT', `Đã gửi lại ${RESEND_MAX_PER_HOUR} lần trong 1 giờ, vui lòng thử lại sau`);
  const r = await enqueuePaxMail(o, p, await tripsOf(o.bookingId), `${prefix}${total + 1}`);
  if (!r.enqueued) throw new AppError(409, 'RESEND_CONFLICT', 'Yêu cầu gửi lại trùng nhau, vui lòng thử lại');
  return { sent: true, to: p.email };
}

async function enqueueGroupSummary(groupId: string, groupCode: string): Promise<void> {
  const rep = (await db.query<PaxRow>(
    "SELECT id, full_name, COALESCE(contact_email, email) AS email, is_representative FROM delay_flight_pax WHERE group_id = $1 ORDER BY is_representative DESC, seq LIMIT 1", [groupId])).rows[0];
  if (!rep?.email) return;
  const offers = (await db.query<{ status: string; hotelName: string; roomNumbers: string[]; bookingCode: string; guestName: string }>(
    `SELECT o.status, h.name AS hotel_name, o.room_numbers, b.code AS booking_code, COALESCE(b.guest->>'fullName', '') AS guest_name
     FROM delay_room_offers o JOIN hotels h ON h.id = o.hotel_id JOIN bookings b ON b.id = o.booking_id
     WHERE o.group_id = $1 AND o.status IN ('PENDING','CONFIRMED') ORDER BY o.seq`, [groupId])).rows;
  const confirmed = offers.filter((x) => x.status === 'CONFIRMED').length;
  if (!confirmed) return;
  const rows: GroupRow[] = offers.map((x) => x.status === 'CONFIRMED'
    ? { guestName: x.guestName, status: 'CONFIRMED', hotelName: x.hotelName, roomNumber: x.roomNumbers.join(', '), bookingCode: x.bookingCode }
    : { guestName: x.guestName, status: 'PENDING' });
  const m = groupSummaryEmail({ representativeName: rep.fullName, groupCode: groupCode ?? offers[0]!.bookingCode, rows });
  await enqueueEmail({ to: rep.email, toName: rep.fullName, template: 'group-summary', ...m, dedupeKey: `group-summary:${groupId}:${confirmed}` });
}

const safe = (fn: () => Promise<unknown>, offerId: string) => fn().catch((err) => logger.error({ err, offerId }, 'Enqueue email xác nhận phòng lỗi'));
