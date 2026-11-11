import { bookingEvents, type BookingChange } from '../../services/events';
import { emitToRoom, rooms } from './socket';

// Sự kiện đơn (do service phát sau khi commit) -> Socket.io. Thay Change Stream của Mongo.
// Payload tối thiểu: không kèm tên/SĐT khách.
export function startBookingsStream(): () => Promise<void> {
  const onChange = (c: BookingChange) => {
    const payload = { code: c.code, status: c.status, updatedAt: c.updatedAt };
    emitToRoom(rooms.booking(c.code), 'booking:updated', payload);
    emitToRoom(rooms.hotelOrders(c.hotelId), c.isNew ? 'order:new' : 'order:updated', payload);
  };
  bookingEvents.on('change', onChange);
  return async () => void bookingEvents.off('change', onChange);
}
