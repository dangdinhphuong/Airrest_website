import type { Db } from '../../database/pg';
import type { Actor } from '../../database/types';
import { writeAudit } from '../audit';

/** Booking bị hủy/từ chối/hết hạn: hủy mọi xe REQUESTED|ASSIGNED trong CÙNG transaction của caller, để không còn xe mồ côi. */
export async function cancelShuttlesForBooking(tx: Db, bookingId: string, actor: Actor, note: string, requestId?: string): Promise<number> {
  const rows = (
    await tx.query<{ id: string; hotelId: string }>(
      "UPDATE shuttle_requests SET status = 'CANCELLED', cancelled_at = now(), cancel_note = $2, updated_at = now() WHERE booking_id = $1 AND status IN ('REQUESTED','ASSIGNED') RETURNING id, hotel_id",
      [bookingId, note],
    )
  ).rows;
  for (const r of rows) await writeAudit({ actor, action: 'SHUTTLE.CANCEL', entity: { type: 'shuttle', id: r.id }, hotelId: r.hotelId, bookingId, reasonNote: note, requestId }, tx);
  return rows.length;
}
