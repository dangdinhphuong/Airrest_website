// Dữ liệu cho các màn người dùng cuối: gọi API thật /v1/* (công khai, không đăng nhập). Backend: backend/api/modules/*.
import { newIdempotencyKey } from '@airrest/api-client';
import { api } from '../lib/api';

const IMAGES = ['/images/hotel-1.jpg', '/images/hotel-2.jpg', '/images/hotel-3.jpg'];
// Tag trong hotels.amenities -> nhãn hiển thị (xem backend/services/hotels/catalog.ts).
const AMENITY_LABEL = {
  HOT_WATER: 'Tắm nước nóng', WIFI: 'Wifi', LUGGAGE: 'Gửi hành lý', AIR_CON: 'Điều hòa', KITCHENETTE: 'Bếp nhỏ',
  SHUTTLE_FREE: 'Xe đưa đón miễn phí', SHUTTLE_PAID: 'Xe đưa đón có phí', SHUTTLE: 'Xe đưa đón', '24H_RECEPTION': 'Lễ tân 24/24', HOURLY: 'Thuê theo giờ', FAMILY_ROOM: 'Phòng gia đình',
};

// Danh mục sân bay thương mại Việt Nam từ backend (GET /v1/airports), tải một lần rồi dùng lại.
let airports = [];
let airportsP = null;
export const listAirports = () => (airportsP ??= api.get('/v1/airports', { auth: false }).then((r) => (airports = r.items)).catch((e) => { airportsP = null; throw e; }));
export const getAirports = () => airports; // đồng bộ, dùng sau khi listAirports() đã xong
export const airportName = (iata) => airports.find((a) => a.iata === iata)?.name ?? iata;
export const airportCity = (iata) => airports.find((a) => a.iata === iata)?.city ?? '';

const receptionLabel = (f) => (f.reception24 ? 'Lễ tân 24/24' : f.receptionCloseHour != null ? `Nhận khách đến ${String(f.receptionCloseHour % 24).padStart(2, '0')}:00` : 'Liên hệ khách sạn để biết giờ nhận khách');

function roomView(r, freeCancel) {
  return { id: r.id, name: r.name, price: r.baseNightVnd, maxOccupancy: r.capacity, beds: r.beds, areaM2: r.areaM2, cancellationPolicy: freeCancel ? 'Hủy miễn phí' : 'Không hoàn hủy', availableRooms: r.roomsLeft };
}

// Khách sạn từ API -> dạng hiển thị của thẻ nơi nghỉ. `room` = loại phòng rẻ nhất còn phòng (hoặc rẻ nhất nếu hết).
export function toHotelView(h, iata) {
  const rooms = (h.rooms ?? []).map((r) => roomView(r, h.features.freeCancel));
  if (!rooms.length) return null;
  const ap = h.airports.find((a) => a.iata === iata) ?? h.airports[0];
  const f = h.features;
  return {
    id: h.id, name: h.name, code: h.code, airportCode: ap?.iata ?? iata, distanceKm: ap?.km ?? 0, travelMinutes: ap?.minutes ?? 0,
    image: IMAGES[Number(String(h.code).slice(-2)) % IMAGES.length || 0],
    rating: h.rating?.count ? Number(h.rating.avg).toFixed(1) : null,
    amenities: h.amenities.map((a) => AMENITY_LABEL[a]).filter(Boolean),
    shuttleAvailable: f.shuttle !== 'none', freeCancel: f.freeCancel, hourly: f.hourly, familyRoom: f.family, reception24: f.reception24,
    receptionLabel: receptionLabel(f), address: h.address?.line ?? '', description: h.description ?? '',
    room: rooms.find((r) => r.availableRooms > 0) ?? rooms[0], rooms,
  };
}

export async function listHotels(airport, signal) {
  const { items } = await api.get('/v1/hotels', { query: { airport, limit: 50 }, signal });
  return items.map((h) => toHotelView(h, airport)).filter(Boolean);
}

