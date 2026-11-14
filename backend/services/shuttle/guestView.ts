import { db } from '../../database/pg';
import type { BookingDoc, HotelDoc, ShuttleRequestDoc } from '../../database/types';
import { simFields } from './route';
import { photoUrlOf } from './trips';

// Khách chỉ thấy dữ liệu đã làm sạch: KHÔNG account_id, hotel_id, ghi chú nội bộ, tên nhân viên xử lý, lý do tài xế từ chối.
export const EXTERNAL_MESSAGE = 'Xe của khách sạn hiện đã hết nên khách sạn đang gọi xe ngoài (Grab/Xanh SM) để đón bạn. Bạn sẽ nhận thông tin xe ngay khi có.';
// Chỉ lộ mã lý do hệ thống (ghi chú hủy của khách sạn/khách là nội bộ).
const SAFE_CANCEL = ['no_show', 'auto_expired'];
export const cancelReasonOf = (note?: string | null) => (note && SAFE_CANCEL.includes(note) ? note : null);
const ACCEPTED_PLUS = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD', 'DROPPED_OFF'];

export function guestTripView(t: any) {
  const base = { id: t.id, kind: t.kind, seats: t.seats };
  if (t.status === 'CANCELLED') return { ...base, status: 'CANCELLED', cancelReason: cancelReasonOf(t.cancelNote) };
  if (t.kind === 'EXTERNAL') {
    const has = !!t.shareUrl;
    return {
      ...base, status: t.status, reason: t.externalReason ?? null, message: EXTERNAL_MESSAGE, provider: t.provider ?? null, simulated: !!t.simulated,
      ...(has && { shareUrl: t.shareUrl, shareHost: new URL(t.shareUrl).hostname }),
      ...(t.extPlate && { vehicle: { plate: t.extPlate } }),
      ...((t.extDriverName || t.extPhone) && { driver: { name: t.extDriverName ?? null, phone: t.extPhone ?? null } }),
      ...(t.extEtaAt && { etaAt: t.extEtaAt }),
    };
  }
  // Xe của khách sạn: trước khi tài xế nhận chỉ là "đang tìm xe" (SEARCHING), không lộ xe/tài xế dự kiến.
  if (!ACCEPTED_PLUS.includes(t.status)) return { ...base, status: 'SEARCHING' };
  return {
    ...base, status: t.status,
    vehicle: { plate: t.plate, seats: t.vehicleSeats, model: t.model ?? null },
    driver: { name: t.driverName, phone: t.driverPhone, photoUrl: photoUrlOf(t.photoKey) },
    ...simFields(t),
  };
}

export interface ShuttleGuestView {
  id: string; direction: string; airport: string; pickupAt: Date; location?: string; note?: string; priceVnd: number; status: string; passengers: number; cancelReason: string | null;
  driver?: { name: string; phone: string }; updatedAt: Date; trips: ReturnType<typeof guestTripView>[];
}

// Yêu cầu của một đơn (kèm chuyến đã làm sạch). `only`: chỉ một yêu cầu.
export async function loadGuestShuttles(bookingId: string, only?: string): Promise<ShuttleGuestView[]> {
  const reqs = (await db.query<ShuttleRequestDoc>('SELECT * FROM shuttle_requests WHERE booking_id = $1 AND ($2::uuid IS NULL OR id = $2) ORDER BY seq DESC', [bookingId, only ?? null])).rows;
  if (!reqs.length) return [];
  const trips = (
    await db.query<any>(
      `SELECT t.*, v.plate, v.seats AS vehicle_seats, v.model, d.full_name AS driver_name, d.phone AS driver_phone, d.photo_key
       FROM shuttle_trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN hotel_drivers d ON d.account_id = t.driver_account_id
       WHERE t.request_id = ANY($1::uuid[]) AND t.status <> 'REJECTED' ORDER BY t.seq`,
      [reqs.map((r) => r.id)],
    )
  ).rows;
  return reqs.map((s) => ({
    id: s.id, direction: s.direction, airport: s.airportIata, pickupAt: s.pickupAt, location: s.location, note: s.note, priceVnd: s.priceVnd, status: s.status, passengers: s.passengers, cancelReason: s.status === 'CANCELLED' ? cancelReasonOf(s.cancelNote) : null,
    driver: s.driver, updatedAt: s.updatedAt, trips: trips.filter((t) => t.requestId === s.id).map(guestTripView),
  }));
}

