// Gọi API cổng quản trị (/v1/admin/*). Quyền kiểm ở máy chủ; giao diện chỉ ẩn/hiện nút.
import { api } from '../lib/api';

const A = '/v1/admin';
export const adminApi = {
  list: (path, query) => api.get(`${A}${path}`, { query }),
  get: (path, query) => api.get(`${A}${path}`, { query }),
  post: (path, body) => api.post(`${A}${path}`, body),
  put: (path, body) => api.put(`${A}${path}`, body),
  patch: (path, body) => api.patch(`${A}${path}`, body),
};

// Hotels
export const hotelAction = (id, action, reason) => adminApi.post(`/hotels/${id}/${action}`, reason !== undefined ? { reason } : {});
export const createHotel = (body) => adminApi.post('/hotels', body);
export const patchHotel = (id, body) => adminApi.patch(`/hotels/${id}`, body);
export const proposePayout = (id, body) => adminApi.put(`/hotels/${id}/payout-account`, body);
export const payoutDecision = (id, approve, reason) => adminApi.post(`/hotels/${id}/payout-account/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason });
// Support
export const patchTicket = (id, body) => adminApi.patch(`/support/${id}`, body);
export const sendTicketMessage = (id, message, internal) => adminApi.post(`/support/${id}/messages`, { message, internal });
// Accounts
export const createAccount = (body) => adminApi.post('/accounts', body);
export const patchAccount = (id, body) => adminApi.patch(`/accounts/${id}`, body);
export const resetPassword = (id, password) => adminApi.post(`/accounts/${id}/reset-password`, { password });
// Configs
export const putConfig = (key, body) => adminApi.put(`/configs/${encodeURIComponent(key)}`, body);
// Flights
export const patchFlight = (id, body) => adminApi.patch(`/flights/${id}`, body);
// Payments
export const reconcile = () => adminApi.post('/payments/reconcile', {});
export const retryRefund = (id) => adminApi.post(`/refunds/${id}/retry`, {});
