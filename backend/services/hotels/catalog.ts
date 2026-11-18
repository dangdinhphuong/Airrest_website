import { canBook, dayWindow, hourlyOf, hourlyPrice, hourlyViolation, hourlyWindow, remainingRooms, vnClock, type HourlyConfig } from '@airrest/business-logic';
import { AppError } from '../../lib/errors';
import { openHotel } from './open';
import { db } from '../../database/pg';
import type { HotelDoc, RoomTypeDoc } from '../../database/types';
import { intervalsForCheck, loadActiveIntervals, loadActiveIntervalsMany } from '../rooms/availability';

// Cờ tính năng công khai của khách sạn, suy ra từ dữ liệu có sẵn (KHÔNG đổi schema):
//  - hotels.amenities mang thêm tag: SHUTTLE_FREE | SHUTTLE_PAID | SHUTTLE (cũ, coi là miễn phí), 24H_RECEPTION, HOURLY, FAMILY_ROOM
//  - hotels.policy.cancellationTemplate = FLEXIBLE  => hủy miễn phí;  hotels.policy.receptionCloseHour (0-26, 24 = 00:00) khi không có lễ tân 24/24
export function hotelFeatures(h: Pick<HotelDoc, 'amenities' | 'policy'>) {
  const a = new Set(h.amenities);
  return {
    shuttle: a.has('SHUTTLE_PAID') ? ('paid' as const) : a.has('SHUTTLE_FREE') || a.has('SHUTTLE') ? ('free' as const) : ('none' as const),
    hourly: a.has('HOURLY'),
    family: a.has('FAMILY_ROOM'),
    reception24: a.has('24H_RECEPTION'),
    receptionCloseHour: h.policy.receptionCloseHour ?? null,
    freeCancel: h.policy.cancellationTemplate === 'FLEXIBLE',
  };
}

export type PublicRoom = { id: string; hotelId: string; name: string; capacity: number; beds: number; areaM2: number; baseNightVnd: number; nonRefundablePct?: number; roomsLeft: number; hourly?: HourlyConfig | null };

// Loại phòng đang bán + số phòng còn trong cửa sổ [from, to) (sweep-line như lúc đặt phòng). Tổng cộng 3 truy vấn cho cả danh sách (khách sạn đã lấy trước): loại phòng, đơn giữ chỗ, khóa phòng.
export async function publicRooms(hotelIds: string[], window: { from: Date; to: Date }, now = new Date()): Promise<Map<string, PublicRoom[]>> {
  const byHotel = new Map<string, PublicRoom[]>();
  if (!hotelIds.length) return byHotel;
  const rts = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE hotel_id = ANY($1::uuid[]) AND active ORDER BY hotel_id, name', [hotelIds])).rows;
  const intervals = await loadActiveIntervalsMany(db, rts.map((rt) => rt.id), window.from, window.to, now); // 2 truy vấn cho mọi loại phòng (trước đây 2 truy vấn mỗi loại)
  await Promise.all(
    rts.map(async (rt) => {
      const used = intervalsForCheck(intervals.get(rt.id)!, now);
      const room: PublicRoom = { id: rt.id, hotelId: rt.hotelId, name: rt.name, capacity: rt.capacity, beds: rt.beds, areaM2: rt.areaM2, baseNightVnd: Number(rt.pricing.baseNightVnd), ...(rt.pricing.nonRefundablePct && { nonRefundablePct: rt.pricing.nonRefundablePct }), roomsLeft: Math.max(0, remainingRooms(rt.totalRooms, used, window)), hourly: hourlyOf(rt.pricing) };
      byHotel.set(rt.hotelId, [...(byHotel.get(rt.hotelId) ?? []), room]);
    }),
  );
  for (const [k, v] of byHotel) byHotel.set(k, v.sort((x, y) => x.baseNightVnd - y.baseNightVnd));
  return byHotel;
}

export type HourlySlot = { startsAt: Date; endsAt: Date; time: string; now?: true; available: boolean; reason?: 'PAST' | 'CLOSED' | 'FULL' };
const SLOT_MS = 30 * 60_000;

/**
 * Các giờ vào trong một ngày (giờ VN) cho phòng theo giờ: mỗi 30 phút (+ mốc "Bây giờ" làm tròn lên 5 phút nếu là hôm nay), kèm còn/không và lý do.
 * Còn phòng = canBook trên khoảng [giờ vào, giờ ra + dọn phòng) như lúc đặt thật; chỉ đọc, không giữ chỗ.
 */
