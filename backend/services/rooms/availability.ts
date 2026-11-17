import { canBook, isActive, type Interval, type ReservationLike } from '@airrest/business-logic';
import type { Db } from '../../database/pg';

// Tồn = room_reservations đang hoạt động + room_blocks chưa gỡ. Người gọi tự khóa `FOR UPDATE room_types` trước khi đọc để kiểm-rồi-ghi.
export async function loadActiveIntervals(tx: Db, roomTypeId: string, from: Date, to: Date, now: Date, excludeBookingId?: string): Promise<{ reservations: ReservationLike[]; blocks: Interval[] }> {
  const reservations = (
    await tx.query<ReservationLike>(
      `SELECT starts_at AS "from", ends_at AS "to", qty, state, hold_expires_at FROM room_reservations
       WHERE room_type_id = $1 AND starts_at < $3 AND ends_at > $2
         AND (state IN ('CONFIRMED','CHECKED_IN') OR (state = 'HOLD' AND hold_expires_at > $4))
         AND ($5::uuid IS NULL OR booking_id IS DISTINCT FROM $5)`,
      [roomTypeId, from, to, now, excludeBookingId ?? null],
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

// Như loadActiveIntervals nhưng cho NHIỀU loại phòng cùng lúc: đúng 2 truy vấn (đơn + khóa) thay vì 2 truy vấn mỗi loại phòng. Chỉ để ĐỌC (danh sách công khai), không khóa.
export async function loadActiveIntervalsMany(tx: Db, roomTypeIds: string[], from: Date, to: Date, now: Date): Promise<Map<string, { reservations: ReservationLike[]; blocks: Interval[] }>> {
  const out = new Map(roomTypeIds.map((id) => [id, { reservations: [] as ReservationLike[], blocks: [] as Interval[] }]));
  if (!roomTypeIds.length) return out;
  const [res, blk] = await Promise.all([
    tx.query<ReservationLike & { roomTypeId: string }>(
      `SELECT room_type_id, starts_at AS "from", ends_at AS "to", qty, state, hold_expires_at FROM room_reservations
       WHERE room_type_id = ANY($1::uuid[]) AND starts_at < $3 AND ends_at > $2
         AND (state IN ('CONFIRMED','CHECKED_IN') OR (state = 'HOLD' AND hold_expires_at > $4))`,
      [roomTypeIds, from, to, now],
    ),
    tx.query<Interval & { roomTypeId: string }>(
      `SELECT room_type_id, starts_at AS "from", ends_at AS "to", qty FROM room_blocks WHERE room_type_id = ANY($1::uuid[]) AND released_at IS NULL AND starts_at < $3 AND ends_at > $2`,
      [roomTypeIds, from, to],
    ),
  ]);
  for (const { roomTypeId, ...r } of res.rows) out.get(roomTypeId)?.reservations.push(r as ReservationLike);
  for (const { roomTypeId, ...b } of blk.rows) out.get(roomTypeId)?.blocks.push(b as Interval);
  return out;
}

// Đầu vào của canBook/maxConcurrent: đơn còn hiệu lực + khóa.
export const intervalsForCheck = (r: { reservations: ReservationLike[]; blocks: Interval[] }, now: Date): Interval[] => [...r.reservations.filter((x) => isActive(x, now)), ...r.blocks];

// Còn đủ `qty` phòng trong khoảng [from, to) không (trừ đơn `excludeBookingId`, ví dụ khi dời ngày chính đơn đó). Gọi sau `FOR UPDATE room_types`.
export async function isRoomAvailable(tx: Db, a: { roomTypeId: string; roomTotal: number; from: Date; to: Date; qty: number; excludeBookingId?: string; now?: Date }): Promise<boolean> {
  const now = a.now ?? new Date();
  const used = intervalsForCheck(await loadActiveIntervals(tx, a.roomTypeId, a.from, a.to, now, a.excludeBookingId), now);
  return canBook(a.roomTotal, used, { from: a.from, to: a.to, qty: a.qty });
}
