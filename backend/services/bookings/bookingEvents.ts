import { db, json, type Db } from '../../database/pg';
import type { Actor } from '../../database/types';
import { AppError } from '../../lib/errors';

export type EventActorType = 'GUEST' | 'HOTEL' | 'DRIVER' | 'SYSTEM' | 'ADMIN';
const ACTOR_MAP: Record<string, EventActorType> = { GUEST: 'GUEST', PASSENGER: 'GUEST', HOTEL: 'HOTEL', USER: 'HOTEL', DRIVER: 'DRIVER', ADMIN: 'ADMIN', SYSTEM: 'SYSTEM' };

export interface BookingEventInput {
  bookingId: string;
  hotelId: string;
  actor: Actor;
  type: string; // SHUTTLE_REQUESTED, TRIP_ACCEPTED, EXTERNAL_LINK_SET...
  data?: Record<string, unknown>;
}

/** Nhật ký đơn (chỉ thêm). Truyền `tx` để ghi CÙNG transaction với thay đổi nghiệp vụ. */
export async function logBookingEvent(tx: Db, e: BookingEventInput): Promise<void> {
  await tx.query('INSERT INTO booking_events (booking_id, hotel_id, actor_type, actor_id, type, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [
    e.bookingId, e.hotelId, ACTOR_MAP[e.actor.type] ?? 'SYSTEM', e.actor.id ?? null, e.type, json(e.data ?? {}),
  ]);
}

// Đọc nhật ký theo thứ tự thời gian (seq tăng dần), phân trang con trỏ. `scope.hotelId` rỗng = mọi khách sạn (admin).
export async function listBookingEvents(scope: { hotelId?: string }, bookingId: string, q: { limit: number; cursor?: number }) {
  const b = (await db.query<{ statusHistory: unknown[] }>('SELECT status_history FROM bookings WHERE id = $1 AND ($2::uuid IS NULL OR hotel_id = $2)', [bookingId, scope.hotelId ?? null])).rows[0];
  if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
  const rows = (
    await db.query<{ seq: number }>('SELECT id, seq, at, actor_type, actor_id, type, data FROM booking_events WHERE booking_id = $1 AND seq > $2 ORDER BY seq LIMIT $3', [bookingId, q.cursor ?? 0, q.limit + 1])
  ).rows;
  const items = rows.slice(0, q.limit);
  return {
    items,
    nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null,
    ...(q.cursor === undefined && { statusHistory: b.statusHistory }), // trang đầu kèm lịch sử trạng thái của đơn
  };
}
