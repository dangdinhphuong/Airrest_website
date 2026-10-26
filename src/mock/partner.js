// Dữ liệu dùng chung của ba tác nhân (người dùng cuối, khách sạn gồm lái xe, quản trị). Ngoài MVP, Proposed (SRS 3.6).
// D-29 phương án A: chỉ lưu trong bộ nhớ trang, mất khi tải lại; không gọi mạng; mọi dữ liệu là MÔ PHỎNG (BR-016).
import { useSyncExternalStore } from 'react';
import { PROPERTIES, AIRPORT_COORDS } from './properties';

export const ROLE_LABEL = { manager: 'Quản lý khách sạn', driver: 'Lái xe', admin: 'Quản trị' };
export const PICKUP_FLOW = ['waiting', 'accepted', 'enroute', 'picked', 'done'];
export const PICKUP_LABEL = { waiting: 'Chờ nhận', accepted: 'Đã nhận', enroute: 'Đang đến', picked: 'Đã đón', done: 'Hoàn tất', failed: 'Không đón được' };
export const PICKUP_NEXT = { waiting: 'Nhận chuyến', accepted: 'Báo đang đến', enroute: 'Báo đã đón', picked: 'Hoàn tất' };
export const REJECT_REASONS = ['Hết phòng', 'Cơ sở tạm đóng cửa', 'Thông tin đặt chỗ không hợp lệ', 'Lý do khác'];
export const PICKUP_FAIL_REASONS = ['Không thấy người dùng tại điểm đón', 'Xe gặp sự cố', 'Chuyến bay đổi giờ, không kịp', 'Lý do khác'];

