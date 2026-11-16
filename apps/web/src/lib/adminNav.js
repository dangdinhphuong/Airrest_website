import { Activity, Briefcase, Landmark, ReceiptText, Building2, CalendarCheck2, FileText, Headset, Receipt, Plane, PlaneTakeoff, Settings, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { PERM } from './perms';

// Menu cổng quản trị. `need`: cần đủ các quyền (khớp requirePermission của backend); `any`: ít nhất một quyền; `group`: nhóm hiển thị trong sidebar cây.
export const adminTabs = [
  { id: 'dashboard', label: 'Tổng quan', short: 'Tổng quan', group: 'Tổng quan', icon: Activity, need: [PERM.ADMIN_DASHBOARD_READ] },
  { id: 'hotels', label: 'Khách sạn', short: 'Khách sạn', group: 'Vận hành', icon: Building2, need: [PERM.ADMIN_HOTEL_READ] },
  { id: 'businesses', label: 'Doanh nghiệp', short: 'Doanh nghiệp', group: 'Vận hành', icon: Briefcase, need: [PERM.ADMIN_HOTEL_READ] },
  { id: 'bookings', label: 'Đơn đặt phòng', short: 'Đơn đặt', group: 'Vận hành', icon: CalendarCheck2, need: [PERM.ADMIN_BOOKING_READ] },
  { id: 'support', label: 'Hỗ trợ', short: 'Hỗ trợ', group: 'Vận hành', icon: Headset, need: [PERM.SUPPORT_HANDLE] },
  { id: 'accounts', label: 'Tài khoản và vai trò', short: 'Tài khoản', group: 'Hệ thống', icon: Users, need: [PERM.ADMIN_ACCOUNT_MANAGE] },
  { id: 'configs', label: 'Cấu hình', short: 'Cấu hình', group: 'Hệ thống', icon: SlidersHorizontal, need: [PERM.ADMIN_CONFIG_READ] },
  { id: 'flights', label: 'Chuyến bay', short: 'Chuyến bay', group: 'Vận hành', icon: Plane, need: [PERM.FLIGHT_MANAGE] },
  { id: 'payments', label: 'Thanh toán', short: 'Thanh toán', group: 'Tài chính', icon: Wallet, need: [PERM.ADMIN_PAYMENT_READ] },
  { id: 'payerDelay', label: 'Chuyến bay delay', short: 'Delay', group: 'Sân bay: delay và bảng kê', icon: PlaneTakeoff, need: [PERM.PAYER_DELAY_READ] },
  { id: 'payerStatements', label: 'Bảng kê tháng', short: 'Bảng kê', group: 'Sân bay: delay và bảng kê', icon: Receipt, need: [PERM.PAYER_DELAY_READ] },
  { id: 'adminPayers', label: 'Đơn vị chi trả', short: 'Chi trả', group: 'Sân bay: delay và bảng kê', icon: Landmark, need: [PERM.ADMIN_PAYER_READ] },
  { id: 'adminSettle', label: 'Bảng kê và chi trả', short: 'Quyết toán', group: 'Sân bay: delay và bảng kê', icon: ReceiptText, need: [], any: [PERM.ADMIN_PAYER_READ, PERM.ADMIN_PAYMENT_READ] },
  { id: 'audit', label: 'Nhật ký', short: 'Nhật ký', group: 'Hệ thống', icon: FileText, need: [PERM.AUDIT_READ] },
  { id: 'settings', label: 'Cài đặt cá nhân', short: 'Cài đặt', group: 'Cài đặt', icon: Settings, need: [], common: true },
];