export async function getHotel(id, signal) {
  const { hotel, rooms } = await api.get(`/v1/hotels/${id}`, { signal });
  return toHotelView({ ...hotel, rooms }, hotel.airports[0]?.iata);
}

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null);

// Trạng thái chuyến bay (dữ liệu mô phỏng ở backend). Ném ApiError 404 FLIGHT_NOT_FOUND khi không có chuyến.
export async function lookupFlight(code, dateIso) {
  const f = await api.get(`/v1/flights/${encodeURIComponent(code)}`, { query: { date: dateIso } });
  return {
    code: f.code, origin: f.origin, dest: f.dest, status: f.status.toLowerCase(), delayMinutes: f.delayMinutes,
    schedTime: hhmm(f.scheduledDepartureAt), newTime: hhmm(f.newDepartureAt), updatedAt: hhmm(f.asOf),
  };
}

// Thời gian lưu trú theo ngày nhận/trả (giờ VN): nhận 14:00 (hoặc ngay bây giờ nếu hôm nay đã quá), trả 12:00.
export function stayWindow(checkIn, checkOut) {
  const from = new Date(Math.max(Date.now() + 60_000, new Date(`${checkIn}T14:00:00+07:00`).getTime()));
  return { from, to: new Date(`${checkOut}T12:00:00+07:00`) };
}

export async function createBooking({ hotelId, roomTypeId, guest, checkIn, checkOut, paymentMethod, idempotencyKey }) {
  const { from, to } = stayWindow(checkIn, checkOut);
  const { booking, paymentLink } = await api.post('/v1/bookings', { hotelId, roomTypeId, qty: 1, paymentMethod, from, to, guest }, { auth: false, idempotencyKey: idempotencyKey ?? newIdempotencyKey() });
  return { ...booking, paymentLink };
}

export async function lookupBooking(code, phone) {
  const { booking } = await api.post('/v1/bookings/lookup', { code, phone }, { auth: false });
  return booking;
}

export async function getPaymentLink(code, phone) {
  const { paymentLink } = await api.post('/v1/payments/vnpay/link', { code, phone }, { auth: false });
  return paymentLink;
}

// Chỉ có khi backend chạy VNPAY_MODE=mock (không production): giả lập VNPay gọi IPN.
export const simulatePayment = (orderId, success) => api.post('/v1/payments/vnpay/dev-simulate', { orderId, resultCode: success ? 0 : 24 }, { auth: false });

export async function createTicket({ bookingCode, phone, fullName, email, subject, message }) {
  const { ticket } = await api.post('/v1/support', { bookingCode: bookingCode || undefined, phone, fullName: fullName || undefined, email: email || undefined, subject, message }, { auth: false, idempotencyKey: newIdempotencyKey() });
  return ticket;
}

// ---- Hủy / đổi ngày (khách xác thực bằng mã booking + SĐT) ----
export const quoteCancel = (code, phone) => api.post('/v1/change-requests/quote', { code, phone }, { auth: false }).then((r) => r.quote);
export const createChangeRequest = (body) => api.post('/v1/change-requests', body, { auth: false, idempotencyKey: newIdempotencyKey() }).then((r) => r.request);
export const listChangeRequests = (code, phone) => api.post('/v1/change-requests/lookup', { code, phone }, { auth: false }).then((r) => r.requests);

// ---- Xe đưa đón gắn booking ----
export const quoteShuttle = (body) => api.post('/v1/shuttle-requests/quote', body, { auth: false }).then((r) => r.quote);
export const createShuttle = (body) => api.post('/v1/shuttle-requests', body, { auth: false, idempotencyKey: newIdempotencyKey() }).then((r) => r.shuttle);
export const listShuttles = (code, phone) => api.post('/v1/shuttle-requests/lookup', { code, phone }, { auth: false }).then((r) => r.shuttles);
export const cancelShuttle = (id, code, phone) => api.post(`/v1/shuttle-requests/${id}/cancel`, { code, phone }, { auth: false }).then((r) => r.shuttle);
