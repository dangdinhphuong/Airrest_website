// Dữ liệu dùng chung của các tác nhân ngoài MVP (khách sạn gồm lái xe, quản trị, vận hành, hỗ trợ, tài chính, kiểm toán).
// Gói SRS: docs/srs/extensions/hotel-admin (Proposed). D-29 phương án A: chỉ lưu trong bộ nhớ trang, mất khi tải lại; không gọi mạng;
// mọi dữ liệu là MÔ PHỎNG (BR-016). Thay đổi chỉ ghi ở đây qua các hàm bên dưới; mỗi thay đổi ghi audit (SA-FR-025).
import { useSyncExternalStore } from 'react';
import { PROPERTIES, AIRPORT_COORDS } from './properties';
import { authorize, can, ROLE_META } from '../lib/rbac';

export const ROLE_LABEL = Object.fromEntries(Object.entries(ROLE_META).map(([k, v]) => [k, v.label]));
export const PICKUP_FLOW = ['waiting', 'accepted', 'enroute', 'picked', 'done'];
export const PICKUP_LABEL = { waiting: 'Chờ nhận', accepted: 'Đã nhận', enroute: 'Đang đến', picked: 'Đã đón', done: 'Hoàn tất', failed: 'Không đón được' };
export const PICKUP_NEXT = { waiting: 'Nhận chuyến', accepted: 'Báo đang đến', enroute: 'Báo đã đón', picked: 'Hoàn tất' };
export const PICKUP_FAIL_REASONS = ['Không thấy người dùng tại điểm đón', 'Xe gặp sự cố', 'Chuyến bay đổi giờ, không kịp', 'Lý do khác'];
export const PROFILE_STATUS = { Draft: 'Nháp', PendingReview: 'Chờ duyệt', NeedsInfo: 'Cần bổ sung', Active: 'Đang hoạt động', Rejected: 'Bị từ chối', Suspended: 'Tạm ngưng', Deactivated: 'Ngừng hợp tác' };
export const CASE_STATUS = { New: 'Mới', Triaged: 'Đã phân loại', Assigned: 'Đã gán', InProgress: 'Đang xử lý', Escalated: 'Đã chuyển cấp', Resolved: 'Đã giải quyết', Closed: 'Đã đóng' };
export const INCIDENT_STATUS = { New: 'Mới', InProgress: 'Đang xử lý', Resolved: 'Đã giải quyết', Closed: 'Đã đóng' };
export const DAYS = 14; // số ngày hiển thị của tồn phòng và lịch giá

const TEN_PRICE = [100000, 20000000];
export const PRICE_RANGE = TEN_PRICE;
const mkType = (p) => ({ id: 'STD', name: p.room, capacity: 2, beds: 1, area: 22, amenities: p.amenities, rooms: p.roomsLeft + 2, baseBooked: 2, status: 'selling' });
const seedProfile = (p) => ({ status: 'Active', name: p.name, type: p.type, address: p.area, contact: '', amenities: p.amenities.join(', '), lat: p.lat, lng: p.lng, airport: p.airport, history: [], reason: null });

