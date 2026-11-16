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

// ---- Yêu cầu gia hạn lưu trú (GET /delay-offers?include=extension; sự kiện 'delay:extension' chỉ kích hoạt làm mới) ----
const EXT_ERR = {
  EXTENSION_NO_ROOM: 'Khách sạn đã hết phòng trong khung gia hạn nên không thể đồng ý. Hệ thống đã ghi nhận và báo quầy.',
  INVALID_STATE: 'Yêu cầu gia hạn này đã được xử lý hoặc không còn chờ phản hồi.',
};
export const extensionErr = (e) => EXT_ERR[e?.code] || (e?.status === 404 ? 'Không tìm thấy yêu cầu gia hạn (có thể đã bị hủy).' : null);

// Giờ Việt Nam bất kể múi giờ máy người dùng.
export const fmtVN = (v) => (v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—');

// Yêu cầu gia hạn đọc từ GET /delay-offers?include=extension: chỉ offer extensionStatus='REQUESTED'; ACCEPTED/REJECTED biến mất ở lần làm mới sau.
export const extensionsOf = (items) => (items || []).filter((o) => o.extensionStatus === 'REQUESTED' && o.proposedLeaveAt).map((o) => ({ offerId: o.id, groupId: o.groupId, proposedLeaveAt: o.proposedLeaveAt, at: o.extensionRequestedAt }));
// Danh sách offer chờ xác nhận (không kèm offer CONFIRMED đang xin gia hạn).
export const pendingOffersOf = (items) => (items || []).filter((o) => o.status === 'PENDING');

// Lý do từ chối gia hạn tùy chọn, tối đa 300 ký tự: trả { ok, reason? }.
export function checkExtReason(v) {
  const t = String(v || '').trim();
  return t.length > 300 ? { ok: false, error: 'Lý do tối đa 300 ký tự.' } : { ok: true, reason: t || undefined };
}
