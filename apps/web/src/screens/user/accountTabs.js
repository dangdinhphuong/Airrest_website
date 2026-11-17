import { CalendarCheck, Headphones, Ticket, UserRound } from 'lucide-react';

// Các mục menu tài khoản khách (dùng chung cho thanh bên trang Tài khoản và menu thả xuống ở header). id = đoạn đường dẫn /tai-khoan/<id>.
export const ACCOUNT_TABS = [
  { id: 'ho-so', label: 'Hồ sơ cá nhân', Icon: UserRound },
  { id: 'don-dat-phong', label: 'Đơn đặt phòng', Icon: CalendarCheck },
  { id: 'ma-giam-gia', label: 'Mã giảm giá', Icon: Ticket },
  { id: 'khieu-nai', label: 'Khiếu nại', Icon: Headphones },
];
export const DEFAULT_TAB = 'ho-so';
// Hai trang mở từ biểu tượng ở header, không nằm trong thanh bên.
export const EXTRA_TABS = { 'thong-bao': 'Thông báo', 'yeu-thich': 'Yêu thích' };
export const tabLabel = (id) => ACCOUNT_TABS.find((t) => t.id === id)?.label ?? EXTRA_TABS[id] ?? ACCOUNT_TABS[0].label;
