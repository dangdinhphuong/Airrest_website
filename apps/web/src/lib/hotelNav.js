import { BedDouble, Building2, CalendarCheck2, Car, ClipboardList, RefreshCw, Wallet } from 'lucide-react';
import { PERM } from './perms';

// Menu cổng khách sạn. `need`: cần đủ các quyền (khớp requirePermission của backend); `any`: ít nhất một quyền.
export const hotelTabs = [
  { id: 'overview', label: 'Tổng quan', short: 'Tổng quan', icon: ClipboardList, need: [PERM.BOOKING_READ] },
  { id: 'bookings', label: 'Đặt phòng', short: 'Đặt phòng', icon: CalendarCheck2, need: [PERM.BOOKING_READ] },
  { id: 'rooms', label: 'Loại phòng và giá', short: 'Phòng, giá', icon: Wallet, need: [PERM.BOOKING_READ] },
  { id: 'profile', label: 'Hồ sơ khách sạn', short: 'Hồ sơ', icon: Building2, need: [PERM.ROOM_MANAGE] },
  { id: 'inventory', label: 'Tồn phòng', short: 'Tồn phòng', icon: BedDouble, need: [PERM.BOOKING_READ] },
  { id: 'changes', label: 'Hủy / đổi ngày', short: 'Hủy / đổi', icon: RefreshCw, need: [PERM.REQUEST_HANDLE] },
  { id: 'shuttle', label: 'Xe đưa đón', short: 'Xe đưa đón', icon: Car, need: [PERM.SHUTTLE_HANDLE] },
];
