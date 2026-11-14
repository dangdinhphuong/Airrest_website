// Gọi API cổng đơn vị chi trả (/v1/payer/*). Quyền kiểm ở máy chủ; giao diện chỉ ẩn/hiện nút.
import { newIdempotencyKey } from '@airrest/api-client';
import { api } from '../lib/api';

export const listPayerFlights = (cursor) => api.get('/v1/payer/flights', { query: { cursor } });
export const getPayerFlightPassengers = (id) => api.get(`/v1/payer/flights/${encodeURIComponent(id)}/passengers`);
export const simulateDelay = (delayUntil, idempotencyKey = newIdempotencyKey()) => api.post('/v1/payer/simulate-delay', { delayUntil }, { idempotencyKey });

// Đặt phòng theo lô. Idempotency-Key mới cho mỗi lần xác nhận (bấm đúp không tạo hai lô).
export const previewBatch = (flightId, passengerIds) => api.post(`/v1/payer/flights/${encodeURIComponent(flightId)}/batches/preview`, { passengerIds });
export const getPickupPoints = (airport) => api.get('/v1/payer/pickup-points', { query: { airport } });
export const createBatch = (flightId, passengerIds, pickupPoint, upgrades, idempotencyKey = newIdempotencyKey()) => api.post(`/v1/payer/flights/${encodeURIComponent(flightId)}/batches`, { passengerIds, ...(pickupPoint && { pickupPoint }), ...(upgrades?.length && { upgrades }) }, { idempotencyKey });
export const getBatch = (id) => api.get(`/v1/payer/batches/${encodeURIComponent(id)}`);
export const patchPassenger = (id, body) => api.patch(`/v1/payer/passengers/${encodeURIComponent(id)}`, body);
export const resendPaxEmail = (id, idempotencyKey = newIdempotencyKey()) => api.post(`/v1/payer/passengers/${encodeURIComponent(id)}/resend-email`, undefined, { idempotencyKey });
// Gửi yêu cầu gia hạn cho khách sạn (mọi phòng đang chờ, hoặc đúng offerIds). 409 NO_EXTENSION_PROPOSED nếu không có đề xuất nào.
export const requestExtensions = (batchId, offerIds) => api.post(`/v1/payer/batches/${encodeURIComponent(batchId)}/extensions/request`, offerIds?.length ? { offerIds } : {});
