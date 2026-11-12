import { Activity, Building2, CalendarCheck2, FileText, Headset, Plane, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { PERM } from './perms';

// Menu cổng quản trị. `need`: cần đủ các quyền (khớp requirePermission của backend); `any`: ít nhất một quyền.
export const adminTabs = [
  { id: 'dashboard', label: 'Tổng quan', short: 'Tổng quan', icon: Activity, need: [PERM.ADMIN_DASHBOARD_READ] },
  { id: 'hotels', label: 'Khách sạn', short: 'Khách sạn', icon: Building2, need: [PERM.ADMIN_HOTEL_READ] },
  { id: 'bookings', label: 'Đơn đặt phòng', short: 'Đơn đặt', icon: CalendarCheck2, need: [PERM.ADMIN_BOOKING_READ] },
  { id: 'support', label: 'Hỗ trợ', short: 'Hỗ trợ', icon: Headset, need: [PERM.SUPPORT_HANDLE] },
  { id: 'accounts', label: 'Tài khoản và vai trò', short: 'Tài khoản', icon: Users, need: [PERM.ADMIN_ACCOUNT_MANAGE] },
  { id: 'configs', label: 'Cấu hình', short: 'Cấu hình', icon: SlidersHorizontal, need: [PERM.ADMIN_CONFIG_READ] },
  { id: 'flights', label: 'Chuyến bay mô phỏng', short: 'Chuyến bay', icon: Plane, need: [PERM.FLIGHT_MANAGE] },
  { id: 'payments', label: 'Thanh toán', short: 'Thanh toán', icon: Wallet, need: [PERM.ADMIN_PAYMENT_READ] },
  { id: 'audit', label: 'Nhật ký', short: 'Nhật ký', icon: FileText, need: [PERM.AUDIT_READ] },
];
