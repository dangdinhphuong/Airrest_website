import { Building2, Compass, ShieldCheck } from 'lucide-react';

// Điều hướng hai tầng theo mẫu react/apps/walo-erp: các module (người dùng, khách sạn, quản trị) và thanh menu con.
export const MODULES = {
  user: { key: 'user', label: 'Người dùng', icon: Compass, tone: '#0066b3', screen: 'home' },
  hotel: { key: 'hotel', label: 'Khách sạn', icon: Building2, tone: '#047857', screen: 'hotel' },
  admin: { key: 'admin', label: 'Quản trị', icon: ShieldCheck, tone: '#6d28d9', screen: 'admin' },
};

// Module đang chọn suy từ màn hình hiện tại.
export const moduleOf = (screen) => (screen === 'hotel' ? 'hotel' : screen === 'admin' ? 'admin' : screen === 'login' ? null : 'user');
