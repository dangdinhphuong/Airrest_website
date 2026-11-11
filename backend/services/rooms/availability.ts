import { isActive, type Interval, type ReservationLike } from '@airrest/business-logic';
import type { Db } from '../../database/pg';

// Tồn = room_reservations đang hoạt động + room_blocks chưa gỡ. Người gọi tự khóa `FOR UPDATE room_types` trước khi đọc để kiểm-rồi-ghi.
export async function loadActiveIntervals(tx: Db, roomTypeId: string, from: Date, to: Date, now: Date): Promise<{ reservations: ReservationLike[]; blocks: Interval[] }> {
  const reservations = (
    await tx.query<ReservationLike>(
      `SELECT starts_at AS "from", ends_at AS "to", qty, state, hold_expires_at FROM room_reservations
       WHERE room_type_id = $1 AND starts_at < $3 AND ends_at > $2
         AND (state IN ('CONFIRMED','CHECKED_IN') OR (state = 'HOLD' AND hold_expires_at > $4))`,
      [roomTypeId, from, to, now],
    )
  ).rows;
  const blocks = (
    await tx.query<Interval>(
      `SELECT starts_at AS "from", ends_at AS "to", qty FROM room_blocks WHERE room_type_id = $1 AND released_at IS NULL AND starts_at < $3 AND ends_at > $2`,
      [roomTypeId, from, to],
    )
  ).rows;
  return { reservations, blocks };
}

// Đầu vào của canBook/maxConcurrent: đơn còn hiệu lực + khóa.
export const intervalsForCheck = (r: { reservations: ReservationLike[]; blocks: Interval[] }, now: Date): Interval[] => [...r.reservations.filter((x) => isActive(x, now)), ...r.blocks];
