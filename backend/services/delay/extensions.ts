// Gia hạn phòng khi giờ bay đổi muộn hơn giờ rời KS (spec 6.5): quầy yêu cầu -> khách sạn đồng ý/từ chối. Không bao giờ tự gia hạn (tốn tiền).
// Chi phí: applyNewStayEnd cập nhật bookings.pricing.roomVnd theo giá hợp đồng của khung mới; GĐ5 tính từ đó.
import { z } from 'zod';
import { afterCommit, db, withTransaction } from '../../database/pg';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { isRoomAvailable } from '../rooms/availability';
import { hotelScope } from '../scope';
import { dispatchDueForBooking } from '../shuttle/dispatch';
import { emitDelay } from './events';
import { payerScope } from './queries';
import { applyNewStayEnd, enqueueChangedEmails } from './timeChange';

export const requestExtensionBody = z.object({ offerIds: z.array(z.string().uuid()).min(1).max(100).optional() }).strict();
export const rejectExtensionBody = z.object({ reason: z.string().trim().min(1).max(300).optional() }).strict();

interface Row { id: string; batchId: string; groupId: string; bookingId: string; hotelId: string; roomTypeId: string; qty: number; status: string; extensionStatus: string; proposedLeaveAt?: Date; payerId: string; stationId: string }
const SEL = `o.id, o.batch_id, o.group_id, o.booking_id, o.hotel_id, o.room_type_id, o.qty, o.status, o.extension_status, o.proposed_leave_at, bt.payer_id, bt.station_id
  FROM delay_room_offers o JOIN delay_batches bt ON bt.id = o.batch_id`;

const alert = (o: Row, kind: string, reason: string) =>
  emitDelay({ type: 'alert', payerId: o.payerId, stationId: o.stationId, payload: { kind, groupId: o.groupId, batchId: o.batchId, reason, at: new Date().toISOString(), offerId: o.id, ...(o.proposedLeaveAt && { proposedLeaveAt: new Date(o.proposedLeaveAt).toISOString() }) } });

/** Quầy gửi yêu cầu gia hạn cho khách sạn: mọi offer CONFIRMED của lô đang PROPOSED (hoặc đúng `offerIds`). UPDATE có điều kiện nên bấm trùng chỉ một lần có hiệu lực. */
export async function requestExtensions(auth: AuthContext, batchId: string, offerIds?: string[]) {
  const { payerId, stationId } = payerScope(auth);
  const batch = (await db.query('SELECT 1 FROM delay_batches WHERE id = $1 AND payer_id = $2 AND ($3::uuid IS NULL OR station_id = $3)', [batchId, payerId, stationId])).rows[0];
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'Không tìm thấy lô đặt phòng');
  const rows = await withTransaction(async (tx) => {
    const r = (await tx.query<{ id: string; hotelId: string; groupId: string; bookingId: string; proposedLeaveAt: Date }>(
      `UPDATE delay_room_offers SET extension_status = 'REQUESTED', extension_requested_at = now(), updated_at = now()
       WHERE batch_id = $1 AND status = 'CONFIRMED' AND extension_status = 'PROPOSED' AND ($2::uuid[] IS NULL OR id = ANY($2)) RETURNING id, hotel_id, group_id, booking_id, proposed_leave_at`, [batchId, offerIds ?? null])).rows;
    for (const o of r) {
      await logBookingEvent(tx, { bookingId: o.bookingId, hotelId: o.hotelId, actor: actorOf(auth), type: 'DELAY_EXTENSION_REQUESTED', data: { offerId: o.id, proposedLeaveAt: o.proposedLeaveAt } });
      afterCommit(() => emitDelay({ type: 'extension', hotelId: o.hotelId, payload: { offerId: o.id, groupId: o.groupId, proposedLeaveAt: new Date(o.proposedLeaveAt).toISOString(), at: new Date().toISOString() } }));
    }
    return r;
  });
  if (!rows.length) throw new AppError(409, 'NO_EXTENSION_PROPOSED', 'Không có đề xuất gia hạn nào đang chờ yêu cầu trong lô này');
  return { batchId, requested: rows.map((o) => ({ offerId: o.id, groupId: o.groupId, proposedLeaveAt: new Date(o.proposedLeaveAt).toISOString() })) };
}

const notFound = () => new AppError(404, 'OFFER_NOT_FOUND', 'Không tìm thấy yêu cầu đặt phòng');
const invalid = () => new AppError(409, 'INVALID_STATE', 'Yêu cầu gia hạn không còn ở trạng thái chờ khách sạn trả lời');

