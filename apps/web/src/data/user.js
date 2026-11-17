// Dữ liệu cho các màn người dùng cuối: gọi API thật /v1/* (công khai, không đăng nhập). Backend: backend/api/modules/*.
import { ApiError, newIdempotencyKey } from '@airrest/api-client';
import { api, apiBase, asGuest, describeError } from '../lib/api';

const IMAGES = ['/images/hotel-1.jpg', '/images/hotel-2.jpg', '/images/hotel-3.jpg'];
// Tag trong hotels.amenities -> nhãn hiển thị (xem backend/services/hotels/catalog.ts).
export const AMENITY_LABEL = {
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
const FIELD_VI = { newFrom: 'Ngày nhận mới', newTo: 'Ngày trả mới', checkIn: 'Ngày nhận phòng', checkOut: 'Ngày trả phòng', from: 'Ngày nhận phòng', to: 'Ngày trả phòng', phone: 'Số điện thoại', code: 'Mã', fullName: 'Họ và tên', email: 'Email', subject: 'Tiêu đề', message: 'Nội dung', reasonNote: 'Ghi chú', reasonCode: 'Lý do', pickupAt: 'Giờ đón', passengers: 'Số khách đi xe', location: 'Điểm đón', bookingCode: 'Mã booking' };
export function describeApiError(e) {
  return describeError(e).replace(/\b(newFrom|newTo|checkIn|checkOut|from|to|phone|code|fullName|email|subject|message|reasonNote|reasonCode|pickupAt|location|bookingCode)\b(?=\s+(phải|không|là|quá|tối|bắt|sai|thiếu))/g, (m) => FIELD_VI[m] ?? m);
}

const receptionLabel = (f) => (f.reception24 ? 'Lễ tân 24/24' : f.receptionCloseHour != null ? `Nhận khách đến ${String(f.receptionCloseHour % 24).padStart(2, '0')}:00` : 'Liên hệ khách sạn để biết giờ nhận khách');

// Giá/đêm của mức Không hoàn hủy: khớp backend (giảm pct%, làm tròn 1.000đ); giá chốt cuối do server tính.
export const nonRefundableNight = (base, pct) => Math.round((base * (100 - pct)) / 100 / 1000) * 1000;

function roomView(r, freeCancel) {
  return { id: r.id, name: r.name, price: r.baseNightVnd, nonRefundablePct: r.nonRefundablePct ?? null, nonRefundablePrice: r.nonRefundablePct ? nonRefundableNight(r.baseNightVnd, r.nonRefundablePct) : null, maxOccupancy: r.capacity, beds: r.beds, areaM2: r.areaM2, cancellationPolicy: freeCancel ? 'Hủy miễn phí' : 'Không hoàn hủy', availableRooms: r.roomsLeft, hourly: r.hourly?.enabled ? r.hourly : null,
    description: r.description ?? '', view: r.view ?? '', smoking: !!r.smoking, amenities: r.amenities ?? [], images: (r.images ?? []).map((x) => x?.url).filter(Boolean) };
}

// Khách sạn từ API -> dạng hiển thị của thẻ nơi nghỉ. `room` = loại phòng rẻ nhất còn phòng (hoặc rẻ nhất nếu hết).
export function toHotelView(h, iata) {
  const rooms = (h.rooms ?? []).map((r) => roomView(r, h.features.freeCancel));
  if (!rooms.length) return null;
  const ap = h.airports.find((a) => a.iata === iata) ?? (iata ? h.airports[0] : [...h.airports].sort((a, b) => a.km - b.km)[0]); // không chỉ định sân bay: lấy sân bay gần nhất
  const f = h.features;
  const apiImgs = Array.isArray(h.images) ? h.images.map((x) => (typeof x === 'string' ? x : x?.url)).filter((x) => typeof x === 'string' && x) : [];
  const gallery = apiImgs.length ? apiImgs : [IMAGES[Number(String(h.code).slice(-2)) % IMAGES.length || 0]];
  return {
    id: h.id, name: h.name, code: h.code, airportCode: ap?.iata ?? iata, distanceKm: ap?.km ?? 0, travelMinutes: ap?.minutes ?? 0,
    image: gallery[0], images: gallery,
    rating: h.rating?.count ? Number(h.rating.avg).toFixed(1) : null,
    amenities: h.amenities.map((a) => AMENITY_LABEL[a]).filter(Boolean),
    shuttleAvailable: f.shuttle !== 'none', shuttleMode: f.shuttle, airports: h.airports.map((a) => a.iata), freeCancel: f.freeCancel, hourly: f.hourly, familyRoom: f.family, reception24: f.reception24,
    ratingCount: h.rating?.count ?? 0, lat: h.location?.coordinates?.[1], lng: h.location?.coordinates?.[0],
    airportList: [...h.airports].sort((a, b) => a.km - b.km), stay: h.stay ?? null, stats: h.stats ?? null, amenityTags: h.amenities,
    receptionLabel: receptionLabel(f), address: h.address?.line ?? '', description: h.description ?? '',
    room: rooms.find((r) => r.availableRooms > 0) ?? rooms[0], rooms,
  };
}

// `search` (tuỳ chọn): { sort, guests, rooms, maxKm, priceUnder, minRating, shuttle, freeCancel, hourly, family, reception24, limit } — backend lọc/sắp xếp/cắt top N.
// Trả mảng khách sạn (đã đúng thứ tự khi có `sort`); `.total` = số khớp lọc trước khi cắt top N; `.priceRange` = { min, max } giá/đêm của sân bay (biên thanh kéo giá).
export async function listHotels(airport, signal, search = {}) {
  const query = Object.fromEntries(Object.entries({ limit: 50, ...search }).filter(([, v]) => v !== undefined && v !== '' && v !== false));
  const { items, total, priceRange = null } = await api.get('/v1/hotels', { query: { ...(airport && { airport }), ...query }, signal });
  return Object.assign(items.map((h) => toHotelView(h, airport)).filter(Boolean), { total: total ?? items.length, priceRange });
}

// 'Được khách đánh giá cao': toàn hệ thống, sắp theo điểm giảm dần, ưu tiên >= 3 lượt đánh giá.
// shortcut: nếu có < n khách sạn đạt ngưỡng 3 thì hạ xuống >= 1 lượt (hệ thống còn ít đánh giá), bỏ khi dữ liệu đủ dày.
export async function listTopRated(signal, search = {}, n = 4, fetchHotels = listHotels) {
  const run = (minReviews) => fetchHotels(undefined, signal, { ...search, sort: 'rating', minReviews, limit: n });
  const strict = await run(3);
  return strict.length >= n ? strict : run(1);
}

// `window` (tuỳ chọn) = { from, to } (ISO) để số phòng còn tính theo ngày khách chọn.
export async function getHotel(id, signal, window) {
  const { hotel, rooms } = await api.get(`/v1/hotels/${id}`, { signal, ...(window && { query: window }) });
  return toHotelView({ ...hotel, rooms }, hotel.airports[0]?.iata);
}

// Đánh giá của khách (công khai). `cursor` = nextCursor của trang trước.
export const getReviews = (id, cursor, signal) => api.get(`/v1/hotels/${id}/reviews`, { auth: false, signal, query: { limit: 5, ...(cursor && { cursor }) } });
// Gửi đánh giá bằng mã đơn + SĐT của đơn đã trả phòng; điểm 1-10.
export const postReview = (id, body) => api.post(`/v1/hotels/${id}/reviews`, body, { auth: false });

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null);

