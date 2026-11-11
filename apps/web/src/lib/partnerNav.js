import { Activity, BarChart3, BedDouble, Building2, CalendarCheck2, Car, ClipboardList, FileText, Headset, Lock, Shield, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { can } from './rbac';

// Menu chức năng của khách sạn và nhân sự Airrest. Hiện ở thanh dọc bên trái (màn ≥1024px) giống menu người dùng cuối,
// và ở dải tab ngang trên mobile. Quyền theo ma trận ở rbac.js (deny by default).
// short: nhãn ngắn cho thanh dọc 88px; label: nhãn đầy đủ.
const HOTEL = [
  ['overview', 'Tổng quan', 'Tổng quan', ClipboardList, 'booking'],
  ['bookings', 'Đặt phòng', 'Đặt phòng', CalendarCheck2, 'booking'],
  ['rooms', 'Phòng và giá', 'Phòng, giá', Wallet, 'roomtype'],
  ['inventory', 'Tồn phòng', 'Tồn phòng', BedDouble, 'inventory'],
  ['profile', 'Hồ sơ cơ sở', 'Hồ sơ', ClipboardList, 'partner'],
  ['quality', 'Chất lượng', 'Chất lượng', BarChart3, 'quality'],
  ['reports', 'Báo cáo', 'Báo cáo', BarChart3, 'report'],
  ['pickups', 'Đón khách', 'Đón khách', Car, 'pickup'],
  ['pending', 'Chờ quyết định', 'Chờ QĐ', Lock, 'partner'],
];
export function hotelNav(role, hasProperty) {
  const list = hasProperty ? HOTEL : HOTEL.filter((x) => x[0] === 'profile');
  return list.filter(([id, , , , res]) => (role === 'driver' ? id === 'pickups' : (can(role, res, 'R') && !(id === 'pickups' && role === 'staff') && !(id === 'pending' && role !== 'manager'))))
    .map(([id, label, short, icon]) => ({ id, label, short, icon }));
}
export function adminNav(role) {
  const all = [
    ['properties', 'Đối tác', 'Đối tác', Building2, can(role, 'partner', 'R')],
    ['accounts', 'Tài khoản', 'Tài khoản', Users, can(role, 'account', 'R')],
    ['rbac', 'Vai trò và quyền', 'Quyền', Shield, can(role, 'rolepolicy', 'R')],
    ['config', 'Cấu hình', 'Cấu hình', SlidersHorizontal, can(role, 'config', 'R')],
    ['monitor', 'Giám sát', 'Giám sát', Activity, ['admin', 'ops', 'auditor'].includes(role)],
    ['cases', 'Hỗ trợ', 'Hỗ trợ', Headset, can(role, 'case', 'R')],
    ['log', 'Nhật ký và thống kê', 'Nhật ký', FileText, can(role, 'audit', 'R')],
    ['reports', 'Báo cáo', 'Báo cáo', BarChart3, can(role, 'report', 'R')],
    ['pending', 'Chờ quyết định', 'Chờ QĐ', Lock, true],
  ];
  return all.filter((x) => x[4]).map(([id, label, short, icon]) => ({ id, label, short, icon }));
}
export const resolveTab = (items, tab) => (items.some((i) => i.id === tab) ? tab : items[0]?.id);