const S0 = {
  overrides: {}, locked: {}, extra: [], seq: { booking: 0, pickup: 0, account: 0, property: 0 },
  bookings: [
    { code: 'DC-S001', propertyId: 'HAN-01', name: 'Khách thử 1', method: 'at-property', createdAt: 23 * 60 + 2, status: 'confirmed', reason: null, seed: true },
    { code: 'DC-S002', propertyId: 'HAN-01', name: 'Khách thử 2', method: 'qr', createdAt: 23 * 60 + 5, status: 'confirmed', reason: null, seed: true },
    { code: 'DC-S003', propertyId: 'SGN-01', name: 'Khách thử 3', method: 'at-property', createdAt: 23 * 60 + 4, status: 'confirmed', reason: null, seed: true },
  ],
  pickups: [
    { id: 'XD-S001', bookingCode: 'DC-S001', propertyId: 'HAN-01', airport: 'HAN', name: 'Khách thử 1', etaMin: 23 * 60 + 40, status: 'waiting', reason: null, driverId: null, updatedAt: 23 * 60 + 6, seed: true },
  ],
  accounts: [
    { id: 'qt-01', role: 'admin', propertyId: null, locked: false },
    { id: 'ks-han-01', role: 'manager', propertyId: 'HAN-01', locked: false },
    { id: 'lx-han-01', role: 'driver', propertyId: 'HAN-01', locked: false },
    { id: 'ks-sgn-01', role: 'manager', propertyId: 'SGN-01', locked: false },
    { id: 'lx-sgn-01', role: 'driver', propertyId: 'SGN-01', locked: false },
  ],
  log: [],
};
let S = { ...S0 };
const subs = new Set();
const emit = () => { S = { ...S }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const usePartner = () => useSyncExternalStore(subscribe, () => S);
export const snapshot = () => S;

// ---- đọc (dùng bởi mock service) ----
export const partner = {
  override: (id) => S.overrides[id] || {},
  isLocked: (id) => !!S.locked[id],
  extraProps: () => S.extra,
};
export const allProperties = () => [...PROPERTIES, ...S.extra];
export const propertyName = (id) => allProperties().find((p) => p.id === id)?.name || id;
export const accountLabel = (a) => `${a.id} — ${ROLE_LABEL[a.role]}${a.propertyId ? ' · ' + propertyName(a.propertyId) : ''}${a.locked ? ' (đã khoá)' : ''}`;

// ---- nhật ký (BR-017) ----
const logEv = (by, now, action, target, detail) => {
  S.log = [{ n: S.log.length + 1, at: now, who: by?.id || 'hệ thống', role: by?.role || '—', action, target, detail }, ...S.log];
};

// ---- khách sạn (FR-025, FR-026) ----
export function updateProperty(id, patch, by, now, action = 'Cập nhật cơ sở') {
  S.overrides = { ...S.overrides, [id]: { ...S.overrides[id], ...patch, updatedAtOffsetMin: 0 } };
  logEv(by, now, action, id, Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '));
  emit();
}

// ---- đặt chỗ (FR-012 ghi nhận, FR-027 xử lý) ----
export function addBooking({ propertyId, name, method, now }) {
  S.seq.booking += 1;
  const code = `DC-${String(S.seq.booking).padStart(4, '0')}`;
  S.bookings = [...S.bookings, { code, propertyId, name, method, createdAt: now, status: 'confirmed', reason: null }];
  emit();
  return code;
}
export function nextBookingCode() { return `DC-${String(S.seq.booking + 1).padStart(4, '0')}`; }
export function setBookingStatus(code, status, reason, by, now) {
  S.bookings = S.bookings.map((b) => (b.code === code ? { ...b, status, reason: reason || null, decidedAt: now } : b));
  logEv(by, now, status === 'rejected' ? 'Từ chối đặt chỗ' : 'Xác nhận đặt chỗ', code, reason || '');
  emit();
}

// ---- đón khách (FR-028, FR-029) ----
export function requestPickup({ booking, property, now }) {
  S.seq.pickup += 1;
  const id = `XD-${String(S.seq.pickup).padStart(4, '0')}`;
  S.pickups = [...S.pickups, { id, bookingCode: booking.code, propertyId: property.id, airport: property.airport, name: booking.name, etaMin: now + property.travelMin, status: 'waiting', reason: null, driverId: null, updatedAt: now }];
  emit();
  return id;
}
export function setPickupStatus(id, status, reason, by, now) {
  S.pickups = S.pickups.map((x) => (x.id === id ? { ...x, status, reason: reason || null, updatedAt: now, driverId: x.driverId || (by?.role === 'driver' ? by.id : null) } : x));
  logEv(by, now, `Đón khách: ${PICKUP_LABEL[status]}`, id, reason || '');
  emit();
}

// ---- quản trị (FR-030, FR-031) ----
export function setLocked(id, locked, by, now) {
  S.locked = { ...S.locked, [id]: locked };
  logEv(by, now, locked ? 'Tạm khoá cơ sở' : 'Kích hoạt cơ sở', id, '');
  emit();
}
export function addProperty({ name, airport, type, price }, by, now) {
  S.seq.property += 1;
  const id = `${airport}-N${String(S.seq.property).padStart(2, '0')}`;
  const c = AIRPORT_COORDS[airport];
  const roomLabel = { 'Khách sạn': 'Phòng đôi tiêu chuẩn', 'Nhà nghỉ': 'Phòng đôi', 'Căn hộ': 'Căn hộ 1 phòng ngủ', 'Hộp ngủ': 'Hộp ngủ đôi', 'Phòng theo giờ': 'Phòng đôi theo giờ' };
  const p = {
    id, airport, name, type, room: roomLabel[type] || 'Phòng đôi', distanceKm: 3, travelMin: 10, shuttle: 'none', taxi: 105000, reception24: true, closeExtHour: 24,
    freeCancel: true, payAtProperty: true, familyRoom: false, hourly: type === 'Phòng theo giờ' || type === 'Hộp ngủ', rating: '8.0', price, roomsLeft: 3,
    amenities: ['Wifi', 'Điều hòa'], area: airport === 'HAN' ? 'Khu vực quanh Nội Bài (mô phỏng)' : 'Khu vực quanh Tân Sơn Nhất (mô phỏng)',
    lat: +(c.lat + 0.02).toFixed(5), lng: +(c.lng + 0.02).toFixed(5), soldOutOnConfirm: false, updatedAtOffsetMin: 0, isNew: true,
  };
  S.extra = [...S.extra, p];
  logEv(by, now, 'Thêm cơ sở', id, name);
  emit();
  return id;
}
export function addAccount({ role, propertyId }, by, now) {
  S.seq.account += 1;
  const id = `${role === 'manager' ? 'ks' : 'lx'}-${(propertyId || '').toLowerCase()}-${String(S.seq.account).padStart(2, '0')}`;
  S.accounts = [...S.accounts, { id, role, propertyId, locked: false }];
  logEv(by, now, 'Tạo tài khoản', id, ROLE_LABEL[role]);
  emit();
  return id;
}
export function setAccountLocked(id, locked, by, now) {
  S.accounts = S.accounts.map((a) => (a.id === id ? { ...a, locked } : a));
  logEv(by, now, locked ? 'Khoá tài khoản' : 'Mở khoá tài khoản', id, '');
  emit();
}
export function logConfig(by, now, action, target, detail) { logEv(by, now, action, target, detail); emit(); }
export const activeBookingsOf = (propertyId) => S.bookings.filter((b) => b.propertyId === propertyId && b.status === 'confirmed').length;