// Trạng thái chuyến bay (dữ liệu mô phỏng ở backend). Ném ApiError 404 FLIGHT_NOT_FOUND khi không có chuyến.
export async function lookupFlight(code, dateIso) {
  const f = await api.get(`/v1/flights/${encodeURIComponent(code)}`, { query: { date: dateIso } });
  return {
    code: f.code, origin: f.origin, dest: f.dest, status: f.status.toLowerCase(), delayMinutes: f.delayMinutes,
    schedTime: hhmm(f.scheduledDepartureAt), newTime: hhmm(f.newDepartureAt), updatedAt: hhmm(f.asOf), notice: f.notice ?? null,
  };
}

// Thời gian lưu trú theo ngày nhận/trả (giờ VN): nhận 14:00 (hoặc ngay bây giờ nếu hôm nay đã quá), trả 12:00.
// `times` = { checkInTime, checkOutTime } ('HH:MM' giờ VN, khách chọn); thiếu thì dùng 14:00 / 12:00.
export function stayWindow(checkIn, checkOut, times = {}) {
  const inAt = times.checkInTime || CHECKIN_HHMM;
  const outAt = times.checkOutTime || CHECKOUT_HHMM;
  const from = new Date(Math.max(Date.now() + 60_000, new Date(`${checkIn}T${inAt}:00+07:00`).getTime()));
  return { from, to: new Date(`${checkOut}T${outAt}:00+07:00`) };
}

