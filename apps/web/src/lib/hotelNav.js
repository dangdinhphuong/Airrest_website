import { Banknote, BarChart3, Settings, ShieldCheck, UserCog, Hotel, BedDouble, BellRing, Building2, CalendarCheck2, Car, ClipboardList, Navigation, RefreshCw, Truck, Wallet } from 'lucide-react';
import { PERM } from './perms';

// Menu cổng khách sạn. `need`: cần đủ các quyền (khớp requirePermission của backend); `any`: ít nhất một quyền; `group`: nhóm hiển thị trong sidebar cây.
export const hotelTabs = [
  { id: 'overview', label: 'Tổng quan', short: 'Tổng quan', group: 'Tổng quan', icon: ClipboardList, need: [PERM.BOOKING_READ] },
  { id: 'myHotels', label: 'Khách sạn của tôi', short: 'Khách sạn', group: 'Doanh nghiệp', icon: Hotel, need: [PERM.BUSINESS_HOTEL_MANAGE], noHotel: true },
  { id: 'bookings', label: 'Đặt phòng', short: 'Đặt phòng', group: 'Đặt phòng', icon: CalendarCheck2, need: [PERM.BOOKING_READ] },
  { id: 'rooms', label: 'Loại phòng và giá', short: 'Phòng, giá', group: 'Phòng và giá', icon: Wallet, need: [PERM.BOOKING_READ] },
  { id: 'profile', label: 'Hồ sơ khách sạn', short: 'Hồ sơ', group: 'Phòng và giá', icon: Building2, need: [PERM.ROOM_MANAGE] },
  { id: 'inventory', label: 'Tồn phòng', short: 'Tồn phòng', group: 'Phòng và giá', icon: BedDouble, need: [PERM.BOOKING_READ] },
  { id: 'delayOffers', label: 'Yêu cầu khách delay', short: 'Khách delay', group: 'Đặt phòng', icon: BellRing, need: [PERM.BOOKING_DECIDE] },
  { id: 'changes', label: 'Hủy / đổi ngày', short: 'Hủy / đổi', group: 'Đặt phòng', icon: RefreshCw, need: [PERM.REQUEST_HANDLE] },
  { id: 'fleet', label: 'Đăng ký xe và tài xế', short: 'Xe, tài xế', group: 'Vận chuyển', icon: Truck, need: [PERM.FLEET_MANAGE] },
  { id: 'shuttle', label: 'Theo dõi xe', short: 'Theo dõi xe', group: 'Vận chuyển', icon: Car, need: [], any: [PERM.FLEET_MANAGE, PERM.SHUTTLE_HANDLE] },
  { id: 'payouts', label: 'Chi trả', short: 'Chi trả', group: 'Tài chính', icon: Banknote, need: [PERM.BOOKING_READ] },
  { id: 'revenue', label: 'Báo cáo doanh thu', short: 'Doanh thu', group: 'Tài chính', icon: BarChart3, need: [PERM.BOOKING_READ] },
  { id: 'staff', label: 'Nhân viên', short: 'Nhân viên', group: 'Nhân sự', icon: UserCog, need: [PERM.HOTEL_STAFF_MANAGE] },
  { id: 'roles', label: 'Vai trò và phân quyền', short: 'Vai trò', group: 'Nhân sự', icon: ShieldCheck, need: [PERM.HOTEL_ROLE_MANAGE] },
  { id: 'trips', label: 'Chuyến của tôi', short: 'Chuyến', group: 'Vận chuyển', icon: Navigation, need: [PERM.TRIP_DRIVE] },
  // Cài đặt cá nhân: ai cũng thấy (không cần quyền), không tính khi xét khu vực được vào (access.areasOf).
  { id: 'settings', label: 'Cài đặt cá nhân', short: 'Cài đặt', group: 'Cài đặt', icon: Settings, need: [], common: true, noHotel: true },
];
