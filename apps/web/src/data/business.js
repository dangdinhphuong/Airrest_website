// Doanh nghiệp (chủ nhiều khách sạn): đăng ký công khai, khách sạn của tôi, chuyển khách sạn, báo cáo doanh thu.
import { api, apiBase, getAuthToken, setAuthToken } from '../lib/api';

export const PASSWORD_MIN = 12;
export const BUSINESS_PENDING_MSG = 'Hồ sơ đã được tiếp nhận, chờ quản trị viên duyệt. Bạn sẽ đăng nhập được sau khi hồ sơ được duyệt.';
// Mã lỗi đăng nhập của chủ doanh nghiệp chưa dùng được (HTTP 403).
export const BUSINESS_LOGIN_MSG = {
  BUSINESS_PENDING_APPROVAL: 'Hồ sơ doanh nghiệp của bạn đang chờ quản trị viên duyệt. Bạn đăng nhập được sau khi hồ sơ được duyệt.',
  BUSINESS_REJECTED: 'Hồ sơ doanh nghiệp của bạn đã bị từ chối. Vui lòng liên hệ Airrest để biết thêm chi tiết.',
  BUSINESS_SUSPENDED: 'Doanh nghiệp của bạn đang bị tạm ngưng. Vui lòng liên hệ Airrest để được kích hoạt lại.',
};

// Luật kiểm tra khớp backend (services/business/business.service.ts registerBody); máy chủ vẫn kiểm lại.
export function validateBusinessRegister(f) {
  const e = {};
  const t = (v) => String(v ?? '').trim();
  if (t(f.name).length < 2) e.name = 'Nhập tên doanh nghiệp (tối thiểu 2 ký tự).';
  else if (t(f.name).length > 200) e.name = 'Tên doanh nghiệp tối đa 200 ký tự.';
  if (t(f.taxCode).length < 5 || t(f.taxCode).length > 30 || !/^[0-9A-Za-z./-]+$/.test(t(f.taxCode))) e.taxCode = 'Mã số thuế/giấy phép 5–30 ký tự, chỉ gồm chữ, số, . / -';
  if (t(f.representative).length < 2) e.representative = 'Nhập họ tên người đại diện.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t(f.email))) e.email = 'Email không hợp lệ.';
  if (!/^\+?[0-9][0-9\s.-]{7,18}$/.test(t(f.phone))) e.phone = 'Số điện thoại không hợp lệ (8–19 ký tự số).';
  if (!f.password) e.password = 'Nhập mật khẩu.';
  else if (f.password.length < PASSWORD_MIN) e.password = `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`;
  else if (f.password.length > 128) e.password = 'Mật khẩu tối đa 128 ký tự.';
  if (!e.password) { if (!f.confirm) e.confirm = 'Nhập lại mật khẩu.'; else if (f.password !== f.confirm) e.confirm = 'Mật khẩu nhập lại không khớp.'; }
  return e;
}

// `website` là ô honeypot: luôn gửi rỗng (người thật không thấy ô này).
export const registerBusiness = (f) => api.post('/v1/auth/business/register', {
  name: f.name.trim(), taxCode: f.taxCode.trim(), representative: f.representative.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, website: f.website ?? '',
}, { auth: false });

// Đổi khách sạn đang làm việc: máy chủ cấp token mới (mang hotelId), thay token trong sessionStorage. Trả { hotel, hotels }.
export async function switchWorkingHotel(hotelId) {
  const r = await api.post('/v1/auth/switch-hotel', { hotelId });
  setAuthToken(r.token);
  return r;
}
export const listMyHotels = () => api.get('/v1/hotel/hotels');
export const createMyHotel = (body) => api.post('/v1/hotel/hotels', body);
export const pauseHotel = (id, reason) => api.post(`/v1/hotel/hotels/${id}/pause`, { reason });
export const resumeHotel = (id) => api.post(`/v1/hotel/hotels/${id}/resume`);
export const pauseChain = (reason) => api.post('/v1/hotel/hotels/chain/pause', { reason });
export const resumeChain = () => api.post('/v1/hotel/hotels/chain/resume');
export const submitMyHotel = (id) => api.post(`/v1/hotel/hotels/${id}/submit`);
export const getHotelRevenue = (q) => api.get('/v1/hotel/reports/revenue', { query: q });
export const getBusinessRevenue = (q) => api.get('/v1/hotel/reports/revenue/summary', { query: q });

// Tải CSV có token trong header (không mở link trần), trả { blob, filename }. path: 'revenue' | 'revenue/summary'.
export async function fetchReportCsv(path, query) {
  const qs = new URLSearchParams({ ...query, format: 'csv' }).toString();
  const res = await fetch(`${apiBase}/v1/hotel/reports/${path}?${qs}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  if (!res.ok) {
    let e = null;
    try { e = (await res.json())?.error; } catch { /* không phải JSON */ }
    throw Object.assign(new Error(e?.message || `Lỗi máy chủ (${res.status})`), { status: res.status, code: e?.code });
  }
  const m = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '');
  return { blob: await res.blob(), filename: m?.[1] || 'doanh-thu.csv' };
}
export function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