// ---- Khách và phòng / xe cùng đơn: hàm thuần (có test ở user.test.js) ----
export const MAX_ROOMS = 5; // khớp qty tối đa của backend
export const MAX_GUESTS = 30;
// Loại phòng đủ chỗ: sức chứa × số phòng >= tổng số người (đã gồm trẻ em) và còn đủ phòng.
export const roomFits = (room, people, rooms) => room.maxOccupancy * rooms >= people && room.availableRooms >= rooms;
// Loại phòng rẻ nhất thỏa điều kiện, null nếu không có.
export const bestRoom = (hotel, people, rooms) => hotel.rooms.filter((r) => roomFits(r, people, rooms)).sort((a, b) => a.price - b.price)[0] ?? null;
// 'Thứ Sáu, 14/11/2026' từ yyyy-mm-dd (lấy giữa trưa để không lệch ngày theo múi giờ).
export const weekdayLabel = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const guestsSummary = ({ adults, children, rooms }) => `${adults} người lớn${children ? `, ${children} trẻ em` : ''} · ${rooms} phòng`;

// Giờ đón dạng 'yyyy-mm-ddTHH:mm' theo GIỜ VIỆT NAM (khớp cách backend tính ngày lưu trú và phụ thu đêm).
// Giờ nhận/trả phòng cố định (khớp windowFor): nhận 14:00, trả 12:00 giờ VN.
export const CHECKIN_HHMM = '14:00';
export const CHECKOUT_HHMM = '12:00';
// Mặc định bám giờ nhận/trả phòng: đón từ sân bay lúc nhận phòng (14:00), ra sân bay lúc trả phòng (12:00); nếu đã qua thì dời tới ~1 giờ nữa (backend không nhận giờ đón trong quá khứ).
export const vnNowLocal = (nowMs = Date.now()) => new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 16);
// `hourly` = { arrive, leave } ('yyyy-mm-ddTHH:mm' giờ VN) khi đơn có phòng theo giờ: xe bám giờ đến (giờ vào sớm nhất) và giờ ra muộn nhất của đơn.
export function defaultPickup(direction, checkIn, checkOut, nowMs = Date.now(), hourly, times = {}) {
  const want = hourly ? (direction === 'TO_HOTEL' ? hourly.arrive : hourly.leave) : direction === 'TO_HOTEL' ? `${checkIn}T${times.checkInTime || CHECKIN_HHMM}` : `${checkOut}T${times.checkOutTime || CHECKOUT_HHMM}`;
  const soon = vnNowLocal(nowMs + 3600_000);
  return want < soon ? soon : want;
}
export const pickupIso = (local) => `${local}:00+07:00`;
// state: { airport, TO_HOTEL: {on, at, location}, TO_AIRPORT: {...} } -> body.shuttle (undefined nếu không chọn chiều nào). Không gửi giá/passengers.
export function buildShuttle(state, checkIn, checkOut, nowMs, hourly, times) {
  const legs = ['TO_HOTEL', 'TO_AIRPORT'].filter((d) => state[d]?.on).map((direction) => {
    const l = state[direction];
    return { direction, pickupAt: pickupIso(l.at || defaultPickup(direction, checkIn, checkOut, nowMs, hourly, times)), ...(state.airport && { airport: state.airport }), ...(l.location?.trim() && { location: l.location.trim() }) };
  });
  return legs.length ? { legs } : undefined;
}
// Lỗi tạo đơn liên quan xe/số người -> { field, text } để đưa khách về đúng trường.
export function bookingFieldError(e) {
  const c = e?.code;
  if (c === 'GUESTS_EXCEED_CAPACITY') return { field: 'guests', text: `Các phòng đã chọn chỉ chứa tối đa ${e.details?.maxGuests ?? '?'} người. Hãy giảm số khách hoặc thêm phòng.` };
  if (c === 'SHUTTLE_NOT_OFFERED') return { field: 'shuttle', text: 'Khách sạn này không có dịch vụ xe đưa đón. Hãy bỏ chọn xe rồi thử lại.' };
  if (c === 'PICKUP_OUT_OF_STAY_WINDOW') return { field: 'pickup', text: 'Giờ đón phải nằm trong thời gian lưu trú (trước ngày nhận hoặc sau ngày trả tối đa 24 giờ) và chưa qua.' };
  if (c === 'HOURLY_OUT_OF_STAY') return { field: 'dates', text: 'Giờ ở theo giờ phải nằm trong khoảng nhận - trả phòng của đơn. Hãy đổi ngày hoặc chọn lại giờ.' };
  if (c === 'AIRPORT_NOT_SERVED') return { field: 'airport', text: 'Khách sạn không phục vụ sân bay này. Hãy chọn sân bay khác.' };
  if (c === 'SHUTTLE_OUT_OF_RANGE') return { field: 'airport', text: 'Quãng đường tới sân bay vượt giới hạn phục vụ của xe đưa đón.' };
  return null;
}
// Báo giá xe trước khi có đơn (công khai).
export const quoteHotelShuttle = (hotelId, body, signal) => api.post(`/v1/hotels/${hotelId}/shuttle-quote`, body, { auth: false, signal });

