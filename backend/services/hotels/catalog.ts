import { remainingRooms } from '@airrest/business-logic';
import { db } from '../../database/pg';
import type { HotelDoc, RoomTypeDoc } from '../../database/types';
import { intervalsForCheck, loadActiveIntervals } from '../rooms/availability';

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

export type PublicRoom = { id: string; hotelId: string; name: string; capacity: number; beds: number; areaM2: number; baseNightVnd: number; roomsLeft: number };

// Loại phòng đang bán + số phòng còn trong cửa sổ [from, to) (sweep-line như lúc đặt phòng). Mỗi loại phòng 2 truy vấn, giới hạn bởi limit của danh sách.
export async function publicRooms(hotelIds: string[], window: { from: Date; to: Date }, now = new Date()): Promise<Map<string, PublicRoom[]>> {
  const byHotel = new Map<string, PublicRoom[]>();
  if (!hotelIds.length) return byHotel;
  const rts = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE hotel_id = ANY($1::uuid[]) AND active ORDER BY hotel_id, name', [hotelIds])).rows;
  await Promise.all(
    rts.map(async (rt) => {
      const used = intervalsForCheck(await loadActiveIntervals(db, rt.id, window.from, window.to, now), now);
      const room: PublicRoom = { id: rt.id, hotelId: rt.hotelId, name: rt.name, capacity: rt.capacity, beds: rt.beds, areaM2: rt.areaM2, baseNightVnd: Number(rt.pricing.baseNightVnd), roomsLeft: Math.max(0, remainingRooms(rt.totalRooms, used, window)) };
      byHotel.set(rt.hotelId, [...(byHotel.get(rt.hotelId) ?? []), room]);
    }),
  );
  for (const [k, v] of byHotel) byHotel.set(k, v.sort((x, y) => x.baseNightVnd - y.baseNightVnd));
  return byHotel;
}
