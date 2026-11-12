// Điểm duy nhất đọc cấu hình backend: VITE_API_BASE_URL (apps/web/.env). Không có giá trị mặc định trong mã.
import { createClient, describeError } from '@airrest/api-client';

function parseBase(u) {
  try {
    const x = new URL(String(u || '').trim());
    return /^https?:$/.test(x.protocol) ? `${x.origin}${x.pathname}`.replace(/\/+$/, '') : null;
  } catch { return null; }
}

export const apiBase = parseBase(import.meta.env.VITE_API_BASE_URL);

let token = null;
let onUnauthorized = null;
export const setAuthToken = (t) => { token = t; };
export const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

// null khi cấu hình sai: main.jsx hiện màn lỗi cấu hình thay vì render ứng dụng.
export const api = apiBase ? createClient({ baseUrl: apiBase, getToken: () => token, onUnauthorized: () => onUnauthorized?.() }) : null;
export { describeError };