const S0 = {
  overrides: {}, locked: {}, extra: [], seq: { booking: 0, pickup: 0, account: 0, property: 0, app: 0, case: 0, incident: 0, change: 0, session: 0, quality: 0, cid: 0 },
  bookings: [
    { code: 'DC-S001', propertyId: 'HAN-01', typeId: 'STD', dayIdx: 0, nights: 1, name: 'Khách thử 1', method: 'at-property', createdAt: 23 * 60 + 2, status: 'confirmed', reason: null, seed: true, price: 980000, cid: 'cid-s001', history: [] },
    { code: 'DC-S002', propertyId: 'HAN-01', typeId: 'STD', dayIdx: 0, nights: 1, name: 'Khách thử 2', method: 'qr', createdAt: 23 * 60 + 5, status: 'pending', reason: null, seed: true, price: 980000, cid: 'cid-s002', history: [] },
    { code: 'DC-S003', propertyId: 'SGN-01', typeId: 'STD', dayIdx: 0, nights: 1, name: 'Khách thử 3', method: 'at-property', createdAt: 23 * 60 + 4, status: 'confirmed', reason: null, seed: true, price: 860000, cid: 'cid-s003', history: [] },
  ],
  pickups: [{ id: 'XD-S001', bookingCode: 'DC-S001', propertyId: 'HAN-01', airport: 'HAN', name: 'Khách thử 1', etaMin: 23 * 60 + 40, status: 'waiting', reason: null, driverId: null, updatedAt: 23 * 60 + 6, seed: true }],
  accounts: [
    { id: 'qt-01', role: 'admin', propertyId: null, tenantId: null, status: 'active', identifier: 'quantri@airrest.mo' },
    { id: 'vh-01', role: 'ops', propertyId: null, tenantId: null, status: 'active', identifier: 'vanhanh@airrest.mo' },
    { id: 'ht-01', role: 'support', propertyId: null, tenantId: null, status: 'active', identifier: 'hotro@airrest.mo' },
    { id: 'tc-01', role: 'finance', propertyId: null, tenantId: null, status: 'active', identifier: 'taichinh@airrest.mo' },
    { id: 'kt-01', role: 'auditor', propertyId: null, tenantId: null, status: 'active', identifier: 'kiemtoan@airrest.mo' },
    { id: 'ks-han-01', role: 'manager', propertyId: 'HAN-01', tenantId: 'HAN-01', status: 'active', identifier: 'ql.han01@khachsan.mo' },
    { id: 'nv-han-01', role: 'staff', propertyId: 'HAN-01', tenantId: 'HAN-01', status: 'active', identifier: 'nv.han01@khachsan.mo' },
    { id: 'lx-han-01', role: 'driver', propertyId: 'HAN-01', tenantId: 'HAN-01', status: 'active', identifier: 'lx.han01@khachsan.mo' },
    { id: 'ks-sgn-01', role: 'manager', propertyId: 'SGN-01', tenantId: 'SGN-01', status: 'active', identifier: 'ql.sgn01@khachsan.mo' },
    { id: 'lx-sgn-01', role: 'driver', propertyId: 'SGN-01', tenantId: 'SGN-01', status: 'active', identifier: 'lx.sgn01@khachsan.mo' },
    { id: 'ks-moi-01', role: 'manager', propertyId: null, tenantId: 'T-MOI', status: 'active', identifier: 'chu.moi@khachsan.mo' },
  ],
  sessions: [], log: [],
  profiles: Object.fromEntries(PROPERTIES.map((p) => [p.id, seedProfile(p)])),
  roomTypes: Object.fromEntries(PROPERTIES.map((p) => [p.id, [mkType(p)]])),
  rates: Object.fromEntries(PROPERTIES.map((p) => [p.id, { STD: { base: p.price, days: {} } }])),
  rateLog: [], blackouts: {}, closedDays: {}, policies: {},
  applications: [], cases: [], incidents: [], quality: [],
  flags: { pickup_request: { value: true, version: 1 }, guest_case: { value: true, version: 1 } },
  changes: [],
  catalogs: {
    reject_reasons: ['Hết phòng', 'Cơ sở tạm đóng cửa', 'Thông tin đặt chỗ không hợp lệ', 'Lý do khác'].map((l, i) => ({ id: `RR${i + 1}`, label: l, active: true })),
    case_categories: ['Đặt phòng', 'Thanh toán', 'Thông tin cơ sở', 'Đón khách', 'Khác'].map((l, i) => ({ id: `CC${i + 1}`, label: l, active: true })),
    incident_types: ['Hết phòng dù đã xác nhận', 'Từ chối nhận khách', 'Sai giá', 'Sai thông tin'].map((l, i) => ({ id: `IT${i + 1}`, label: l, active: true })),
    amenities: ['Wifi', 'Điều hòa', 'Tắm nước nóng', 'Gửi hành lý', 'Bếp nhỏ'].map((l, i) => ({ id: `AM${i + 1}`, label: l, active: true })),
  },
};
let S = { ...S0 };
const subs = new Set();
const emit = () => { S = { ...S }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const usePartner = () => useSyncExternalStore(subscribe, () => S);
export const snapshot = () => S;
const touch = (pid) => { S.overrides = { ...S.overrides, [pid]: { ...S.overrides[pid], updatedAtOffsetMin: 0 } }; }; // “cập nhật lúc” = giờ mô phỏng hiện tại (BR-012)
const nextCid = () => { S.seq.cid += 1; return `cid-${String(S.seq.cid).padStart(4, '0')}`; };

// ---- đọc (dùng bởi mock service) ----
export const allProperties = () => [...PROPERTIES, ...S.extra];
export const propertyName = (id) => allProperties().find((p) => p.id === id)?.name || id;
export const typesOf = (pid) => S.roomTypes[pid] || [];
export const dayLabel = (idx) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + idx); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function dayInventory(pid, typeId, idx) {
  const t = typesOf(pid).find((x) => x.id === typeId); if (!t) return null;
  const bookedAirrest = S.bookings.filter((b) => b.propertyId === pid && b.typeId === typeId && ['confirmed', 'checked_in'].includes(b.status) && idx >= b.dayIdx && idx < b.dayIdx + b.nights).length;
  const booked = t.baseBooked + bookedAirrest;
  const unavailable = S.blackouts[pid]?.[typeId]?.[idx]?.n || 0;
  const held = S.bookings.filter((b) => b.propertyId === pid && b.typeId === typeId && b.status === 'pending' && idx >= b.dayIdx && idx < b.dayIdx + b.nights).length; // yêu cầu đang chờ khách sạn; hạn giữ chỗ chưa có (OQ-45)
  const sellable = t.rooms - held - booked - unavailable;
  const closed = !!S.closedDays[pid]?.[typeId]?.[idx];
  return { physical: t.rooms, held, booked, bookedAirrest, unavailable, sellable, closed, onSale: closed || t.status !== 'selling' ? 0 : Math.max(sellable, 0), reason: S.blackouts[pid]?.[typeId]?.[idx]?.reason || null };
}
export const priceOn = (pid, typeId, idx) => { const r = S.rates[pid]?.[typeId]; return r ? (r.days[idx] ?? r.base) : null; };
const sellingTypes = (pid) => typesOf(pid).filter((t) => t.status === 'selling');
export const sellableToday = (pid) => (S.roomTypes[pid] ? sellingTypes(pid).reduce((a, t) => a + dayInventory(pid, t.id, 0).onSale, 0) : null);
export const priceToday = (pid) => { const t = sellingTypes(pid)[0]; return t ? priceOn(pid, t.id, 0) : null; };
export const partner = {
  override: (id) => S.overrides[id] || {},
  isLocked: (id) => !!S.locked[id] || ['Suspended', 'Deactivated'].includes(S.profiles[id]?.status),
  extraProps: () => S.extra,
  sellableToday, priceToday,
};
export const accountLabel = (a) => `${a.id} — ${ROLE_LABEL[a.role] || 'Chưa có vai trò'}${a.propertyId ? ' · ' + propertyName(a.propertyId) : ''}${a.status !== 'active' ? ` (${{ locked: 'đã khoá', disabled: 'đã vô hiệu', invited: 'chưa kích hoạt' }[a.status]})` : ''}`;
export const activeBookingsOf = (pid) => S.bookings.filter((b) => b.propertyId === pid && b.status === 'confirmed').length;
export const maskName = (s) => (s ? s[0] + '*'.repeat(Math.max(2, s.length - 1)) : '');

