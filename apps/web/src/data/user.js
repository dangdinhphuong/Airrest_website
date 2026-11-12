// Dữ liệu cho các màn người dùng cuối: gọi API thật /v1/* (công khai, không đăng nhập). Backend: backend/api/modules/*.
import { newIdempotencyKey } from '@airrest/api-client';
import { api, asGuest, describeError } from '../lib/api';

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

// Tên trường kỹ thuật trong thông báo lỗi của backend -> tên tiếng Việt cho khách.
const FIELD_VI = { newFrom: 'Ngày nhận mới', newTo: 'Ngày trả mới', checkIn: 'Ngày nhận phòng', checkOut: 'Ngày trả phòng', from: 'Ngày nhận phòng', to: 'Ngày trả phòng', phone: 'Số điện thoại', code: 'Mã', fullName: 'Họ và tên', email: 'Email', subject: 'Tiêu đề', message: 'Nội dung', reasonNote: 'Ghi chú', reasonCode: 'Lý do', pickupAt: 'Giờ đón', location: 'Điểm đón', bookingCode: 'Mã booking' };
export function describeApiError(e) {
  return describeError(e).replace(/\b(newFrom|newTo|checkIn|checkOut|from|to|phone|code|fullName|email|subject|message|reasonNote|reasonCode|pickupAt|location|bookingCode)\b(?=\s+(phải|không|là|quá|tối|bắt|sai|thiếu))/g, (m) => FIELD_VI[m] ?? m);
}

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
  const apiImgs = Array.isArray(h.images) ? h.images.map((x) => (typeof x === 'string' ? x : x?.url)).filter((x) => typeof x === 'string' && x) : [];
  const gallery = apiImgs.length ? apiImgs : [IMAGES[Number(String(h.code).slice(-2)) % IMAGES.length || 0]];
  return {
    id: h.id, name: h.name, code: h.code, airportCode: ap?.iata ?? iata, distanceKm: ap?.km ?? 0, travelMinutes: ap?.minutes ?? 0,
    image: gallery[0], images: gallery,
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
  const { booking, paymentLink } = await api.post('/v1/bookings', { hotelId, roomTypeId, qty: 1, paymentMethod, from, to, guest }, { auth: asGuest(), idempotencyKey: idempotencyKey ?? newIdempotencyKey() }); // khách đã đăng nhập: gửi Bearer để đơn gắn vào tài khoản
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

// ---- Tra cứu / trả lời ticket hỗ trợ (mã SP-XXXXXXXX + SĐT) ----
export const lookupTicket = (code, phone) => api.post('/v1/support/lookup', { code, phone }, { auth: false }).then((r) => r.ticket);
export const replyTicket = (code, phone, message) => api.post('/v1/support/reply', { code, phone, message }, { auth: false, idempotencyKey: newIdempotencyKey() }).then((r) => r.ticket);

// ---- Tài khoản hành khách (backend: /v1/auth/passenger/*, /v1/auth/me, /v1/me/*) ----
export const USERNAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const FULLNAME_MAX = 100;
const LOOKS_LIKE_CONTACT = /@|\d{6,}/;

// Luật kiểm tra phía client khớp backend (services/passengers/passengers.service.ts); máy chủ vẫn kiểm lại.
export function validateRegister({ username, password, confirm, fullName }) {
  const n = (username || '').normalize('NFC').trim();
  const errors = {};
  if (!n) errors.username = 'Nhập tên đăng nhập.';
  else if (n.length > USERNAME_MAX) errors.username = `Tên đăng nhập tối đa ${USERNAME_MAX} ký tự.`;
  else if (LOOKS_LIKE_CONTACT.test(n)) errors.username = 'Không nhập email hoặc số điện thoại. Airrest không thu thông tin liên hệ (BR-002).';
  if ((fullName || '').trim().length > FULLNAME_MAX) errors.fullName = `Họ và tên tối đa ${FULLNAME_MAX} ký tự.`;
  if (!password) errors.password = 'Nhập mật khẩu.';
  else if (password.length < PASSWORD_MIN) errors.password = `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`;
  else if (password.length > PASSWORD_MAX) errors.password = `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  if (!errors.password) {
    if (!confirm) errors.confirm = 'Nhập lại mật khẩu.';
    else if (password !== confirm) errors.confirm = 'Mật khẩu nhập lại không khớp.';
  }
  return errors;
}

// Lỗi của API tài khoản khách -> câu tiếng Việt.
export function describeAuthError(e) {
  if (e?.code === 'USERNAME_TAKEN') return 'Tên đăng nhập đã được dùng.';
  if (e?.code === 'INVALID_CREDENTIALS') return 'Sai tên đăng nhập hoặc mật khẩu.';
  if (e?.code === 'WRONG_CURRENT_PASSWORD') return 'Mật khẩu hiện tại không đúng.';
  if (e?.code === 'SAME_PASSWORD') return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (e?.status === 429) return 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  return describeApiError(e);
}

const userView = (u) => ({ id: u.id, username: u.username ?? '', fullName: u.fullName ?? '', name: u.fullName || u.username || 'Tài khoản' });

// Đăng ký / đăng nhập: trả { token, user }; người gọi tự lưu token (setGuestToken) rồi cập nhật store.
export async function registerPassenger({ username, password, fullName }) {
  const r = await api.post('/v1/auth/passenger/register', { username: username.trim(), password, ...(fullName?.trim() && { fullName: fullName.trim() }) }, { auth: false });
  return { token: r.token, user: userView(r.user) };
}
export async function loginPassenger(username, password) {
  const r = await api.post('/v1/auth/passenger/login', { username: username.trim(), password }, { auth: false });
  return { token: r.token, user: userView(r.user) };
}
// Khôi phục phiên khách từ token đang giữ; ném lỗi nếu token không phải của khách.
export async function fetchMe() {
  const { user } = await api.get('/v1/auth/me');
  if (user?.type !== 'PASSENGER') throw Object.assign(new Error('not passenger'), { status: 403 });
  return userView(user);
}
export const changePassword = (currentPassword, newPassword) => api.patch('/v1/me/password', { currentPassword, newPassword });
export const listMyBookings = (cursor, signal) => api.get('/v1/me/bookings', { query: { limit: 10, cursor }, signal });
