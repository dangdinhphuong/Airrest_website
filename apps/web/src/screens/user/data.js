// Tiện ích dùng chung cho các màn người dùng cuối (giao diện sao chép từ AIRREST). Dữ liệu gọi API ở ../../data/user.js.

// Trạng thái đặt phòng của backend -> câu hiển thị cho khách.
const STATUS = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING: 'Chờ khách sạn xác nhận',
  CONFIRMED: 'Đã được xác nhận',
  CHECKED_IN: 'Đã nhận phòng',
  CHECKED_OUT: 'Đã trả phòng',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Bị từ chối',
  EXPIRED: 'Đã hết hạn',
  NO_SHOW: 'Không đến nhận phòng',
};
export const statusCopy = (status) => STATUS[status] ?? status;
// Màu nhãn trạng thái (class Tailwind, chưa tiền tố vì dùng qua cx ở nơi gọi).
export const statusTone = (status) => (['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(status) ? 'ok' : ['REJECTED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(status) ? 'bad' : 'wait');

// Bộ lọc nhanh (chọn nhiều, kết hợp "và"); dùng chung cho trang chủ và trợ lý chat. Thuộc tính lấy từ data/user.js (toHotelView).
export const CHIPS = [
  { id: 'budget', label: 'Dưới 700.000đ', test: (h) => h.room.price < 700000 },
  { id: 'shuttle', label: 'Có xe đưa đón', test: (h) => h.shuttleAvailable },
  { id: 'freeCancel', label: 'Hủy miễn phí', test: (h) => h.freeCancel },
  { id: 'hourly', label: 'Thuê theo giờ', test: (h) => h.hourly },
  { id: 'family', label: 'Phù hợp gia đình', test: (h) => h.familyRoom },
  { id: 'open24', label: 'Lễ tân 24/24', test: (h) => h.reception24 },
  { id: 'rating', label: 'Đánh giá từ 8.0', test: (h) => Number(h.rating) >= 8 },
];

// "AR-7K3M9P2Q 0912345678" -> { ref, phone } (phần nào không có thì null). Backend yêu cầu CẢ HAI để tra cứu; dùng cho trang theo dõi và trợ lý chat.
export function parseTrack(text) {
  const s = String(text);
  const ref = s.match(/\bAR-[0-9A-Z]{8}\b/i)?.[0] ?? null;
  const cand = (ref ? s.replace(ref, ' ') : s).match(/\+?\d[\d\s.-]{7,}\d/)?.[0] ?? null;
  const n = cand ? cand.replace(/\D/g, '').length : 0;
  return { ref, phone: n >= 9 && n <= 15 ? cand : null }; // SĐT 9-15 chữ số; ngắn hơn là số khác (giá, ngày...)
}

// Cuộn mượt tới một khu vực (không dùng href="#id" vì ứng dụng đang dùng hash cho định tuyến).
export const scrollToId = (id, block = 'start') => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block }), 40);