// `rooms` = [{ roomTypeId, qty }] (nhiều loại phòng cùng khách sạn).
// Đơn toàn giờ không gửi from/to (backend suy ra từ các dòng giờ); có dòng đêm thì gửi ngày nhận/trả như cũ.
// Đơn trộn mà giờ vào sớm nhất đã nằm trước `from` (hôm nay quá 14:00, from = bây giờ): kéo `from` về giờ vào đó để dòng giờ nằm trong khoảng ở của đơn.
export function windowFor(rooms, checkIn, checkOut, times) {
  if (!rooms.some((r) => (r.kind ?? 'NIGHT') === 'NIGHT')) return {};
  const w = stayWindow(checkIn, checkOut, times);
  const starts = rooms.filter((r) => r.kind === 'HOURLY').map((r) => Date.parse(r.startsAt));
  return starts.length && Math.min(...starts) < w.from.getTime() ? { ...w, from: new Date(Math.min(...starts)) } : w;
}
export async function createBooking({ hotelId, rooms, guest, checkIn, checkOut, paymentMethod, idempotencyKey, guests = 1, children = 0, shuttle, times }) {
  const { from, to } = windowFor(rooms, checkIn, checkOut, times);
  const { booking, paymentLink, shuttles } = await api.post('/v1/bookings', { hotelId, rooms, guests, children, ...(shuttle && { shuttle }), paymentMethod, from, to, guest }, { auth: asGuest(), idempotencyKey: idempotencyKey ?? newIdempotencyKey() }); // khách đã đăng nhập: gửi Bearer để đơn gắn vào tài khoản
  return { ...booking, paymentLink, shuttles };
}

// Báo giá trước khi gửi yêu cầu (backend tính phòng + xe + phí dịch vụ + tổng; không giữ phòng).
export async function quoteBooking({ hotelId, rooms, checkIn, checkOut, shuttle, times }, signal) {
  const { from, to } = windowFor(rooms, checkIn, checkOut, times);
  return api.post('/v1/bookings/quote', { hotelId, rooms, ...(shuttle && { shuttle }), from, to }, { auth: false, signal });
}

