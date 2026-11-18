import { bookingEvents, type BookingChange } from '../../services/events';
import { notify, type NotificationType } from '../../services/notifications';
import { emitToRoom, rooms } from './socket';

// Loại thông báo (có thể nhiều) cho một thay đổi đơn. Đơn PENDING_PAYMENT chưa báo: báo khi khách thanh toán.
const typesOf = (c: BookingChange): NotificationType[] => [
  ...(c.kind === 'PAID' ? ['BOOKING_PAID' as const] : []),
  ...(c.status === 'PENDING' ? ['BOOKING_PENDING' as const] : []),
  ...(c.isNew && c.status === 'CONFIRMED' ? ['BOOKING_NEW' as const] : []),
  ...(c.status === 'CANCELLED' ? ['BOOKING_CANCELLED' as const] : []),
  ...(c.status === 'NO_SHOW' ? ['BOOKING_NO_SHOW' as const] : []),
];
const TITLE: Record<string, string> = { BOOKING_PAID: 'Khách đã thanh toán đơn', BOOKING_PENDING: 'Đơn chờ bạn duyệt', BOOKING_NEW: 'Có đơn mới', BOOKING_CANCELLED: 'Đơn đã bị hủy', BOOKING_NO_SHOW: 'Khách không đến' };

// Sự kiện đơn (do service phát sau khi commit) -> Socket.io. Thay Change Stream của Mongo.
// Payload tối thiểu: không kèm tên/SĐT khách.
export function startBookingsStream(): () => Promise<void> {
  const onChange = (c: BookingChange) => {
    const payload = { code: c.code, status: c.status, updatedAt: c.updatedAt };
    emitToRoom(rooms.booking(c.code), 'booking:updated', payload);
    emitToRoom(rooms.hotelOrders(c.hotelId), c.isNew ? 'order:new' : 'order:updated', payload);
    for (const t of typesOf(c)) void notify(c.hotelId, t, { title: `${TITLE[t]} ${c.code}`, refCode: c.code, dedupeKey: `${t}:${c.code}` });
  };
  bookingEvents.on('change', onChange);
  return async () => void bookingEvents.off('change', onChange);
}