/** Khách sạn đồng ý gia hạn: kiểm tồn phòng trong khung kéo dài; hết phòng -> REJECTED + báo quầy + 409. */
export async function acceptExtension(auth: AuthContext, offerId: string, requestId?: string) {
  const scope = hotelScope(auth);
  const out = await withTransaction(async (tx) => {
    // Chiếm lượt bằng UPDATE có điều kiện: hai lần accept đồng thời chỉ một bên thấy REQUESTED.
    const o = (await tx.query<Row>(
      `UPDATE delay_room_offers o SET extension_status = 'ACCEPTED', extension_responded_at = now(), updated_at = now() FROM delay_batches bt
       WHERE o.id = $1 AND bt.id = o.batch_id AND o.status = 'CONFIRMED' AND o.extension_status = 'REQUESTED' AND o.proposed_leave_at IS NOT NULL AND ($2::uuid IS NULL OR o.hotel_id = $2)
       RETURNING o.id, o.batch_id, o.group_id, o.booking_id, o.hotel_id, o.room_type_id, o.qty, o.status, o.extension_status, o.proposed_leave_at, bt.payer_id, bt.station_id`, [offerId, scope.hotelId ?? null])).rows[0];
    if (!o) return undefined;
    const newTo = new Date(o.proposedLeaveAt!);
    const rt = (await tx.query<{ totalRooms: number }>('SELECT total_rooms FROM room_types WHERE id = $1 FOR UPDATE', [o.roomTypeId])).rows[0]!;
    const res = (await tx.query<{ startsAt: Date; endsAt: Date }>("SELECT min(starts_at) AS starts_at, max(ends_at) AS ends_at FROM room_reservations WHERE booking_id = $1 AND state IN ('CONFIRMED','CHECKED_IN')", [o.bookingId])).rows[0];
    const b = (await tx.query<{ stay: { to: string } }>('SELECT stay FROM bookings WHERE id = $1', [o.bookingId])).rows[0]!;
    const extra = res?.endsAt ? new Date(res.endsAt).getTime() - new Date(b.stay.to).getTime() : 0; // phần dọn phòng sau giờ rời
    const ok = !!res?.startsAt && (await isRoomAvailable(tx, { roomTypeId: o.roomTypeId, roomTotal: rt.totalRooms, from: new Date(res.startsAt), to: new Date(newTo.getTime() + extra), qty: o.qty, excludeBookingId: o.bookingId }));
    if (!ok) {
      await tx.query("UPDATE delay_room_offers SET extension_status = 'REJECTED' WHERE id = $1", [offerId]);
      await logBookingEvent(tx, { bookingId: o.bookingId, hotelId: o.hotelId, actor: actorOf(auth), type: 'DELAY_EXTENSION_NO_ROOM', data: { offerId, proposedLeaveAt: newTo } });
      return { o, soldOut: true };
    }
    await applyNewStayEnd(tx, { ...o, newTo, eventType: 'DELAY_STAY_EXTENDED', actor: actorOf(auth), extra: { requestId } });
    return { o, soldOut: false };
  });
  if (!out) {
    const x = (await db.query('SELECT 1 FROM delay_room_offers WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [offerId, scope.hotelId ?? null])).rows[0];
    throw x ? invalid() : notFound();
  }
  if (out.soldOut) {
    alert(out.o, 'EXTENSION_NO_ROOM', 'NO_ROOM');
    throw new AppError(409, 'EXTENSION_NO_ROOM', 'Khách sạn đã hết phòng trong khung gia hạn');
  }
  await dispatchDueForBooking(out.o.bookingId);
  await enqueueChangedEmails(offerId);
  return { offerId, extensionStatus: 'ACCEPTED', stayTo: new Date(out.o.proposedLeaveAt!).toISOString() };
}

/** Khách sạn từ chối gia hạn: không đổi gì, báo quầy xử lý tay (đổi KS / đưa khách về sân bay). */
export async function rejectExtension(auth: AuthContext, offerId: string, reason?: string) {
  const scope = hotelScope(auth);
  const o = await withTransaction(async (tx) => {
    const r = (await tx.query<Row>(
      `UPDATE delay_room_offers o SET extension_status = 'REJECTED', extension_responded_at = now(), updated_at = now() FROM delay_batches bt
       WHERE o.id = $1 AND bt.id = o.batch_id AND o.status = 'CONFIRMED' AND o.extension_status = 'REQUESTED' AND ($2::uuid IS NULL OR o.hotel_id = $2)
       RETURNING o.id, o.batch_id, o.group_id, o.booking_id, o.hotel_id, o.room_type_id, o.qty, o.status, o.extension_status, o.proposed_leave_at, bt.payer_id, bt.station_id`, [offerId, scope.hotelId ?? null])).rows[0];
    if (r) await logBookingEvent(tx, { bookingId: r.bookingId, hotelId: r.hotelId, actor: actorOf(auth), type: 'DELAY_EXTENSION_REJECTED', data: { offerId, reason } });
    return r;
  });
  if (!o) {
    const x = (await db.query('SELECT 1 FROM delay_room_offers WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [offerId, scope.hotelId ?? null])).rows[0];
    throw x ? invalid() : notFound();
  }
  alert(o, 'EXTENSION_REJECTED', 'HOTEL_REJECTED');
  return { offerId, extensionStatus: 'REJECTED' };
}
