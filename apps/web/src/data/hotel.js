// Cổng khách sạn: gọi API thật /api/v1/hotel/*. Hotel id lấy từ token ở máy chủ nên không truyền.
import { api } from '../lib/api';

const H = '/api/v1/hotel';
const post = (path, body) => api.post(`${H}${path}`, body);

export const getStats = (q) => api.get(`${H}/stats`, { query: q });

export const listPayouts = (q) => api.get(`${H}/payouts`, { query: q });
export const getPayout = (id) => api.get(`${H}/payouts/${id}`);

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
export const listFloors = () => api.get(`${H}/floors`);
export const createFloor = (body) => post('/floors', body);
export const patchFloor = (id, body) => api.patch(`${H}/floors/${id}`, body);
export const deleteFloor = (id) => api.delete(`${H}/floors/${id}`);
export const listRooms = () => api.get(`${H}/rooms`);
export const createRoom = (body) => post('/rooms', body);
export const createRoomsBulk = (body) => post('/rooms/bulk', body);
export const patchRoom = (id, body) => api.patch(`${H}/rooms/${id}`, body);
export const deleteRoom = (id) => api.delete(`${H}/rooms/${id}`);
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

// Nhật ký đơn (booking:read) và đội xe / điều phối / chuyến tài xế.
export const listBookingEvents = (id, q) => api.get(`${H}/bookings/${id}/events`, { query: q });

export const listVehicles = () => api.get(`${H}/vehicles`);
export const createVehicle = (body) => post('/vehicles', body);
export const patchVehicle = (id, body) => api.patch(`${H}/vehicles/${id}`, body);
export const deleteVehicle = (id) => api.delete(`${H}/vehicles/${id}`);
export const listDrivers = () => api.get(`${H}/drivers`);
export const createDriver = (body) => post('/drivers', body);
export const patchDriver = (id, body) => api.patch(`${H}/drivers/${id}`, body);
export const deleteDriver = (id) => api.delete(`${H}/drivers/${id}`);

export const getBoard = () => api.get(`${H}/shuttle/board`);
const trip = (id, step, body) => post(`/shuttle-trips/${id}/${step}`, body);
export const getTrip = (id) => api.get(`${H}/shuttle-trips/${id}`);
export const setExternal = (id, body) => trip(id, 'external', body);
export const reassignTrip = (id, vehicleId) => trip(id, 'reassign', { vehicleId });
export const cancelTrip = (id, note) => trip(id, 'cancel', { note });
export const staffStep = (id, step) => trip(id, step); // arrived | onboard | dropped-off (chỉ xe ngoài)

export const listDriverTrips = () => api.get('/api/v1/driver/trips');
export const driverNoShow = (id) => api.post(`/api/v1/driver/trips/${id}/no-show`, {});
export const driverStep = (id, step, body) => api.post(`/api/v1/driver/trips/${id}/${step}`, body); // accept | reject | start | arrived | onboard | dropped-off

// Yêu cầu giữ phòng cho khách delay (quyền booking:decide).
export const listDelayOffers = (status = 'PENDING') => api.get(`${H}/delay-offers`, { query: { status, include: 'extension' } });
export const confirmDelayOffer = (id, roomNumbers) => post(`/delay-offers/${encodeURIComponent(id)}/confirm`, { roomNumbers });
export const rejectDelayOffer = (id, reason) => post(`/delay-offers/${encodeURIComponent(id)}/reject`, { reason });

// Yêu cầu gia hạn lưu trú cho khách delay (quyền booking:decide).
export const acceptExtension = (id) => post(`/delay-offers/${encodeURIComponent(id)}/extension/accept`);
export const rejectExtension = (id, reason) => post(`/delay-offers/${encodeURIComponent(id)}/extension/reject`, reason ? { reason } : {});

// Thông báo + cấu hình vai trò × loại (khách sạn lấy từ token).
export const listNotifications = (q) => api.get(`${H}/notifications`, { query: q });
export const markNotificationRead = (id) => post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => post('/notifications/read-all');
export const getNotificationSettings = () => api.get(`${H}/notification-settings`);
export const saveNotificationSettings = (cells) => api.put(`${H}/notification-settings`, { cells });
