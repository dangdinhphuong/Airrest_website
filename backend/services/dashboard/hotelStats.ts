import { isActive } from '@airrest/business-logic';
import { db } from '../../database/pg';
import type { HotelDoc } from '../../database/types';
import { AppError } from '../../lib/errors';
import { bookingMoneyByStatus, bookingsSection, resolveRange } from './dashboard.service';

// FR-ADM-08: phòng tồn/đang có khách + doanh thu theo đơn + số đơn theo trạng thái. Phần khách sạn nhận = phòng + xe (không gồm phí dịch vụ, BR-PAY-02).
export async function getHotelStats(hotelId: string, q: { from?: Date; to?: Date }, now = new Date()) {
  const hotel = (await db.query<HotelDoc>('SELECT id FROM hotels WHERE id = $1', [hotelId])).rows[0];
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const range = resolveRange(q, now);

  const [types, reservations, blocksNow, revenue, bookings] = await Promise.all([
    db.query<{ totalRooms: number }>('SELECT total_rooms FROM room_types WHERE hotel_id = $1 AND active', [hotelId]),
    db.query<{ kind: 'BOOKING' | 'BLOCK'; qty: number; state: 'HOLD' | 'CONFIRMED' | 'CHECKED_IN'; holdExpiresAt?: Date; from: Date; to: Date }>(
      `SELECT kind, qty, state, hold_expires_at, starts_at AS "from", ends_at AS "to" FROM room_reservations
       WHERE hotel_id = $1 AND state IN ('HOLD','CONFIRMED','CHECKED_IN') AND starts_at <= $2 AND ends_at > $2`,
      [hotelId, now],
    ),
    db.query<{ n: number }>('SELECT COALESCE(sum(qty), 0) AS n FROM room_blocks WHERE hotel_id = $1 AND released_at IS NULL AND starts_at <= $2 AND ends_at > $2', [hotelId, now]),
    bookingMoneyByStatus(db, range, hotelId),
    bookingsSection(db, range, hotelId),
  ]);

  const live = reservations.rows.filter((r) => isActive(r, now));
  const sum = (f: (r: (typeof live)[number]) => boolean) => live.filter(f).reduce((s, r) => s + r.qty, 0);
  const totalSellable = types.rows.reduce((s, t) => s + t.totalRooms, 0);
  const blocked = blocksNow.rows[0]!.n;
  return {
    hotelId, asOf: now,
    rooms: {
      totalSellable,
      occupiedNow: sum((r) => r.state === 'CHECKED_IN'),
      reservedNow: sum((r) => r.state !== 'CHECKED_IN' && r.kind === 'BOOKING'),
      blockedNow: sum((r) => r.kind === 'BLOCK') + blocked,
      availableNow: Math.max(0, totalSellable - live.reduce((s, r) => s + r.qty, 0) - blocked),
    },
    revenue,
    bookings,
  };
}
