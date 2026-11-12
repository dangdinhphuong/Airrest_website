// Cổng khách sạn: gọi API thật /v1/hotel/*. Hotel id lấy từ token ở máy chủ nên không truyền.
import { api } from '../lib/api';

const H = '/v1/hotel';
const post = (path, body) => api.post(`${H}${path}`, body);

export const getStats = (q) => api.get(`${H}/stats`, { query: q });

export const listBookings = (q) => api.get(`${H}/bookings`, { query: q });
export const getBooking = (id) => api.get(`${H}/bookings/${id}`);
export const confirmBooking = (id) => post(`/bookings/${id}/confirm`);
export const rejectBooking = (id, reason) => post(`/bookings/${id}/reject`, { reason });
export const checkInBooking = (id) => post(`/bookings/${id}/check-in`);
export const checkOutBooking = (id) => post(`/bookings/${id}/check-out`);
export const noShowBooking = (id) => post(`/bookings/${id}/no-show`);

export const getProfile = () => api.get(`${H}/profile`);
export const patchProfile = (body) => api.patch(`${H}/profile`, body);
export const requestUploadUrl = (body) => post('/media/upload-url', body);

export const listRoomTypes = (includeRetired) => api.get(`${H}/room-types`, { query: { includeRetired } });
export const createRoomType = (body) => post('/room-types', body);
export const patchRoomType = (id, body) => api.patch(`${H}/room-types/${id}`, body);
export const retireRoomType = (id) => api.delete(`${H}/room-types/${id}`);
export const getInventory = (id, from, to) => api.get(`${H}/room-types/${id}/inventory`, { query: { from, to } });

export const listBlocks = (q) => api.get(`${H}/room-blocks`, { query: q });
export const createBlock = (body) => post('/room-blocks', body);
export const releaseBlock = (id) => api.delete(`${H}/room-blocks/${id}`);

export const listChanges = (q) => api.get(`${H}/change-requests`, { query: q });
export const approveChange = (id, note) => post(`/change-requests/${id}/approve`, note ? { note } : {});
export const rejectChange = (id, note) => post(`/change-requests/${id}/reject`, { note });

export const listShuttles = (q) => api.get(`${H}/shuttle-requests`, { query: q });
export const assignShuttle = (id, driverName, driverPhone) => post(`/shuttle-requests/${id}/assign`, { driverName, driverPhone });
export const completeShuttle = (id) => post(`/shuttle-requests/${id}/complete`);
export const cancelShuttle = (id, note) => post(`/shuttle-requests/${id}/cancel`, { note });
