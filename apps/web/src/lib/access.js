import { adminTabs } from './adminNav';
import { hotelTabs } from './hotelNav';

// Phân quyền phía giao diện chỉ để ẩn/hiện menu và nút. Máy chủ luôn tự kiểm quyền ở mỗi route (403 nếu thiếu).
export const hasPerm = (session, p) => !!session?.permissions?.includes(p);
export const hasAll = (session, ps = []) => ps.every((p) => hasPerm(session, p));
export const hasAny = (session, ps = []) => ps.some((p) => hasPerm(session, p));

// Tab hiển thị khi có ĐỦ mọi quyền trong `need` (khớp requirePermission của backend) và, nếu có `any`, ít nhất một quyền trong `any`.
// Chủ doanh nghiệp chưa có khách sạn đang chọn (hotelId rỗng) chỉ thấy tab `noHotel` (tạo khách sạn đầu tiên).
export const visibleTabs = (session, tabs) => tabs.filter((t) => hasAll(session, t.need) && (!t.any || hasAny(session, t.any)) && (!(session?.business && !session.hotelId) || t.noHotel));

// Khu vực làm việc được vào, theo quyền: khách sạn cần tài khoản gắn khách sạn (hotelId) và ít nhất một tab; quản trị cần ít nhất một tab quản trị.
export function areasOf(session) {
  if (!session) return [];
  const a = [];
  const real = (tabs) => visibleTabs(session, tabs).filter((t) => !t.common); // tab dùng chung (Cài đặt) không tự mở khu vực
  if (real(adminTabs).length) a.push('admin');
  if ((session.hotelId || session.business) && real(hotelTabs).length) a.push('hotel');
  return a;
}

export const resolveTab = (items, tab) => (items.some((i) => i.id === tab) ? tab : items[0]?.id);