// ---- audit (SA-FR-025): actor, action, target, timestamp, result, reason, correlation ID, trước/sau ----
const logEv = (by, now, action, target, detail, x = {}) => {
  S.log = [{ n: S.log.length + 1, at: now, who: by?.id || 'hệ thống', role: by?.role || '—', action, target, detail: detail || '', result: x.result || 'ok', reason: x.reason || '', cid: x.cid || nextCid(), before: x.before ?? '', after: x.after ?? '' }, ...S.log];
};
export function logConfig(by, now, action, target, detail) { logEv(by, now, action, target, detail); emit(); }
export function guard(session, resource, action, tenantId, now = 0) {
  const r = authorize(session, resource, action, tenantId);
  if (!r.ok) { logEv(session, now, 'authz.denied', `${resource}:${action}`, r.reason, { result: 'denied' }); emit(); }
  return r;
}
export function revealSensitive(by, now, target, reason) {
  if (!can(by?.role, 'sensitive', 'V')) return { ok: false, error: 'Vai trò không có quyền xem trường nhạy cảm (V).' };
  if (!reason) return { ok: false, error: 'Cần chọn lý do trước khi xem rõ.' };
  logEv(by, now, 'sensitive.revealed', target, '', { reason }); emit(); return { ok: true };
}
export function exportCsv(by, now, name, header, rows, reason) {
  if (!can(by?.role, 'report', 'E')) { logEv(by, now, 'authz.denied', 'report:E', 'Không có quyền xuất', { result: 'denied' }); emit(); return { ok: false, error: 'Vai trò không có quyền xuất dữ liệu (E).' }; }
  if (!reason) return { ok: false, error: 'Chọn lý do xuất dữ liệu.' };
  if (rows.length > 5000) return { ok: false, error: 'Quá nhiều bản ghi, hãy thu hẹp bộ lọc.' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `${name}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } catch { /* môi trường không hỗ trợ tải */ }
  logEv(by, now, 'data.exported', name, `${rows.length} bản ghi`, { reason }); emit(); return { ok: true, count: rows.length };
}

// ---- hồ sơ đối tác (HM-FR-001…003, 005; SA-FR-012, 013; SM-01) ----
const REQUIRED = ['name', 'address', 'contact', 'type', 'lat', 'lng'];
const IMPORTANT = ['name', 'address', 'type'];
const hist = (pr, now, who, field, before, after) => { pr.history = [{ at: now, who: who?.id || 'hệ thống', field, before, after }, ...pr.history]; };
export function createApplication({ airport, name, type, address, contact, lat, lng, amenities }, by, now) {
  S.seq.app += 1; const id = `HS-${String(S.seq.app).padStart(4, '0')}`;
  const pr = { status: 'Draft', name, type, address, contact, lat, lng, amenities, airport, history: [], reason: null, isApplication: true, tenantId: by.tenantId, ownerId: by.id };
  hist(pr, now, by, 'trạng thái', '—', 'Nháp');
  S.profiles = { ...S.profiles, [id]: pr }; S.applications = [...S.applications, id];
  logEv(by, now, 'partner.created', id, name, { after: 'Draft' }); emit(); return id;
}
export function updateProfile(pid, patch, by, now) {
  const g = guard(by, 'partner', 'U', S.profiles[pid]?.tenantId || pid, now); if (!g.ok) return { ok: false, error: g.reason };
  const cur = S.profiles[pid]; const next = { ...cur, history: cur.history };
  const changed = Object.keys(patch).filter((k) => String(patch[k]) !== String(cur[k]));
  changed.forEach((k) => hist(next, now, by, k, cur[k], patch[k]));
  Object.assign(next, patch);
  let note = '';
  if (cur.status === 'Active' && changed.some((k) => IMPORTANT.includes(k))) { next.status = 'PendingReview'; hist(next, now, by, 'trạng thái', 'Đang hoạt động', 'Chờ duyệt'); note = 'Thay đổi trường quan trọng: hồ sơ chuyển sang Chờ duyệt lại (đề xuất, chờ quyết định D-38).'; }
  S.profiles = { ...S.profiles, [pid]: next };
  logEv(by, now, 'partner.updated', pid, changed.join(', '), { before: changed.map((k) => cur[k]).join(' | '), after: changed.map((k) => patch[k]).join(' | ') }); emit();
  return { ok: true, note, changed };
}
export function submitProfile(pid, by, now) {
  const cur = S.profiles[pid];
  if (!['Draft', 'NeedsInfo', 'Rejected'].includes(cur.status)) return { ok: false, error: 'Hồ sơ không ở trạng thái có thể gửi duyệt.' };
  const missing = REQUIRED.filter((k) => !String(cur[k] ?? '').trim());
  if (missing.length) return { ok: false, error: 'Thiếu trường bắt buộc.', missing };
  const next = { ...cur, status: 'PendingReview', reason: null }; hist(next, now, by, 'trạng thái', PROFILE_STATUS[cur.status], 'Chờ duyệt');
  S.profiles = { ...S.profiles, [pid]: next }; logEv(by, now, 'partner.submitted', pid, '', { before: cur.status, after: 'PendingReview' }); emit(); return { ok: true };
}
export function decideProfile(pid, decision, reason, by, now) {
  const g = guard(by, 'partner', 'A', null, now); if (!g.ok) return { ok: false, error: g.reason };
  const cur = S.profiles[pid];
  if (cur.status !== 'PendingReview') return { ok: false, error: 'Hồ sơ đã được xử lý hoặc không ở trạng thái Chờ duyệt (xung đột).' };
  if (decision !== 'approve' && !reason) return { ok: false, error: 'Cần nhập lý do.' };
  const to = { approve: 'Active', reject: 'Rejected', info: 'NeedsInfo' }[decision];
  const next = { ...cur, status: to, reason: decision === 'approve' ? null : reason }; hist(next, now, by, 'trạng thái', PROFILE_STATUS[cur.status], PROFILE_STATUS[to]);
  let newId = null;
  if (decision === 'approve' && cur.isApplication && !cur.propertyId) {
    newId = addProperty({ name: cur.name, airport: cur.airport, type: cur.type, price: 450000 }, by, now, true);
    next.propertyId = newId;
    S.profiles = { ...S.profiles, [newId]: { ...next, isApplication: false, history: next.history } };
    S.accounts = S.accounts.map((a) => (a.id === cur.ownerId ? { ...a, propertyId: newId, tenantId: newId } : a));
  }
  S.profiles = { ...S.profiles, [pid]: next };
  logEv(by, now, { approve: 'partner.approved', reject: 'partner.rejected', info: 'partner.moreinfo' }[decision], pid, reason || '', { reason, before: cur.status, after: to }); emit(); return { ok: true, newId };
}
export function setSuspended(pid, suspend, reason, by, now) {
  const g = guard(by, 'partner', 'X', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!reason) return { ok: false, error: 'Cần nhập lý do.' };
  const cur = S.profiles[pid]; const to = suspend ? 'Suspended' : 'Active';
  const next = { ...cur, status: to, reason: suspend ? reason : null }; hist(next, now, by, 'trạng thái', PROFILE_STATUS[cur.status], PROFILE_STATUS[to]);
  S.profiles = { ...S.profiles, [pid]: next };
  logEv(by, now, suspend ? 'partner.suspended' : 'partner.restored', pid, '', { reason, before: cur.status, after: to }); emit(); return { ok: true };
}
export function deactivate(pid, reason, by, now) {
  const g = guard(by, 'partner', 'X', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!reason) return { ok: false, error: 'Cần nhập lý do.' };
  const n = activeBookingsOf(pid); if (n > 0) return { ok: false, error: `Còn ${n} đặt phòng chưa hoàn tất, không thể ngừng hợp tác.` };
  const cur = S.profiles[pid]; const next = { ...cur, status: 'Deactivated', reason }; hist(next, now, by, 'trạng thái', PROFILE_STATUS[cur.status], 'Ngừng hợp tác');
  S.profiles = { ...S.profiles, [pid]: next }; logEv(by, now, 'partner.deactivated', pid, '', { reason }); emit(); return { ok: true };
}
export function addProperty({ name, airport, type, price }, by, now, fromApp = false) {
  S.seq.property += 1; const id = `${airport}-N${String(S.seq.property).padStart(2, '0')}`; const c = AIRPORT_COORDS[airport];
  const roomLabel = { 'Khách sạn': 'Phòng đôi tiêu chuẩn', 'Nhà nghỉ': 'Phòng đôi', 'Căn hộ': 'Căn hộ 1 phòng ngủ', 'Hộp ngủ': 'Hộp ngủ đôi', 'Phòng theo giờ': 'Phòng đôi theo giờ' };
  const p = { id, airport, name, type, room: roomLabel[type] || 'Phòng đôi', distanceKm: 3, travelMin: 10, shuttle: 'none', taxi: 105000, reception24: true, closeExtHour: 24, freeCancel: true, payAtProperty: true, familyRoom: false,
    hourly: type === 'Phòng theo giờ' || type === 'Hộp ngủ', rating: '8.0', price, roomsLeft: 3, amenities: ['Wifi', 'Điều hòa'], area: airport === 'HAN' ? 'Khu vực quanh Nội Bài (mô phỏng)' : 'Khu vực quanh Tân Sơn Nhất (mô phỏng)',
    lat: +(c.lat + 0.02).toFixed(5), lng: +(c.lng + 0.02).toFixed(5), soldOutOnConfirm: false, updatedAtOffsetMin: 0, isNew: true };
  S.extra = [...S.extra, p];
  S.roomTypes = { ...S.roomTypes, [id]: [mkType(p)] }; S.rates = { ...S.rates, [id]: { STD: { base: price, days: {} } } };
  if (!fromApp) S.profiles = { ...S.profiles, [id]: seedProfile(p) };
  logEv(by, now, 'Thêm cơ sở', id, name); emit(); return id;
}
export function updateProperty(id, patch, by, now, action = 'Cập nhật cơ sở') {
  S.overrides = { ...S.overrides, [id]: { ...S.overrides[id], ...patch, updatedAtOffsetMin: 0 } };
  logEv(by, now, action, id, Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')); emit();
}
export function setLocked(id, locked, by, now) { S.locked = { ...S.locked, [id]: locked }; logEv(by, now, locked ? 'Tạm khoá cơ sở' : 'Kích hoạt cơ sở', id, ''); emit(); }

// ---- loại phòng, giá, tồn phòng (HM-FR-006…009, 012, 014…017, 019) ----
export function saveRoomType(pid, t, by, now) {
  const g = guard(by, 'roomtype', t.isNew ? 'C' : 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  const list = typesOf(pid); const err = {};
  if (!/^[A-Z0-9]{2,8}$/.test(t.id)) err.id = 'Mã gồm 2 đến 8 ký tự chữ hoa hoặc số.';
  else if (t.isNew && list.some((x) => x.id === t.id)) err.id = 'Mã loại phòng đã tồn tại trong khách sạn.';
  if (!t.name?.trim()) err.name = 'Nhập tên loại phòng.';
  if (!Number.isInteger(t.capacity) || t.capacity < 1) err.capacity = 'Số khách tối đa phải là số nguyên từ 1.';
  if (!Number.isInteger(t.beds) || t.beds < 1) err.beds = 'Số giường phải là số nguyên từ 1.';
  if (!Number.isInteger(t.rooms) || t.rooms < 1 || t.rooms > 500) err.rooms = 'Số phòng vật lý từ 1 đến 500.';
  if (Object.keys(err).length) return { ok: false, err };
  if (!t.isNew) {
    const cur = list.find((x) => x.id === t.id);
    for (let i = 0; i < DAYS; i += 1) { const d = dayInventory(pid, t.id, i); const need = d.booked + d.unavailable + d.held; if (t.rooms < need) return { ok: false, err: { rooms: `Không giảm dưới ${need} phòng đã cam kết (ngày ${dayLabel(i)}).` } }; }
    touch(pid);
    S.roomTypes = { ...S.roomTypes, [pid]: list.map((x) => (x.id === t.id ? { ...x, ...t, isNew: undefined } : x)) };
    logEv(by, now, cur.rooms !== t.rooms ? 'roomtype.capacity.changed' : 'roomtype.updated', `${pid}/${t.id}`, t.name, { before: cur.rooms, after: t.rooms });
  } else {
    S.roomTypes = { ...S.roomTypes, [pid]: [...list, { ...t, isNew: undefined, baseBooked: 0, status: 'selling', amenities: t.amenities || [] }] };
    S.rates = { ...S.rates, [pid]: { ...S.rates[pid], [t.id]: { base: priceOn(pid, list[0]?.id, 0) || 450000, days: {} } } };
    logEv(by, now, 'roomtype.created', `${pid}/${t.id}`, t.name);
  }
  emit(); return { ok: true };
}
export function setTypeStatus(pid, typeId, status, by, now) {
  const g = guard(by, 'roomtype', status === 'retired' ? 'X' : 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  if (status === 'retired') { const n = S.bookings.filter((b) => b.propertyId === pid && b.typeId === typeId && b.status === 'confirmed').length; if (n) return { ok: false, error: `Còn ${n} đặt phòng đã xác nhận ở loại phòng này; xử lý trước khi ngừng dùng.` }; }
  touch(pid);
  S.roomTypes = { ...S.roomTypes, [pid]: typesOf(pid).map((x) => (x.id === typeId ? { ...x, status } : x)) };
  logEv(by, now, 'roomtype.status.changed', `${pid}/${typeId}`, status); emit(); return { ok: true };
}
const inRange = (p) => Number.isFinite(p) && p >= TEN_PRICE[0] && p <= TEN_PRICE[1];
export function setBasePrice(pid, typeId, price, by, now) {
  const g = guard(by, 'rate', 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!inRange(price)) return { ok: false, error: 'Nhập giá từ 100.000đ đến 20.000.000đ (số nguyên).' };
  const r = S.rates[pid][typeId]; const before = r.base;
  touch(pid);
  S.rates = { ...S.rates, [pid]: { ...S.rates[pid], [typeId]: { ...r, base: price } } };
  S.rateLog = [{ at: now, who: by.id, pid, typeId, scope: 'Giá cơ sở', before, after: price }, ...S.rateLog];
  logEv(by, now, 'rate.changed', `${pid}/${typeId}`, 'giá cơ sở', { before, after: price }); emit(); return { ok: true };
}
export function setDayPrices(pid, typeId, from, to, price, by, now, force = false) {
  const g = guard(by, 'rate', 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!inRange(price)) return { ok: false, error: 'Nhập giá từ 100.000đ đến 20.000.000đ (số nguyên).' };
  if (from > to) return { ok: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' };
  const r = S.rates[pid][typeId]; const overlap = []; for (let i = from; i <= to; i += 1) if (r.days[i] != null) overlap.push(i);
  if (overlap.length && !force) return { ok: false, needConfirm: true, overlap, error: `Có ${overlap.length} ngày đã có giá riêng; xác nhận để ghi đè.` };
  const days = { ...r.days }; const log = [];
  for (let i = from; i <= to; i += 1) { log.push({ at: now, who: by.id, pid, typeId, scope: `Ngày ${dayLabel(i)}`, before: r.days[i] ?? r.base, after: price }); days[i] = price; }
  touch(pid);
  S.rates = { ...S.rates, [pid]: { ...S.rates[pid], [typeId]: { ...r, days } } }; S.rateLog = [...log.reverse(), ...S.rateLog];
  logEv(by, now, 'rate.changed', `${pid}/${typeId}`, `${dayLabel(from)}–${dayLabel(to)}`, { after: price }); emit(); return { ok: true };
}
export function setClosed(pid, typeId, from, to, closed, by, now) {
  const g = guard(by, 'inventory', 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  const cd = { ...(S.closedDays[pid]?.[typeId] || {}) }; for (let i = from; i <= to; i += 1) { if (closed) cd[i] = true; else delete cd[i]; }
  touch(pid);
  S.closedDays = { ...S.closedDays, [pid]: { ...S.closedDays[pid], [typeId]: cd } };
  logEv(by, now, closed ? 'inventory.closed' : 'inventory.opened', `${pid}/${typeId}`, `${dayLabel(from)}–${dayLabel(to)}`); emit(); return { ok: true };
}
export function setBlackout(pid, typeId, from, to, n, reason, by, now) {
  const g = guard(by, 'inventory', 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'Số phòng không khả dụng phải là số nguyên từ 0.' };
  if (n > 0 && !reason?.trim()) return { ok: false, error: 'Cần nhập lý do (bảo trì, không nhận khách…).' };
  if (from > to) return { ok: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' };
  const t = typesOf(pid).find((x) => x.id === typeId); const bad = [];
  for (let i = from; i <= to; i += 1) { const d = dayInventory(pid, typeId, i); const others = d.booked + d.held; if (others + n > t.rooms) bad.push(`${dayLabel(i)} (còn tối đa ${Math.max(t.rooms - others, 0)})`); }
  if (bad.length) return { ok: false, error: `Vượt số phòng có thể cung cấp, không đặt vượt tồn: ${bad.join(', ')}.` };
  const bo = { ...(S.blackouts[pid]?.[typeId] || {}) }; for (let i = from; i <= to; i += 1) { if (n === 0) delete bo[i]; else bo[i] = { n, reason }; }
  touch(pid);
  S.blackouts = { ...S.blackouts, [pid]: { ...S.blackouts[pid], [typeId]: bo } };
  logEv(by, now, 'inventory.blackout.set', `${pid}/${typeId}`, `${dayLabel(from)}–${dayLabel(to)}: ${n} phòng`, { reason }); emit(); return { ok: true };
}

// ---- đặt phòng (FR-012 ghi nhận; HM-FR-021…024, 026, 028) ----
export function addBooking({ propertyId, name, method, now }) {
  S.seq.booking += 1; const code = `DC-${String(S.seq.booking).padStart(4, '0')}`;
  const t = sellingTypes(propertyId).find((x) => dayInventory(propertyId, x.id, 0).onSale > 0) || sellingTypes(propertyId)[0];
  touch(propertyId);
  S.bookings = [...S.bookings, { code, propertyId, typeId: t?.id || 'STD', dayIdx: 0, nights: 1, name, method, createdAt: now, status: 'confirmed', reason: null, cid: nextCid(), price: t ? priceOn(propertyId, t.id, 0) : 0, history: [] }];
  emit(); return code;
}
export function setBookingStatus(code, status, reason, by, now) {
  const b = S.bookings.find((x) => x.code === code);
  const g = guard(by, 'booking', 'A', b?.propertyId, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!b) return { ok: false, error: 'Không tìm thấy đặt phòng.' };
  if (status === 'rejected' && !reason) return { ok: false, error: 'Từ chối cần lý do.' };
  if (status === 'confirmed' && b.status === 'rejected') {
    for (let i = b.dayIdx; i < b.dayIdx + b.nights; i += 1) { if (dayInventory(b.propertyId, b.typeId, i).sellable < 1) return { ok: false, error: `Hết phòng ngày ${dayLabel(i)}, không thể xác nhận lại (không đặt vượt tồn).` }; }
  }
  if (b.status === status) return { ok: true }; // idempotent
  S.bookings = S.bookings.map((x) => (x.code === code ? { ...x, status, reason: reason || null, decidedAt: now, history: [{ at: now, from: x.status, to: status, who: by.id, reason: reason || '' }, ...x.history] } : x));
  logEv(by, now, status === 'rejected' ? 'Từ chối đặt chỗ' : 'Xác nhận đặt chỗ', code, reason || '', { reason, cid: b.cid, before: b.status, after: status }); emit(); return { ok: true };
}
export const nextBookingCode = () => `DC-${String(S.seq.booking + 1).padStart(4, '0')}`;

// ---- đón khách (HM-FR-035: Blocked D-26, giữ bản mô phỏng đã có) ----
export function requestPickup({ booking, property, now }) {
  S.seq.pickup += 1; const id = `XD-${String(S.seq.pickup).padStart(4, '0')}`;
  S.pickups = [...S.pickups, { id, bookingCode: booking.code, propertyId: property.id, airport: property.airport, name: booking.name, etaMin: now + property.travelMin, status: 'waiting', reason: null, driverId: null, updatedAt: now }];
  emit(); return id;
}
export function setPickupStatus(id, status, reason, by, now) {
  S.pickups = S.pickups.map((x) => (x.id === id ? { ...x, status, reason: reason || null, updatedAt: now, driverId: x.driverId || (by?.role === 'driver' ? by.id : null) } : x));
  logEv(by, now, `Đón khách: ${PICKUP_LABEL[status]}`, id, reason || '', { reason }); emit();
}

// ---- tài khoản, phiên (SA-FR-001…005) ----
const ACCOUNT_ID_PREFIX = { admin: 'qt', ops: 'vh', support: 'ht', finance: 'tc', auditor: 'kt', manager: 'ks', staff: 'nv', driver: 'lx' };
export function inviteAccount({ role, propertyId, identifier }, by, now) {
  const g = guard(by, 'account', 'C', propertyId || null, now); if (!g.ok) return { ok: false, error: g.reason };
  const grantable = by.role === 'admin' ? ['ops', 'support', 'finance', 'auditor', 'manager', 'staff', 'driver'] : ['staff', 'driver'];
  if (!grantable.includes(role)) return { ok: false, error: 'Không thể cấp vai trò vượt quyền của người mời.' };
  const idf = identifier.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(idf)) return { ok: false, error: 'Nhập định danh dạng địa chỉ thư (ví dụ ten@khachsan.mo).' };
  if (S.accounts.some((a) => a.identifier === idf)) return { ok: false, error: 'Định danh đã tồn tại trong hệ thống.' };
  if (ROLE_META[role].area === 'hotel' && !propertyId) return { ok: false, error: 'Chọn cơ sở để gán cho tài khoản.' };
  S.seq.account += 1; const id = `${ACCOUNT_ID_PREFIX[role]}-${(propertyId || 'airrest').toLowerCase()}-${String(S.seq.account).padStart(2, '0')}`;
  S.accounts = [...S.accounts, { id, role, propertyId: propertyId || null, tenantId: ROLE_META[role].area === 'hotel' ? propertyId : null, status: 'invited', identifier: idf, inviteExpiresAt: now + 60 * 24 * 3 }];
  logEv(by, now, 'account.invited', id, ROLE_LABEL[role], { after: 'invited' }); emit(); return { ok: true, id };
}
export function acceptInvite(id, by, now) { S.accounts = S.accounts.map((a) => (a.id === id && a.status === 'invited' ? { ...a, status: 'active' } : a)); logEv(by, now, 'account.activated', id, ''); emit(); }
export function expireInvite(id, by, now) { S.accounts = S.accounts.map((a) => (a.id === id && a.status === 'invited' ? { ...a, status: 'disabled' } : a)); logEv(by, now, 'account.invite.expired', id, ''); emit(); }
const revokeAll = (accountId) => { S.sessions = S.sessions.map((s) => (s.accountId === accountId ? { ...s, revoked: true } : s)); };
export function setAccountStatus(id, to, reason, by, now) {
  const acc = S.accounts.find((a) => a.id === id);
  const g = guard(by, 'account', 'X', acc?.tenantId, now); if (!g.ok) return { ok: false, error: g.reason };
  if (to !== 'active' && !reason) return { ok: false, error: 'Cần nhập lý do.' };
  if (to === 'disabled' && acc.role === 'admin' && S.accounts.filter((a) => a.role === 'admin' && a.status === 'active').length <= 1) return { ok: false, error: 'Không thể vô hiệu hóa quản trị viên cuối cùng.' };
  if (acc.id === by.id && to !== 'active') return { ok: false, error: 'Không thể tự khóa hoặc vô hiệu hóa tài khoản đang dùng.' };
  S.accounts = S.accounts.map((a) => (a.id === id ? { ...a, status: to } : a)); if (to !== 'active') revokeAll(id);
  logEv(by, now, { active: 'account.unlocked', locked: 'account.locked', disabled: 'account.disabled' }[to], id, '', { reason, before: acc.status, after: to }); emit(); return { ok: true };
}
export function assignRole(id, role, by, now) {
  const acc = S.accounts.find((a) => a.id === id);
  const g = guard(by, 'account', 'M', acc?.tenantId, now); if (!g.ok) return { ok: false, error: g.reason };
  if (acc.id === by.id) return { ok: false, error: 'Không tự đổi vai trò của chính mình.' };
  const grantable = by.role === 'admin' ? ['ops', 'support', 'finance', 'auditor', 'manager', 'staff', 'driver', 'none'] : ['staff', 'driver', 'none'];
  if (!grantable.includes(role)) return { ok: false, error: 'Không thể gán vai trò vượt quyền của người gán.' };
  if (acc.role === 'admin') return { ok: false, error: 'Không đổi vai trò quản trị hệ thống ở đây.' };
  S.accounts = S.accounts.map((a) => (a.id === id ? { ...a, role } : a)); revokeAll(id);
  logEv(by, now, role === 'none' ? 'role.revoked' : 'role.assigned', id, role, { before: acc.role, after: role }); emit(); return { ok: true };
}
export function startSession(acc, now) { S.seq.session += 1; const sid = `PH-${String(S.seq.session).padStart(4, '0')}`; S.sessions = [...S.sessions, { id: sid, accountId: acc.id, role: acc.role, startAt: now, revoked: false }]; logEv({ id: acc.id, role: acc.role }, now, 'auth.login', acc.id, ''); emit(); return sid; }
export function revokeSession(sid, by, now) { S.sessions = S.sessions.map((s) => (s.id === sid ? { ...s, revoked: true } : s)); logEv(by, now, 'session.revoked', sid, ''); emit(); }
export const sessionAlive = (sid) => S.sessions.some((s) => s.id === sid && !s.revoked);

// ---- ca hỗ trợ (SA-FR-033…035; SM-07) ----
export function createCase({ title, category, link, by, now, desc }) {
  S.seq.case += 1; const id = `CA-${String(S.seq.case).padStart(4, '0')}`;
  S.cases = [...S.cases, { id, title, category: category || '', desc: desc || '', status: 'New', assignee: null, link: link || null, notes: [], history: [{ at: now, to: 'New', who: by?.id || 'người dùng cuối' }], createdBy: by?.id || 'người dùng cuối', createdRole: by?.role || 'enduser', createdAt: now, conclusion: '' }];
  logEv(by, now, 'case.created', id, title); emit(); return id;
}
const CASE_NEXT = { New: ['Triaged'], Triaged: ['Assigned'], Assigned: ['InProgress'], InProgress: ['Escalated', 'Resolved'], Escalated: ['InProgress'], Resolved: ['Closed', 'InProgress'], Closed: [] };
export const caseNext = (s) => CASE_NEXT[s] || [];
export function setCaseStatus(id, to, extra, by, now) {
  const c = S.cases.find((x) => x.id === id);
  const g = guard(by, 'case', 'U', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!CASE_NEXT[c.status].includes(to)) return { ok: false, error: 'Chuyển trạng thái không hợp lệ.' };
  if (to === 'Triaged' && !extra?.category) return { ok: false, error: 'Chọn phân loại trước.' };
  if (to === 'Assigned' && !extra?.assignee) return { ok: false, error: 'Chọn người xử lý.' };
  if (to === 'Resolved' && !extra?.conclusion?.trim()) return { ok: false, error: 'Nhập kết luận trước khi đánh dấu đã giải quyết.' };
  if ((to === 'Escalated' || (c.status === 'Resolved' && to === 'InProgress')) && !extra?.reason?.trim()) return { ok: false, error: 'Nhập lý do.' };
  S.cases = S.cases.map((x) => (x.id === id ? { ...x, status: to, category: extra?.category || x.category, assignee: extra?.assignee || x.assignee, conclusion: extra?.conclusion || x.conclusion, history: [{ at: now, from: c.status, to, who: by.id, reason: extra?.reason || '' }, ...x.history] } : x));
  logEv(by, now, 'case.status.changed', id, `${c.status} → ${to}`, { reason: extra?.reason, before: c.status, after: to }); emit(); return { ok: true };
}
export function addCaseNote(id, text, by, now) { if (!text.trim()) return { ok: false, error: 'Nhập nội dung ghi chú.' }; S.cases = S.cases.map((x) => (x.id === id ? { ...x, notes: [...x.notes, { at: now, who: by.id, text }] } : x)); logEv(by, now, 'case.note', id, ''); emit(); return { ok: true }; }

// ---- sự cố hệ thống (SA-FR-024) và sự cố chất lượng đối tác (HM-FR-039) ----
export function createIncident({ title, severity, cid }, by, now) {
  S.seq.incident += 1; const id = `SI-${String(S.seq.incident).padStart(4, '0')}`;
  S.incidents = [...S.incidents, { id, title, severity, cid: cid || '', status: 'New', assignee: null, conclusion: '', history: [{ at: now, to: 'New', who: by.id }] }];
  logEv(by, now, 'incident.created', id, title); emit(); return id;
}
export function setIncidentStatus(id, to, extra, by, now) {
  const x = S.incidents.find((i) => i.id === id);
  const ok = { New: ['InProgress'], InProgress: ['Resolved'], Resolved: ['Closed', 'InProgress'], Closed: [] }[x.status];
  if (!ok.includes(to)) return { ok: false, error: 'Chuyển trạng thái không hợp lệ.' };
  if ((to === 'Closed' || to === 'Resolved') && !(extra?.conclusion || x.conclusion).trim()) return { ok: false, error: 'Không đóng được khi chưa có kết luận.' };
  S.incidents = S.incidents.map((i) => (i.id === id ? { ...i, status: to, assignee: extra?.assignee || i.assignee || by.id, conclusion: extra?.conclusion || i.conclusion, history: [{ at: now, from: i.status, to, who: by.id }, ...i.history] } : i));
  logEv(by, now, 'incident.status.changed', id, `${x.status} → ${to}`); emit(); return { ok: true };
}
export function createQuality({ propertyId, category, desc, bookingCode }, by, now) {
  const g = guard(by, 'quality', 'C', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!category) return { ok: false, error: 'Chọn phân loại thuộc danh mục.' };
  if (!desc.trim()) return { ok: false, error: 'Nhập mô tả sự cố.' };
  S.seq.quality += 1; const id = `CL-${String(S.seq.quality).padStart(4, '0')}`;
  S.quality = [...S.quality, { id, propertyId, category, desc, bookingCode: bookingCode || '', status: 'open', createdBy: by.id, at: now }];
  logEv(by, now, 'quality.incident.created', id, propertyName(propertyId), { after: category }); emit(); return { ok: true, id };
}

// ---- cấu hình có kiểm soát thay đổi (SA-FR-015, 019, 020; SM-06) ----
export const flagValue = (k) => !!S.flags[k]?.value;
export function proposeFlagChange(key, value, by, now) {
  const g = guard(by, 'config', 'S', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (S.changes.some((c) => c.key === key && c.status === 'PendingApproval')) return { ok: false, error: 'Đã có thay đổi đang chờ duyệt cho cờ này.' };
  S.seq.change += 1; const id = `TD-${String(S.seq.change).padStart(4, '0')}`;
  S.changes = [{ id, kind: 'flag', key, before: S.flags[key].value, after: value, maker: by.id, status: 'PendingApproval', approver: null, reason: '', at: now }, ...S.changes];
  logEv(by, now, 'config.change.submitted', id, key, { before: S.flags[key].value, after: value }); emit(); return { ok: true, id };
}
export function decideChange(id, decision, reason, by, now) {
  const g = guard(by, 'approval', 'A', null, now); if (!g.ok) return { ok: false, error: g.reason };
  const c = S.changes.find((x) => x.id === id); if (!c || c.status !== 'PendingApproval') return { ok: false, error: 'Thay đổi đã được xử lý (xung đột).' };
  if (decision === 'reject' && !reason?.trim()) return { ok: false, error: 'Cần nhập lý do từ chối.' };
  if (decision === 'approve') {
    S.changes = S.changes.map((x) => (x.id === id ? { ...x, status: 'Effective', approver: by.id, decidedAt: now } : (x.key === c.key && x.status === 'Effective' ? { ...x, status: 'Superseded' } : x)));
    S.flags = { ...S.flags, [c.key]: { value: c.after, version: S.flags[c.key].version + 1 } };
    logEv(by, now, 'config.approved', id, c.key, { before: c.before, after: c.after });
  } else {
    S.changes = S.changes.map((x) => (x.id === id ? { ...x, status: 'Rejected', approver: by.id, reason, decidedAt: now } : x));
    logEv(by, now, 'config.rejected', id, c.key, { reason });
  }
  emit(); return { ok: true };
}
export function rollbackChange(id, reason, by, now) {
  const g = guard(by, 'approval', 'A', null, now); if (!g.ok) return { ok: false, error: g.reason };
  const c = S.changes.find((x) => x.id === id); if (!c || c.status !== 'Effective') return { ok: false, error: 'Chỉ rollback được thay đổi đang hiệu lực.' };
  if (!reason?.trim()) return { ok: false, error: 'Cần nhập lý do rollback.' };
  S.seq.change += 1; const nid = `TD-${String(S.seq.change).padStart(4, '0')}`;
  S.changes = [{ id: nid, kind: 'flag', key: c.key, before: c.after, after: c.before, maker: by.id, status: 'Effective', approver: by.id, reason: `Rollback ${id}: ${reason}`, at: now }, ...S.changes.map((x) => (x.id === id ? { ...x, status: 'RolledBack' } : x))];
  S.flags = { ...S.flags, [c.key]: { value: c.before, version: S.flags[c.key].version + 1 } };
  logEv(by, now, 'config.rolledback', id, c.key, { reason, before: c.after, after: c.before }); emit(); return { ok: true };
}
export function catalogInUse(catalog, item) {
  if (catalog === 'reject_reasons') return S.bookings.some((b) => b.reason === item.label || b.history.some((h) => h.reason === item.label)); // gồm cả lịch sử trạng thái
  if (catalog === 'case_categories') return S.cases.some((c) => c.category === item.label);
  if (catalog === 'incident_types') return S.quality.some((q) => q.category === item.label);
  return false;
}
export function catalogAdd(catalog, label, by, now) {
  const g = guard(by, 'config', 'U', null, now); if (!g.ok) return { ok: false, error: g.reason };
  if (!label.trim()) return { ok: false, error: 'Nhập tên mục.' };
  if (S.catalogs[catalog].some((x) => x.label.toLowerCase() === label.trim().toLowerCase())) return { ok: false, error: 'Mục đã tồn tại.' };
  S.catalogs = { ...S.catalogs, [catalog]: [...S.catalogs[catalog], { id: `${catalog}-${S.catalogs[catalog].length + 1}`, label: label.trim(), active: true }] };
  logEv(by, now, 'catalog.changed', catalog, `thêm “${label.trim()}”`); emit(); return { ok: true };
}
export function catalogToggle(catalog, id, by, now) {
  const g = guard(by, 'config', 'U', null, now); if (!g.ok) return { ok: false, error: g.reason };
  S.catalogs = { ...S.catalogs, [catalog]: S.catalogs[catalog].map((x) => (x.id === id ? { ...x, active: !x.active } : x)) };
  logEv(by, now, 'catalog.changed', catalog, `đổi trạng thái ${id}`); emit(); return { ok: true };
}
export function catalogDelete(catalog, id, by, now) {
  const g = guard(by, 'config', 'U', null, now); if (!g.ok) return { ok: false, error: g.reason };
  const it = S.catalogs[catalog].find((x) => x.id === id);
  if (catalogInUse(catalog, it)) return { ok: false, error: 'Mục đang được tham chiếu: chỉ có thể ngừng dùng, không xóa.' };
  S.catalogs = { ...S.catalogs, [catalog]: S.catalogs[catalog].filter((x) => x.id !== id) };
  logEv(by, now, 'catalog.changed', catalog, `xóa “${it.label}”`); emit(); return { ok: true };
}
export const REJECT_REASONS = S0.catalogs.reject_reasons.map((x) => x.label);
export const activeCatalog = (c) => S.catalogs[c].filter((x) => x.active).map((x) => x.label);

export const DEFAULT_POLICY = { checkin: '14:00', checkout: '12:00', childPolicy: '', extraBed: false, maxGuests: 2 };
export const policyOf = (pid) => S.policies[pid] || DEFAULT_POLICY;
export function savePolicy(pid, pol, by, now) {
  const g = guard(by, 'rate', 'U', pid, now); if (!g.ok) return { ok: false, error: g.reason };
  const err = {};
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pol.checkin)) err.checkin = 'Nhập giờ nhận phòng dạng HH:MM.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pol.checkout)) err.checkout = 'Nhập giờ trả phòng dạng HH:MM.';
  const cap = Math.max(...typesOf(pid).map((t) => t.capacity), 0);
  if (!Number.isInteger(pol.maxGuests) || pol.maxGuests < 1) err.maxGuests = 'Số khách tối đa phải là số nguyên từ 1.';
  else if (pol.maxGuests > cap) err.maxGuests = `Không vượt sức chứa loại phòng lớn nhất (${cap} khách).`;
  if (Object.keys(err).length) return { ok: false, err };
  const before = policyOf(pid); S.policies = { ...S.policies, [pid]: pol };
  logEv(by, now, 'policy.changed', pid, '', { before: JSON.stringify(before), after: JSON.stringify(pol) }); emit(); return { ok: true };
}
