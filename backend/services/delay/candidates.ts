import { maxConcurrent } from '@airrest/business-logic';
import type { BedType } from '@airrest/shared-types';
import { db } from '../../database/pg';
import { intervalsForCheck, loadActiveIntervals } from '../rooms/availability';
import type { PlanHotel } from './rooms/plan';

const DAY_MS = 24 * 3600_000;
export interface ContractRate { nightRateVnd: number; hourlyRates: Array<{ hours: number; priceVnd: number }> }

/** Giá hợp đồng của một phòng cho khung [from, to): <= 1 đêm lấy bậc giờ rẻ nhất đủ số giờ (không vượt giá đêm); dài hơn thì giá đêm x số đêm. */
export function contractPrice(r: ContractRate, from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  const nights = Math.max(1, Math.ceil(ms / DAY_MS));
  if (nights > 1) return r.nightRateVnd * nights;
  const hours = Math.ceil(ms / 3600_000);
  const tier = [...r.hourlyRates].sort((a, b) => a.hours - b.hours).find((t) => t.hours >= hours);
  return tier ? Math.min(tier.priceVnd, r.nightRateVnd) : r.nightRateVnd;
}

export interface PlanHotelsQuery { payerId: string; airportIata: string; from: Date; to: Date; excludedHotelIds?: string[] }
export interface PlanHotelsResult { hotels: PlanHotel[]; minutesByHotel: Record<string, number> }

interface Row { hotelId: string; minutes: number; cleaning: number; roomTypeId: string; totalRooms: number; capacity: number; bedType: BedType; connecting: boolean; family: boolean; nightRateVnd: number; hourlyRates: ContractRate['hourlyRates'] }

/** Như loadPlanHotels, kèm số phút xe chạy KS -> sân bay (hotels.airports[].minutes) để tính giờ rời KS. */
export async function loadPlanHotelsWithMinutes(q: PlanHotelsQuery): Promise<PlanHotelsResult> {
  // Mỗi loại phòng lấy dòng giá hợp đồng hiệu lực (ngày VN) mới nhất phủ cả khung; KS/loại phòng không có giá thì bị loại.
  const rows = (
    await db.query<Row>(
      `SELECT h.id AS "hotelId", (a->>'minutes')::int AS minutes, coalesce((h.policy->>'cleaningBufferMin')::int, 0) AS cleaning,
              t.id AS "roomTypeId", t.total_rooms AS "totalRooms", t.capacity, t.bed_type AS "bedType", t.connecting, t.family,
              r.night_rate_vnd AS "nightRateVnd", r.hourly_rates AS "hourlyRates"
       FROM hotels h
       CROSS JOIN LATERAL jsonb_array_elements(h.airports) a
       JOIN room_types t ON t.hotel_id = h.id AND t.active
       JOIN LATERAL (
         SELECT night_rate_vnd, hourly_rates FROM payer_hotel_rates
         WHERE payer_id = $1 AND hotel_id = h.id AND room_type_id = t.id AND active
           AND valid_from <= ($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           AND (valid_to IS NULL OR valid_to >= ($4::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
         ORDER BY valid_from DESC LIMIT 1
       ) r ON true
       WHERE h.status = 'ACTIVE' AND upper(a->>'iata') = upper($2) AND NOT (h.id = ANY($5::uuid[]))
       ORDER BY (a->>'km')::numeric, h.id, t.id`,
      [q.payerId, q.airportIata, q.from, q.to, q.excludedHotelIds ?? []],
    )
  ).rows;
  const now = new Date();
  const out = new Map<string, PlanHotel>();
  const minutesByHotel: Record<string, number> = {};
  const avail = await Promise.all(
    rows.map(async (r) => {
      // Cùng khoảng giữ như createPayerBooking: [from, to + dọn phòng); HOLD hết hạn không tính.
      const win = { from: q.from, to: new Date(q.to.getTime() + r.cleaning * 60_000) };
      const used = intervalsForCheck(await loadActiveIntervals(db, r.roomTypeId, win.from, win.to, now), now);
      return Math.max(0, r.totalRooms - maxConcurrent(used, win));
    }),
  );
  rows.forEach((r, i) => {
    const h = out.get(r.hotelId) ?? { hotelId: r.hotelId, roomTypes: [] };
    h.roomTypes.push({ roomTypeId: r.roomTypeId, capacity: r.capacity, bedType: r.bedType, connecting: r.connecting, family: r.family, available: avail[i]!, priceVnd: contractPrice(r, q.from, q.to) });
    out.set(r.hotelId, h);
    minutesByHotel[r.hotelId] = r.minutes;
  });
  return { hotels: [...out.values()], minutesByHotel };
}

/** KS ACTIVE gần sân bay (gần nhất trước) có giá hợp đồng hiệu lực của đơn vị; `available` = tồn còn lại trong khung from-to (đã trừ HOLD chưa hết hạn). */
export async function loadPlanHotels(q: PlanHotelsQuery): Promise<PlanHotel[]> {
  return (await loadPlanHotelsWithMinutes(q)).hotels;
}

/** Giá hợp đồng hiệu lực của một loại phòng cho khung [from, to) (ngày VN); null = không còn giá. */
export async function loadContractRate(payerId: string, roomTypeId: string, from: Date, to: Date): Promise<ContractRate | null> {
  const r = (
    await db.query<ContractRate>(
      `SELECT night_rate_vnd AS "nightRateVnd", hourly_rates AS "hourlyRates" FROM payer_hotel_rates
       WHERE payer_id = $1 AND room_type_id = $2 AND active
         AND valid_from <= ($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (valid_to IS NULL OR valid_to >= ($4::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
       ORDER BY valid_from DESC LIMIT 1`,
      [payerId, roomTypeId, from, to],
    )
  ).rows[0];
  return r ?? null;
}