// Giờ vào còn trống của một loại phòng bật giờ trong một ngày (mỗi 30 phút + mốc 'Bây giờ'); khung kín có `reason` (PAST | CLOSED | FULL).
export const getHourlySlots = (hotelId, { roomTypeId, date, hours, qty = 1 }, signal) => api.get(`/v1/hotels/${hotelId}/hourly-slots`, { auth: false, signal, query: { roomTypeId, date, hours, qty } });
export const SLOT_REASON = { PAST: 'đã qua', CLOSED: 'quá giờ bán', FULL: 'hết phòng' };

export async function lookupBooking(code, phone) {
  const { booking } = await api.post('/v1/bookings/lookup', { code, phone }, { auth: false });
  return booking;
}

export async function getPaymentLink(code, phone) {
  const { paymentLink } = await api.post('/v1/payments/link', { code, phone }, { auth: false });
  return paymentLink;
}

// Cổng đang bật (GET /v1/payments/methods). Lỗi mạng/API: chỉ còn 'tại khách sạn'.
export const AT_HOTEL_ONLY = [{ id: 'AT_HOTEL', label: 'Thanh toán tại khách sạn' }];
export const listPaymentMethods = () => api.get('/v1/payments/methods', { auth: false }).then((r) => r.methods);
export const PAY_LABEL = { AT_HOTEL: 'Tại khách sạn', VNPAY: 'VNPay', MOMO: 'MoMo', SEPAY: 'SePay' };

// Đơn vừa tạo, để trang kết quả thanh toán tra lại trạng thái thật (chỉ giữ đơn gần nhất, mất khi đóng tab).
const LAST = 'airrest.lastBooking';
export const saveLastBooking = (code, phone) => { try { sessionStorage.setItem(LAST, JSON.stringify({ code, phone })); } catch { /* sessionStorage bị chặn: bỏ qua */ } };
export const readLastBooking = () => { try { const v = JSON.parse(sessionStorage.getItem(LAST)); return v?.code && v?.phone ? v : null; } catch { return null; } };
export const clearLastBooking = () => { try { sessionStorage.removeItem(LAST); } catch { /* bỏ qua */ } };

// Chỉ có khi backend chạy VNPAY_MODE=mock (không production): giả lập VNPay gọi IPN.
export const simulatePayment = (orderId, success) => api.post('/v1/payments/vnpay/dev-simulate', { orderId, resultCode: success ? 0 : 24 }, { auth: false });
export const simulateSepayPayment = (orderId, success) => api.post('/v1/payments/sepay/dev-simulate', { orderId, resultCode: success ? 0 : 1 }, { auth: false });
export const simulateMomoPayment = (orderId, success) => api.post('/v1/payments/momo/dev-simulate', { orderId, resultCode: success ? 0 : 1006 }, { auth: false });

