import { db } from '../../database/pg';
import { shuttleBus, type ShuttleEvent } from '../../services/shuttle/events';
import { notify } from '../../services/notifications';
import { emitToRoom, rooms } from './socket';

const SHUTTLE_NOTE: Record<string, string> = { TRIP_REJECTED: 'Tài xế từ chối chuyến', TRIP_CANCELLED: 'Chuyến xe bị hủy', TRIP_REASSIGNED: 'Chuyến xe được gán lại' };

// Sự kiện chuyến xe (đã SAU commit) -> Socket.IO `shuttle:update`. Payload chỉ id + trạng thái: không PII, không xe/ảnh/SĐT (client gọi REST lấy chi tiết).
const codes = new Map<string, string>(); // bookingId -> code (bất biến)
async function codeOf(bookingId: string): Promise<string | undefined> {
  const hit = codes.get(bookingId);
  if (hit) return hit;
  const code = (await db.query<{ code: string }>('SELECT code FROM bookings WHERE id = $1', [bookingId])).rows[0]?.code;
  if (code) { if (codes.size > 5000) codes.clear(); codes.set(bookingId, code); }
  return code;
}

/** Phòng nhận của một sự kiện: khách = phòng đơn; khách sạn = phòng xe của khách sạn (+ phòng admin); tài xế = phòng riêng chỉ khi sự kiện nhắm đúng tài xế đó. */
export function roomsOfEvent(e: ShuttleEvent, bookingCode: string): string[] {
  const out: string[] = [];
  if (e.audience.includes('GUEST')) out.push(rooms.booking(bookingCode));
  if (e.audience.includes('HOTEL')) out.push(rooms.hotelShuttle(e.hotelId), rooms.adminShuttle());
  if (e.audience.includes('DRIVER') && e.driverAccountId) out.push(rooms.driver(e.driverAccountId));
  return out;
}

export function startShuttleStream(): () => void {
  const onEvent = (e: ShuttleEvent) => {
    void (async () => {
      const bookingCode = await codeOf(e.bookingId);
      if (!bookingCode) return;
      const status = typeof e.payload.status === 'string' ? e.payload.status : undefined;
      const msg = { type: e.type, bookingCode, tripId: e.tripId, requestId: e.requestId, status, at: new Date().toISOString() };
      if (e.type === 'EXTERNAL_NEEDED') await notify(e.hotelId, 'SHUTTLE_EXTERNAL', { title: `Hết xe, cần gọi xe ngoài cho đơn ${bookingCode}`, refCode: bookingCode, dedupeKey: `SHUTTLE_EXTERNAL:${e.tripId ?? bookingCode}` });
      else if (SHUTTLE_NOTE[e.type]) await notify(e.hotelId, 'SHUTTLE_UPDATE', { title: `${SHUTTLE_NOTE[e.type]} (đơn ${bookingCode})`, refCode: bookingCode, dedupeKey: `SHUTTLE_UPDATE:${e.type}:${e.tripId ?? bookingCode}:${Date.now()}` });
      for (const r of roomsOfEvent(e, bookingCode)) emitToRoom(r, 'shuttle:update', msg);
    })().catch(() => undefined);
  };
  shuttleBus.on('event', onEvent);
  return () => void shuttleBus.off('event', onEvent);
}
