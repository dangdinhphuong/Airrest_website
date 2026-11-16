// Gọi API quản trị đơn vị chi trả, bảng kê và chi trả khách sạn. Quyền kiểm ở máy chủ; POST cần Idempotency-Key (mỗi lần bấm một khóa mới).
import { newIdempotencyKey } from '@airrest/api-client';
import { api, apiBase, getAuthToken } from '../lib/api';
import { adminApi } from './admin';

const A = '/v1/admin';
const e = encodeURIComponent;
const post = (path, body) => api.post(`${A}${path}`, body, { idempotencyKey: newIdempotencyKey() });
// Đơn vị chi trả (ghi PATCH/POST trạm không cần khóa; tạo đơn vị và nhân viên có)
export const createPayer = (body) => post('/payers', body);
export const patchPayer = (id, body) => adminApi.patch(`/payers/${e(id)}`, body);
export const createStation = (id, body) => adminApi.post(`/payers/${e(id)}/stations`, body);
export const patchStation = (id, sid, body) => adminApi.patch(`/payers/${e(id)}/stations/${e(sid)}`, body);
export const createStaff = (id, body) => post(`/payers/${e(id)}/staff`, body);
export const patchStaff = (id, sid, body) => adminApi.patch(`/payers/${e(id)}/staff/${e(sid)}`, body);
// Bảng kê payer
export const generateStatement = (payerId, period) => post('/payer-statements/generate', { payerId, period });
export const sendStatement = (id) => post(`/payer-statements/${e(id)}/send`, {});
export const lockStatement = (id) => post(`/payer-statements/${e(id)}/lock`, {});
export const reopenStatement = (id, reason) => post(`/payer-statements/${e(id)}/reopen`, { reason });
export const adjustStatement = (body) => post('/payer-statements/adjustments', body);
// Chi trả khách sạn
export const generatePayouts = (period) => post('/hotel-payouts/generate', { period });
export const lockPayout = (id) => post(`/hotel-payouts/${e(id)}/lock`, {});
export const markPayoutPaid = (id, paymentRef) => post(`/hotel-payouts/${e(id)}/paid`, { paymentRef });
export const adjustPayout = (body) => post('/hotel-payouts/adjustments', body);

// Tải CSV bảng kê có token trong header, trả { blob, filename }.
export async function fetchAdminStatementCsv(id) {
  const res = await fetch(`${apiBase}${A}/payer-statements/${e(id)}/csv`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!res.ok) {
    let er = null;
    try { er = (await res.json())?.error; } catch { /* không phải JSON */ }
    throw Object.assign(new Error(er?.message || `Lỗi máy chủ (${res.status})`), { status: res.status, code: er?.code });
  }
  const m = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
  return { blob: await res.blob(), filename: m?.[1] || 'bang-ke.csv' };
}
