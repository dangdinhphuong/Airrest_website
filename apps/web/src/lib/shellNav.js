import { BedDouble, BellRing, Building2, Compass, HelpCircle, Hotel, Plane, ShieldCheck } from 'lucide-react';

// Điều hướng hai tầng theo mẫu react/apps/walo-erp: các module (người dùng, khách sạn, quản trị) và thanh menu con.
export const MODULES = {
  user: { key: 'user', label: 'Người dùng', icon: Compass, tone: '#0066b3', screen: 'stays' },
  hotel: { key: 'hotel', label: 'Khách sạn', icon: Building2, tone: '#047857', screen: 'hotel' },
  admin: { key: 'admin', label: 'Quản trị', icon: ShieldCheck, tone: '#6d28d9', screen: 'admin' },
};

// Module đang chọn suy từ màn hình hiện tại.
export const moduleOf = (screen) => (screen === 'hotel' ? 'hotel' : screen === 'admin' ? 'admin' : screen === 'login' ? null : 'user');

// Màu ô icon của từng tính năng ở thanh menu con (cố định theo id).
export const FEAT_TONE = {
  stays: '#0066b3', home: '#0ea5e9', advice: '#f97316', reminder: '#e11d48', terminal: '#10b981', support: '#7c3aed',
  overview: '#4f46e5', bookings: '#e11d48', rooms: '#f97316', inventory: '#0891b2', profile: '#475569', quality: '#10b981', reports: '#0ea5e9', pickups: '#d97706', pending: '#64748b',
  properties: '#f97316', accounts: '#0066b3', rbac: '#7c3aed', config: '#475569', monitor: '#10b981', cases: '#e11d48', log: '#0891b2',
};

export const userNav = (hasFlight, hasStay) => [
  { id: 'stays', label: 'Khám phá', icon: Compass, screen: 'stays' },
  { id: 'home', label: 'Chuyến bay', icon: Plane, screen: hasFlight ? 'status' : 'home' },
  { id: 'advice', label: 'Gợi ý', icon: BedDouble, screen: 'advice', needFlight: true },
  { id: 'reminder', label: 'Nhắc giờ', icon: BellRing, screen: 'reminder', needFlight: true, needStay: true },
  { id: 'terminal', label: 'Nhà ga', icon: Hotel, screen: 'terminal' },
  { id: 'support', label: 'Hỗ trợ', icon: HelpCircle, screen: 'support' },
].map((i) => ({ ...i, disabled: (i.needFlight && !hasFlight) || (i.needStay && !hasStay), hint: 'Cần nhập chuyến bay trước' }));

export const USER_ACTIVE = { stays: 'stays', detail: 'stays', booking: 'stays', status: 'home', home: 'home', request: 'home', advice: 'advice', reminder: 'reminder', terminal: 'terminal', support: 'support' };

// Đường dẫn vị trí (breadcrumb) của các màn người dùng cuối.
export const USER_CRUMB = {
  stays: ['Khám phá'], detail: ['Khám phá', 'Chi tiết nơi nghỉ'], booking: ['Khám phá', 'Đặt chỗ'], home: ['Chuyến bay'], status: ['Chuyến bay', 'Tình trạng'],
  request: ['Chuyến bay', 'Yêu cầu hỗ trợ'], advice: ['Gợi ý'], reminder: ['Nhắc giờ'], terminal: ['Nhà ga'], support: ['Hỗ trợ'],
};
