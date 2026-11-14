// Logic thuần của tab "Yêu cầu khách delay" (khách sạn).
export const URGENT_SECONDS = 60;

const ERR = {
  ROOM_NUMBERS_MISMATCH: 'Số phòng nhập chưa khớp số phòng được yêu cầu (không được trùng nhau).',
  INVALID_STATE: 'Yêu cầu này đã được xử lý hoặc không còn ở trạng thái chờ.',
  OFFER_EXPIRED: 'Yêu cầu đã hết hạn 5 phút, hệ thống đã chuyển cho khách sạn khác.',
};
export const delayOfferErr = (e) => ERR[e?.code] || null;

// Số phòng nhập -> { ok, list } hoặc { ok:false, error }. Cắt khoảng trắng, bỏ ô trống, bỏ trùng; phải đúng qty.
export function checkRoomNumbers(values, qty) {
  const list = [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
  if (list.length !== qty) return { ok: false, error: `Nhập đúng ${qty} số phòng khác nhau (hiện có ${list.length}).` };
  return { ok: true, list };
}

// Hiển thị lỏng tay: backend có thể trả chuỗi, số, mảng hoặc object { name | fullName }.
export function label(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.map(label).join(', ');
  if (typeof v === 'object') return v.name || v.fullName || v.label || '—';
  return String(v);
}

// ---- Yêu cầu gia hạn lưu trú (sự kiện realtime 'delay:extension') ----
const EXT_ERR = {
  EXTENSION_NO_ROOM: 'Khách sạn đã hết phòng trong khung gia hạn nên không thể đồng ý. Hệ thống đã ghi nhận và báo quầy.',
  INVALID_STATE: 'Yêu cầu gia hạn này đã được xử lý hoặc không còn chờ phản hồi.',
};
export const extensionErr = (e) => EXT_ERR[e?.code] || (e?.status === 404 ? 'Không tìm thấy yêu cầu gia hạn (có thể đã bị hủy).' : null);

// Giờ Việt Nam bất kể múi giờ máy người dùng.
export const fmtVN = (v) => (v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—');

// Thêm/cập nhật yêu cầu từ sự kiện; cùng offerId thì ghi đè (đề xuất lại), giữ thứ tự mới nhất trước. Không đổi mảng gốc.
export function addExtension(list, p) {
  if (!p?.offerId) return list;
  return [{ offerId: p.offerId, groupId: p.groupId, proposedLeaveAt: p.proposedLeaveAt, at: p.at, result: null }, ...list.filter((x) => x.offerId !== p.offerId)];
}
export const setExtensionResult = (list, offerId, result) => list.map((x) => (x.offerId === offerId ? { ...x, result } : x));

// Lý do từ chối gia hạn tùy chọn, tối đa 300 ký tự: trả { ok, reason? }.
export function checkExtReason(v) {
  const t = String(v || '').trim();
  return t.length > 300 ? { ok: false, error: 'Lý do tối đa 300 ký tự.' } : { ok: true, reason: t || undefined };
}
