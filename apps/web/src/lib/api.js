// Điểm duy nhất đọc cấu hình backend: VITE_API_BASE_URL (apps/web/.env). Không có giá trị mặc định trong mã.
import { createClient, describeError } from '@airrest/api-client';

// "/" hoặc "same-origin": gọi API cùng địa chỉ với web (máy chủ web chuyển tiếp /api/v1 và /socket.io sang API, xem vite.config.js): một cổng, một tên miền, không CORS.
// Bỏ trống thì VẪN là lỗi cấu hình (không tự đoán).
export function parseBase(u) {
  const v = String(u || '').trim();
  if (v === '/' || v === 'same-origin') return typeof window === 'undefined' ? null : window.location.origin;
  try {
    const x = new URL(v);
    return /^https?:$/.test(x.protocol) ? `${x.origin}${x.pathname}`.replace(/\/+$/, '') : null;
  } catch { return null; }
}

export const apiBase = parseBase(import.meta.env.VITE_API_BASE_URL);

// Hai phiên không bao giờ cùng tồn tại: `token` = nhân sự; `guestToken` = khách. Cả hai nằm trong sessionStorage (tải lại trang/đi qua trang chủ vẫn còn; đóng tab là mất).
const GUEST_KEY = 'airrest.guest.token';
const STAFF_KEY = 'airrest.staff.token';
const store = (fn) => { try { return fn(window.sessionStorage); } catch { return null; } }; // sessionStorage có thể bị chặn
let token = store((s) => s.getItem(STAFF_KEY));
let guestToken = store((s) => s.getItem(GUEST_KEY));
let onUnauthorized = null;
export const setGuestToken = (t) => { guestToken = t || null; store((s) => (t ? s.setItem(GUEST_KEY, t) : s.removeItem(GUEST_KEY))); };
export const getGuestToken = () => guestToken;
// Đặt token nhân sự (null = xóa). Có token nhân sự thì bỏ phiên khách để không gửi nhầm.
export const setAuthToken = (t) => { token = t || null; store((s) => (t ? s.setItem(STAFF_KEY, t) : s.removeItem(STAFF_KEY))); if (t) setGuestToken(null); };
export const hasStaffToken = () => !!token;
// true khi đang là khách (không có phiên nhân sự): dùng cho lời gọi công khai nhưng muốn gắn tài khoản khách (đặt phòng).
export const asGuest = () => !token && !!guestToken;
export const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

// null khi cấu hình sai: main.jsx hiện màn lỗi cấu hình thay vì render ứng dụng.
export const api = apiBase ? createClient({ baseUrl: apiBase, getToken: () => token ?? guestToken, onUnauthorized: () => onUnauthorized?.() }) : null;
export { describeError };
// Token hiện tại cho lời gọi cần header Authorization mà không qua JSON (tải file CSV). Không lưu ra nơi khác.
export const getAuthToken = () => token ?? guestToken;
