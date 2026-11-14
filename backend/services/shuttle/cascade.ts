import type { Db } from '../../database/pg';
import type { Actor, ShuttleTripDoc } from '../../database/types';
import { AppError } from '../../lib/errors';
import { writeAudit } from '../audit';
import { logBookingEvent } from '../bookings/bookingEvents';
import { publish, type ShuttleEvent } from './events';

// Chuyến chưa lên xe: hủy được. ONBOARD/DROPPED_OFF là đã bắt đầu/xong.
const CANCELLABLE_TRIP = ['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'NEEDS_EXTERNAL'];

/**
 * Hủy mọi chuyến chưa lên xe của một yêu cầu (trong transaction của caller). `rejectIfStarted`: có chuyến ONBOARD/DROPPED_OFF -> 409 TRIP_ALREADY_STARTED.
 * Trả các sự kiện để caller `publishAll` SAU commit (riêng cascade hủy đơn gọi `publish` trong transaction của caller: `publish` tự hoãn tới sau commit qua afterCommit).
 */
export async function cancelLiveTrips(tx: Db, requestId: string, actor: Actor, note: string, o: { rejectIfStarted?: boolean; requestId?: string } = {}): Promise<ShuttleEvent[]> {
  if (o.rejectIfStarted && (await tx.query("SELECT 1 FROM shuttle_trips WHERE request_id = $1 AND status IN ('ONBOARD','DROPPED_OFF')", [requestId])).rowCount > 0) {
    throw new AppError(409, 'TRIP_ALREADY_STARTED', 'Khách đã lên xe nên không thể hủy');
  }
  const rows = (
    await tx.query<ShuttleTripDoc>(
      "UPDATE shuttle_trips SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $3, updated_at = now() WHERE request_id = $1 AND status = ANY($2::text[]) RETURNING *",
      [requestId, CANCELLABLE_TRIP, note],
    )
  ).rows;
  const events: ShuttleEvent[] = [];
  for (const t of rows) {
    await logBookingEvent(tx, { bookingId: t.bookingId, hotelId: t.hotelId, actor, type: 'TRIP_CANCELLED', data: { tripId: t.id, seats: t.seats, note } });
    await writeAudit({ actor, action: 'TRIP.CANCEL', entity: { type: 'shuttle_trip', id: t.id }, hotelId: t.hotelId, bookingId: t.bookingId, reasonNote: note, requestId: o.requestId }, tx);
    events.push({ type: 'TRIP_CANCELLED', hotelId: t.hotelId, bookingId: t.bookingId, tripId: t.id, requestId, audience: ['GUEST', 'HOTEL', 'DRIVER'], driverAccountId: t.driverAccountId, payload: { status: 'CANCELLED' } });
  }
  return events;
}

/** Booking bị hủy/từ chối/hết hạn: hủy mọi xe REQUESTED|ASSIGNED (và các chuyến chưa lên xe của chúng) trong CÙNG transaction của caller, để không còn xe mồ côi. */
export async function cancelShuttlesForBooking(tx: Db, bookingId: string, actor: Actor, note: string, requestId?: string): Promise<number> {
  const rows = (
    await tx.query<{ id: string; hotelId: string }>(
      "UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now() WHERE booking_id = $1 AND status IN ('REQUESTED','ASSIGNED') RETURNING id, hotel_id",
      [bookingId, note],
    )
  ).rows;
  for (const r of rows) {
    await writeAudit({ actor, action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id: r.id }, hotelId: r.hotelId, bookingId, reasonNote: note, requestId }, tx);
    await logBookingEvent(tx, { bookingId, hotelId: r.hotelId, actor, type: 'SHUTTLE_CANCELLED', data: { requestId: r.id, note } });
    (await cancelLiveTrips(tx, r.id, actor, note, { requestId })).forEach(publish);
    publish({ type: 'SHUTTLE_CANCELLED', hotelId: r.hotelId, bookingId, requestId: r.id, audience: ['GUEST', 'HOTEL'], payload: { status: 'CANCELLED' } });
  }
  return rows.length;
}
