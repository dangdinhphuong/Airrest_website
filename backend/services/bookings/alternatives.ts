import { canBook } from '@airrest/business-logic';
import type { Db } from '../../database/pg';
import type { Alternative } from '../../database/types';
import { intervalsForCheck, loadActiveIntervals } from '../rooms/availability';

interface Row {
  hotelId: string;
  hotelName: string;
  policy: { cleaningBufferMin?: number };
  airports: Array<{ iata: string; km: number }>;
  roomTypeId: string;
  roomTypeName: string;
  totalRooms: number;
  pricing: { baseNightVnd: number };
}

/**
 * Tối đa `limit` khách sạn thay thế còn phòng cho đơn bị từ chối (FR-23): cùng sân bay, ACTIVE, mỗi khách sạn một loại phòng rẻ nhất còn đủ `qty`.
 * Chỉ đọc, không khóa. Sắp xếp km tăng, giá tăng, tên.
 */
export async function suggestAlternatives(tx: Db, input: { hotelId: string; from: Date; to: Date; qty: number; now: Date }, limit = 3): Promise<Alternative[]> {
  const origin = (await tx.query<{ airports: Array<{ iata: string }> }>('SELECT airports FROM hotels WHERE id = $1', [input.hotelId])).rows[0];
  const iatas = (origin?.airports ?? []).map((a) => a.iata);
  if (!iatas.length) return [];

  const rows = (
    await tx.query<Row>(
      `SELECT h.id AS hotel_id, h.name AS hotel_name, h.policy, h.airports, rt.id AS room_type_id, rt.name AS room_type_name, rt.total_rooms, rt.pricing
       FROM hotels h JOIN room_types rt ON rt.hotel_id = h.id AND rt.active AND rt.retired_at IS NULL
       WHERE h.status = 'ACTIVE' AND h.id <> $1
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(h.airports) a WHERE a->>'iata' = ANY($2::text[]))`,
      [input.hotelId, iatas],
    )
  ).rows;

  // Gần nhất theo sân bay trùng; giữ 50 khách sạn gần nhất để chặn chi phí kiểm tồn.
  const nearest = (r: Row) => r.airports.filter((a) => iatas.includes(a.iata)).reduce((m, a) => (a.km < m.km ? a : m));
  const byHotel = new Map<string, Row[]>();
  for (const r of rows) byHotel.set(r.hotelId, [...(byHotel.get(r.hotelId) ?? []), r]);
  const hotels = [...byHotel.values()].map((rs) => ({ rs, near: nearest(rs[0]!) })).sort((a, b) => a.near.km - b.near.km).slice(0, 50);

  const out: Alternative[] = [];
  for (const { rs, near } of hotels) {
    const to = new Date(input.to.getTime() + (rs[0]!.policy.cleaningBufferMin ?? 0) * 60_000);
    let best: Row | undefined;
    for (const rt of rs.sort((a, b) => a.pricing.baseNightVnd - b.pricing.baseNightVnd)) {
      const used = intervalsForCheck(await loadActiveIntervals(tx, rt.roomTypeId, input.from, to, input.now), input.now);
      if (canBook(rt.totalRooms, used, { from: input.from, to, qty: input.qty })) {
        best = rt;
        break;
      }
    }
    if (best) out.push({ hotelId: best.hotelId, hotelName: best.hotelName, roomTypeId: best.roomTypeId, roomTypeName: best.roomTypeName, baseNightVnd: best.pricing.baseNightVnd, airport: near.iata, km: near.km });
  }
  return out.sort((a, b) => a.km - b.km || a.baseNightVnd - b.baseNightVnd || a.hotelName.localeCompare(b.hotelName)).slice(0, limit);
}
