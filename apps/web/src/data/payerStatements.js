// Bảng kê tháng của đơn vị chi trả (/v1/payer/statements). Quyền kiểm ở máy chủ; đơn vị khác hoặc bản nháp -> 404.
import { newIdempotencyKey } from '@airrest/api-client';
import { api, apiBase, getAuthToken } from '../lib/api';

const P = '/v1/payer/statements';
export const listStatements = (after) => api.get(P, { query: { after } });
export const getStatement = (id) => api.get(`${P}/${encodeURIComponent(id)}`);
export const disputeStatement = (id, reason, idempotencyKey = newIdempotencyKey()) => api.post(`${P}/${encodeURIComponent(id)}/dispute`, { reason }, { idempotencyKey });

// Tải CSV có token trong header (không mở link trần), trả { blob, filename }.
export async function fetchStatementCsv(id) {
  const res = await fetch(`${apiBase}${P}/${encodeURIComponent(id)}/csv`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!res.ok) {
    let e = null;
    try { e = (await res.json())?.error; } catch { /* không phải JSON */ }
    throw Object.assign(new Error(e?.message || `Lỗi máy chủ (${res.status})`), { status: res.status, code: e?.code });
  }
  const m = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
  return { blob: await res.blob(), filename: m?.[1] || 'bang-ke.csv' };
}
