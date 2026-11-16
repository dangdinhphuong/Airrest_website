import type { Db } from '../../database/pg';
import type { Actor } from '../../database/types';
import { logBookingEvent } from '../bookings/bookingEvents';
import type { ShuttleEvent } from './events';

// Chuyến chung nhiều booking (migration 029): chuyến gắn booking dẫn đầu, các booking còn lại nằm ở shuttle_trip_requests.
export interface TripMember { requestId: string; bookingId: string; seats: number }

export async function tripMembers(tx: Db, tripId: string): Promise<TripMember[]> {
  return (await tx.query<TripMember>('SELECT request_id, booking_id, seats FROM shuttle_trip_requests WHERE trip_id = $1 ORDER BY created_at, request_id', [tripId])).rows;
}

/** Ghi nhật ký + tạo sự kiện (chỉ khách) cho các booking thành viên của chuyến, để khách của họ thấy cùng tiến trình. Caller `publishAll` sau commit. */
export async function mirrorToMembers(tx: Db, t: { id: string; hotelId: string }, actor: Actor, type: string, data: Record<string, unknown>, payload: Record<string, unknown>): Promise<ShuttleEvent[]> {
  const events: ShuttleEvent[] = [];
  for (const m of await tripMembers(tx, t.id)) {
    await logBookingEvent(tx, { bookingId: m.bookingId, hotelId: t.hotelId, actor, type, data });
    events.push({ type, hotelId: t.hotelId, bookingId: m.bookingId, tripId: t.id, requestId: m.requestId, audience: ['GUEST'], payload });
  }
  return events;
}

/**
 * Yêu cầu `requestId` rời khỏi chuyến chung còn chưa lên xe (hủy/đổi giờ/hủy đơn), TRƯỚC khi hủy chuyến của nó:
 * - là thành viên: gỡ liên kết, giảm ghế chuyến;
 * - là booking dẫn đầu: chuyển quyền dẫn đầu cho thành viên đầu tiên (chuyến sống tiếp, ghế = tổng ghế các thành viên còn lại).
 */
export async function leaveSharedTrips(tx: Db, requestId: string, live: string[], actor: Actor, note: string): Promise<void> {
  const bookingId = (await tx.query<{ bookingId: string }>('SELECT booking_id FROM shuttle_requests WHERE id = $1', [requestId])).rows[0]?.bookingId;
  if (!bookingId) return;
  const left = (
    await tx.query<{ id: string; hotelId: string; seats: number }>(
      `WITH d AS (DELETE FROM shuttle_trip_requests l USING shuttle_trips t WHERE l.request_id = $1 AND t.id = l.trip_id AND t.status = ANY($2::text[]) RETURNING l.trip_id, l.seats)
       UPDATE shuttle_trips t SET seats = GREATEST(1, t.seats - d.seats), updated_at = now() FROM d WHERE t.id = d.trip_id RETURNING t.id, t.hotel_id, d.seats`,
      [requestId, live],
    )
  ).rows;
  for (const t of left) await logBookingEvent(tx, { bookingId, hotelId: t.hotelId, actor, type: 'TRIP_MEMBER_LEFT', data: { tripId: t.id, seats: t.seats, note } });
  const led = (await tx.query<{ id: string; hotelId: string }>('SELECT id, hotel_id FROM shuttle_trips t WHERE t.request_id = $1 AND t.status = ANY($2::text[]) AND EXISTS (SELECT 1 FROM shuttle_trip_requests l WHERE l.trip_id = t.id) FOR UPDATE', [requestId, live])).rows;
  for (const t of led) {
    const [next, ...rest] = await tripMembers(tx, t.id);
    await tx.query('DELETE FROM shuttle_trip_requests WHERE trip_id = $1 AND request_id = $2', [t.id, next!.requestId]);
    await tx.query('UPDATE shuttle_trips SET request_id = $2, booking_id = $3, seats = $4, updated_at = now() WHERE id = $1', [t.id, next!.requestId, next!.bookingId, Math.max(1, next!.seats + rest.reduce((s, m) => s + m.seats, 0))]);
    await logBookingEvent(tx, { bookingId, hotelId: t.hotelId, actor, type: 'TRIP_MEMBER_LEFT', data: { tripId: t.id, promoted: next!.bookingId, note } });
  }
}