export async function hourlySlots(hotelId: string, q: { roomTypeId: string; date: string; hours: number; qty: number }, now = new Date()) {
  const rt = (await db.query<RoomTypeDoc>(`SELECT rt.* FROM room_types rt JOIN hotels h ON h.id = rt.hotel_id AND ${openHotel('h')} WHERE rt.id = $1 AND rt.hotel_id = $2 AND rt.active`, [q.roomTypeId, hotelId])).rows[0];
  if (!rt) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng');
  const cfg = hourlyOf(rt.pricing);
  if (!cfg) throw new AppError(422, 'HOURLY_NOT_ENABLED', `${rt.name} không bán theo giờ`, { roomTypeId: rt.id });
  if (q.hours < cfg.minHours || q.hours > cfg.maxHours) throw new AppError(422, 'HOURS_OUT_OF_RANGE', `Số giờ phải từ ${cfg.minHours} đến ${cfg.maxHours} giờ`, { roomTypeId: rt.id, hours: q.hours, minHours: cfg.minHours, maxHours: cfg.maxHours });
  const day = dayWindow(q.date);
  const reach = new Date(day.to.getTime() + (q.hours * 60 + cfg.cleaningMin) * 60_000);
  const used = intervalsForCheck(await loadActiveIntervals(db, rt.id, day.from, reach, now), now);
  const starts = Array.from({ length: 48 }, (_, i) => new Date(day.from.getTime() + i * SLOT_MS));
  const nowSlot = new Date(Math.ceil(now.getTime() / 300_000) * 300_000);
  if (vnClock(nowSlot).date === q.date) starts.push(nowSlot);
  const slots: HourlySlot[] = starts
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((s, i, a) => i === 0 || s.getTime() !== a[i - 1]!.getTime())
    .flatMap((startsAt): HourlySlot[] => {
      const { endsAt, holdTo } = hourlyWindow(startsAt, q.hours, cfg.cleaningMin);
      const isNow = startsAt.getTime() === nowSlot.getTime();
      const c = vnClock(startsAt);
      if (c.hour < (cfg.openFromHour ?? 0) || c.hour >= (cfg.openToHour ?? 24)) return []; // ngoài khung bán: ẩn hẳn
      const closed = hourlyViolation(cfg, startsAt, q.hours) === 'OUTSIDE_OPEN_HOURS'; // vào được nhưng ở quá giờ đóng bán
      const reason = startsAt.getTime() < now.getTime() - 5 * 60_000 ? 'PAST' : closed ? 'CLOSED' : !canBook(rt.totalRooms, used, { from: startsAt, to: holdTo, qty: q.qty }) ? 'FULL' : undefined;
      return [{ startsAt, endsAt, time: new Date(startsAt.getTime() + 7 * 3600_000).toISOString().slice(11, 16), ...(isNow && { now: true as const }), available: !reason, ...(reason && { reason }) }];
    });
  return { roomTypeId: rt.id, date: q.date, hours: q.hours, qty: q.qty, priceVnd: hourlyPrice(cfg, q.hours) * q.qty, hourly: cfg, slots };
}

// ---- Tìm kiếm có lọc/sắp xếp (GET /v1/hotels với tham số tìm kiếm) ----
export type HotelSort = 'distance' | 'price' | 'rating';
export type HotelSearch = {
  sort: HotelSort; guests?: number; rooms: number; maxKm?: number; priceUnder?: number; minPrice?: number; maxPrice?: number; minRating?: number; minReviews?: number;
  shuttle?: boolean; freeCancel?: boolean; hourly?: boolean; family?: boolean; reception24?: boolean; limit: number;
};
type SearchHotel = Pick<HotelDoc, 'airports' | 'rating' | 'amenities' | 'policy'> & { rooms: PublicRoom[] };

// Loại phòng "đại diện" của khách sạn = rẻ nhất đủ chỗ (sức chứa × số phòng >= số khách) và còn đủ phòng; khách sạn không có thì bị loại.
// Các điều kiện giá/lọc áp lên loại phòng này. `rooms` đã sắp theo giá tăng dần (publicRooms).
// `priceRange` = giá/đêm thấp nhất và cao nhất của loại phòng đại diện trong các khách sạn đủ chỗ (chưa áp lọc nào), làm biên cho thanh kéo giá; null nếu không có khách sạn.
export function searchHotels<T extends SearchHotel>(hotels: T[], iata: string, f: HotelSearch): { items: T[]; total: number; priceRange: { min: number; max: number } | null } {
  const km = (h: T) => h.airports.find((a) => a.iata === iata);
  const best = (h: T) => h.rooms.find((r) => r.roomsLeft >= f.rooms && r.capacity * f.rooms >= (f.guests ?? 0));
  const score = (h: T) => (h.rating?.count ? Number(h.rating.avg.toFixed(1)) : null);
  const flag = (want: boolean | undefined, has: boolean) => want === undefined || !want || has; // chỉ lọc khi cờ = true
  const prices = hotels.map((h) => best(h)?.baseNightVnd).filter((p): p is number => p !== undefined);
  const priceRange = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  const kept = hotels.filter((h) => {
    const room = best(h);
    const ft = hotelFeatures(h);
    return !!room
      && (f.maxKm === undefined || (km(h)?.km ?? Infinity) <= f.maxKm)
      && (f.priceUnder === undefined || room.baseNightVnd < f.priceUnder)
      && (f.minPrice === undefined || room.baseNightVnd >= f.minPrice)
      && (f.maxPrice === undefined || room.baseNightVnd <= f.maxPrice)
      && (f.minReviews === undefined || (h.rating?.count ?? 0) >= f.minReviews)
      && (f.minRating === undefined || (score(h) ?? -1) >= f.minRating)
      && flag(f.shuttle, ft.shuttle !== 'none') && flag(f.freeCancel, ft.freeCancel) && flag(f.hourly, ft.hourly) && flag(f.family, ft.family) && flag(f.reception24, ft.reception24);
  });
  const byDist = (a: T, b: T) => (km(a)?.km ?? 0) - (km(b)?.km ?? 0) || (km(a)?.minutes ?? 0) - (km(b)?.minutes ?? 0);
  const cmp = {
    distance: byDist,
    price: (a: T, b: T) => best(a)!.baseNightVnd - best(b)!.baseNightVnd,
    rating: (a: T, b: T) => (score(b) ?? -1) - (score(a) ?? -1) || byDist(a, b),
  }[f.sort];
  return { items: kept.sort(cmp).slice(0, f.limit), total: kept.length, priceRange };
}