/** Thông tin công khai của khách sạn để khách tự đặt xe (cùng nguồn với GET /v1/hotels/:id; không SĐT/email/hotelId). */
export async function guestHotel(b: Pick<BookingDoc, 'hotelId' | 'hotelSnapshot'>) {
  const h = (await db.query<Pick<HotelDoc, 'name' | 'address' | 'location'>>('SELECT name, address, location FROM hotels WHERE id = $1', [b.hotelId])).rows[0];
  const a = h?.address;
  const address = a ? [a.line, a.ward, a.district, a.city].filter(Boolean).join(', ') : null;
  const c = h?.location?.coordinates;
  return { name: h?.name ?? b.hotelSnapshot.name, address, ...(c && { location: { lat: c[1], lng: c[0] } }) };
}

export type Stage = 'BOOKED' | 'PICKUP_IN' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PICKUP_OUT' | 'DONE' | 'CANCELLED';
const MOVING = ['EN_ROUTE', 'ARRIVED', 'ONBOARD'];

/** Trạng thái chung suy ra từ trạng thái đơn + các yêu cầu xe (không có cột riêng). */
export function deriveStage(bookingStatus: string, shuttles: ShuttleGuestView[]): Stage {
  if (['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(bookingStatus)) return 'CANCELLED';
  const on = (dir: string) => shuttles.filter((s) => s.direction === dir && ['REQUESTED', 'ASSIGNED'].includes(s.status));
  const moving = (dir: string) => on(dir).some((s) => s.trips.some((t) => MOVING.includes(t.status)));
  if (bookingStatus === 'CHECKED_OUT') {
    if (on('TO_AIRPORT').length) return 'PICKUP_OUT';
    return shuttles.some((s) => s.direction === 'TO_AIRPORT' && s.status === 'DONE') ? 'DONE' : 'CHECKED_OUT';
  }
  if (bookingStatus === 'CHECKED_IN') return moving('TO_AIRPORT') ? 'PICKUP_OUT' : 'CHECKED_IN';
  return moving('TO_HOTEL') ? 'PICKUP_IN' : 'BOOKED';
}

const GUEST_EVENTS = ['SHUTTLE_REQUESTED', 'SHUTTLE_CALL_NOW', 'TRIP_OFFERED', 'TRIP_ACCEPTED', 'TRIP_REASSIGNED', 'TRIP_EN_ROUTE', 'TRIP_ARRIVED', 'TRIP_ONBOARD', 'TRIP_DROPPED_OFF', 'TRIP_CANCELLED', 'EXTERNAL_NEEDED', 'EXTERNAL_LINK_SET', 'SHUTTLE_CANCELLED', 'SHUTTLE_DONE'];

/** Phần mở rộng của phản hồi tra cứu: stage + xe + nhật ký rút gọn (chỉ thời điểm và loại sự kiện, không lộ người thao tác). */
export async function guestShuttleState(b: Pick<BookingDoc, 'id' | 'status' | 'hotelId' | 'hotelSnapshot'>) {
  const shuttles = await loadGuestShuttles(b.id);
  const events = (await db.query<{ at: Date; type: string }>('SELECT at, type FROM booking_events WHERE booking_id = $1 AND type = ANY($2::text[]) ORDER BY seq LIMIT 200', [b.id, GUEST_EVENTS])).rows;
  return { stage: deriveStage(b.status, shuttles), shuttles, events, hotel: await guestHotel(b) };
}
