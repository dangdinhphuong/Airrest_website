// Điểm duy nhất đọc cấu hình backend: VITE_API_BASE_URL (apps/web/.env). Không có giá trị mặc định trong mã.
import { createClient, describeError } from '@airrest/api-client';

function parseBase(u) {
  try {
    const x = new URL(String(u || '').trim());
    return /^https?:$/.test(x.protocol) ? `${x.origin}${x.pathname}`.replace(/\/+$/, '') : null;
  } catch { return null; }
}

export const apiBase = parseBase(import.meta.env.VITE_API_BASE_URL);

// Hai phiên không bao giờ cùng tồn tại: `token` = nhân sự (chỉ trong bộ nhớ); `guestToken` = khách (sessionStorage, tải lại trang vẫn còn).
const GUEST_KEY = 'airrest.guest.token';
const store = (fn) => { try { return fn(window.sessionStorage); } catch { return null; } }; // sessionStorage có thể bị chặn
let token = null;
let guestToken = store((s) => s.getItem(GUEST_KEY));
let onUnauthorized = null;
export const setGuestToken = (t) => { guestToken = t || null; store((s) => (t ? s.setItem(GUEST_KEY, t) : s.removeItem(GUEST_KEY))); };
export const getGuestToken = () => guestToken;
// Đặt token nhân sự (null = xóa). Có token nhân sự thì bỏ phiên khách để không gửi nhầm.
export const setAuthToken = (t) => { token = t; if (t) setGuestToken(null); };
// true khi đang là khách (không có phiên nhân sự): dùng cho lời gọi công khai nhưng muốn gắn tài khoản khách (đặt phòng).
export const asGuest = () => !token && !!guestToken;
export const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

// null khi cấu hình sai: main.jsx hiện màn lỗi cấu hình thay vì render ứng dụng.
export const api = apiBase ? createClient({ baseUrl: apiBase, getToken: () => token ?? guestToken, onUnauthorized: () => onUnauthorized?.() }) : null;
export { describeError };