export async function createTicket({ bookingCode, phone, fullName, email, subject, message }) {
  const { ticket } = await api.post('/v1/support', { bookingCode: bookingCode || undefined, phone, fullName: fullName || undefined, email: email || undefined, subject, message }, { auth: asGuest(), idempotencyKey: newIdempotencyKey() }); // khách đã đăng nhập: gửi Bearer để ticket gắn vào tài khoản
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
// Tra cứu đầy đủ (giới hạn nghiêm): { booking, guestToken, stage, shuttles, events }. Làm mới sau đó chỉ dùng getTrackState (không dính giới hạn nghiêm).
export const lookupBookingFull = (code, phone) => api.post('/v1/bookings/lookup', { code, ...(phone && { phone }) }, { auth: false }); // không SĐT: chỉ xem đơn
// Token theo dõi khác token tài khoản khách nên không đi qua `api` (nó gắn token phiên); lỗi chuẩn hóa thành ApiError (401 = token hết hạn).
export async function getTrackState(guestToken, signal) {
  let res;
  try { res = await fetch(`${apiBase}/v1/track/shuttle`, { headers: { Authorization: `Bearer ${guestToken}`, Accept: 'application/json' }, signal }); }
  catch (e) { if (signal?.aborted) throw e; throw new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Lỗi máy chủ (${res.status})`);
  return data;
}
export const callShuttleNow = (body) => api.post('/v1/shuttle-requests/call-now', body, { auth: false, idempotencyKey: newIdempotencyKey() }).then((r) => r.shuttle);
export const cancelShuttle = (id, code, phone) => api.post(`/v1/shuttle-requests/${id}/cancel`, { code, phone }, { auth: false }).then((r) => r.shuttle);

// ---- Tra cứu / trả lời ticket hỗ trợ (mã SP-XXXXXXXX + SĐT) ----
export const lookupTicket = (code, phone) => api.post('/v1/support/lookup', { code, phone }, { auth: false }).then((r) => r.ticket);
export const replyTicket = (code, phone, message) => api.post('/v1/support/reply', { code, phone, message }, { auth: false, idempotencyKey: newIdempotencyKey() }).then((r) => r.ticket);

// ---- Ảnh/video đính kèm ticket (khớp SUPPORT_ATTACHMENT ở packages/validation/src/support.ts; máy chủ kiểm lại) ----
export const ATTACH = { accept: 'image/jpeg,image/png,image/webp,video/mp4', maxImageMb: 5, maxVideoMb: 30, hint: 'Ảnh JPG/PNG/WebP tối đa 5 MB (tối đa 5 ảnh), video MP4 tối đa 30 MB (1 video).' };
// Lỗi tiếng Việt nếu tệp không hợp lệ, null nếu được.
export function checkAttachment(file) {
  if (!ATTACH.accept.split(',').includes(file.type)) return 'Chỉ nhận ảnh JPG/PNG/WebP hoặc video MP4.';
  const max = (file.type.startsWith('video/') ? ATTACH.maxVideoMb : ATTACH.maxImageMb) * 1024 * 1024;
  return file.size > max ? `Tệp quá lớn (tối đa ${file.type.startsWith('video/') ? ATTACH.maxVideoMb : ATTACH.maxImageMb} MB).` : null;
}
// Lọc danh sách tệp khách chọn: giữ tệp hợp lệ (đúng loại/dung lượng, không vượt 5 ảnh, 1 video, 6 tệp tính cả `have` đã chọn trước đó), còn lại ghi lý do. Máy chủ vẫn kiểm lại.
export function checkAttachments(files, have = []) {
  const ok = []; const errors = [];
  let images = have.filter((f) => !f.type.startsWith('video/')).length; let videos = have.length - images;
  for (const f of files) {
    const bad = checkAttachment(f);
    const video = f.type.startsWith('video/');
    const limit = bad ? null : have.length + ok.length >= 6 ? 'Tối đa 6 tệp mỗi yêu cầu.' : video ? (videos >= 1 ? 'Chỉ đính kèm tối đa 1 video.' : null) : (images >= 5 ? 'Chỉ đính kèm tối đa 5 ảnh.' : null);
    if (bad || limit) { errors.push(`${f.name}: ${bad ?? limit}`); continue; }
    ok.push(f); if (video) videos++; else images++;
  }
  return { ok, errors };
}
// Xin URL → PUT thẳng lên kho lưu trữ → xác nhận (máy chủ kiểm kích thước/loại thật). Ném ApiError, dùng describeApiError để hiển thị.
export async function attachFile(code, phone, file) {
  const bad = checkAttachment(file);
  if (bad) throw new ApiError(0, 'ATTACHMENT_INVALID', bad);
  const u = await api.post('/v1/support/attachments/upload-url', { code, phone, contentType: file.type, size: file.size }, { auth: false, idempotencyKey: newIdempotencyKey() });
  let put;
  try { put = await fetch(u.uploadUrl, { method: u.method, headers: u.headers, body: file }); } catch { throw new ApiError(0, 'UPLOAD_FAILED', 'Không tải được tệp lên máy chủ lưu trữ. Kiểm tra mạng rồi thử lại.'); }
  if (!put.ok) throw new ApiError(put.status, 'UPLOAD_FAILED', 'Máy chủ lưu trữ từ chối tệp. Thử lại hoặc chọn tệp khác.');
  return (await api.post('/v1/support/attachments/confirm', { code, phone, attachmentId: u.attachmentId }, { auth: false })).attachment;
}

// ---- Tài khoản hành khách (backend: /v1/auth/passenger/*, /v1/auth/me, /v1/me/*) ----
export const USERNAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const FULLNAME_MAX = 100;
const LOOKS_LIKE_CONTACT = /@|\d{6,}/;

// Luật kiểm tra phía client khớp backend (services/passengers/passengers.service.ts); máy chủ vẫn kiểm lại.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateRegister({ email, username, password, fullName }) {
  const n = (username || '').normalize('NFC').trim();
  const errors = {};
  if (!n) errors.username = 'Nhập tên đăng nhập.';
  else if (n.length > USERNAME_MAX) errors.username = `Tên đăng nhập tối đa ${USERNAME_MAX} ký tự.`;
  else if (LOOKS_LIKE_CONTACT.test(n)) errors.username = 'Tên đăng nhập không được chứa @ hoặc dãy số giống số điện thoại.';
  if (!EMAIL_RE.test((email || '').trim())) errors.email = 'Nhập email hợp lệ, ví dụ ban@example.com.';
  if (!(fullName || '').trim()) errors.fullName = 'Nhập họ và tên.';
  else if (fullName.trim().length > FULLNAME_MAX) errors.fullName = `Họ và tên tối đa ${FULLNAME_MAX} ký tự.`;
  if (!password) errors.password = 'Nhập mật khẩu.';
  else if (password.length < PASSWORD_MIN) errors.password = `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`;
  else if (password.length > PASSWORD_MAX) errors.password = `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  return errors;
}

// Lỗi của API tài khoản khách -> câu tiếng Việt.
export function describeAuthError(e) {
  if (e?.code === 'USERNAME_TAKEN') return 'Tên đăng nhập đã được dùng.';
  if (e?.code === 'EMAIL_TAKEN') return 'Email này đã được dùng cho một tài khoản khác.';
  if (e?.code === 'INVALID_CREDENTIALS') return 'Sai tên đăng nhập hoặc mật khẩu.';
  if (e?.code === 'WRONG_CURRENT_PASSWORD') return 'Mật khẩu hiện tại không đúng.';
  if (e?.code === 'SAME_PASSWORD') return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (e?.status === 429) return 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  return describeApiError(e);
}

const userView = (u) => ({ id: u.id, username: u.username ?? '', email: u.email ?? '', fullName: u.fullName ?? '', name: u.fullName || u.username || 'Tài khoản', preferences: u.preferences ?? {} });

// Đăng ký / đăng nhập: trả { token, user }; người gọi tự lưu token (setGuestToken) rồi cập nhật store.
export async function registerPassenger({ email, username, password, fullName }) {
  const r = await api.post('/v1/auth/passenger/register', { email: email.trim(), username: username.trim(), password, ...(fullName?.trim() && { fullName: fullName.trim() }) }, { auth: false });
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
// Sửa họ tên và/hoặc cấu hình cá nhân { airport, adults, children, rooms, paymentMethod } (gửi là thay nguyên khối). Trả user mới.
export const updateProfile = (body) => api.patch('/v1/me/profile', body).then((r) => userView(r.user));
// Yêu thích (trả hotelIds), thông báo (đổi trạng thái đơn của tôi + số chưa đọc), mã giảm giá còn hiệu lực.
export const listFavoriteIds = () => api.get('/v1/me/favorites').then((r) => r.hotelIds);
export const addFavorite = (hotelId) => api.put(`/v1/me/favorites/${hotelId}`, {});
export const removeFavorite = (hotelId) => api.delete(`/v1/me/favorites/${hotelId}`);
export const listNotifications = () => api.get('/v1/me/notifications');
export const markNotificationsRead = () => api.post('/v1/me/notifications/read', {});
export const listMyVouchers = () => api.get('/v1/me/vouchers').then((r) => r.items);
export const listMyTickets = (cursor, signal) => api.get('/v1/me/tickets', { query: { limit: 10, cursor }, signal });

// Tra cứu cả nhóm khách delay bằng mã nhóm NH-XXXXXXXX + SĐT người đại diện (backend: strictRateLimit, 404 không phân biệt sai mã/SĐT).
export const lookupGroup = (groupCode, phone) => api.post('/v1/bookings/group-lookup', { groupCode, phone }, { auth: false });
