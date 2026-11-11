import { EventEmitter } from 'node:events';

// Thay Change Stream của Mongo: service phát sự kiện SAU KHI transaction commit, lớp realtime (api/realtime) lắng nghe.
// shortcut: chỉ trong một tiến trình; chạy nhiều bản API thì dùng Postgres LISTEN/NOTIFY hoặc Supabase Realtime.
export interface BookingChange {
  code: string;
  status: string;
  hotelId: string;
  updatedAt: Date;
  isNew: boolean;
}

export const bookingEvents = new EventEmitter();
export const emitBookingChange = (c: BookingChange): void => void bookingEvents.emit('change', c);
