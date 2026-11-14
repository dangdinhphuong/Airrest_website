import { EventEmitter } from 'node:events';
import { afterCommit } from '../../database/pg';
import { logger } from '../../lib/logger';

export type EventAudience = 'GUEST' | 'HOTEL' | 'DRIVER';

/**
 * Sự kiện chuyến xe. `payload` đã làm sạch: CHỈ chứa id và trạng thái (không SĐT, tên, liên kết...), an toàn cho mọi `audience`;
 * ai nhận thì tự gọi API để lấy chi tiết theo quyền của mình. Socket.IO gắn qua `shuttleBus`.
 * `driverAccountId` có khi sự kiện nhắm tới đúng một tài xế (phòng theo tài xế).
 */
export interface ShuttleEvent {
  type: string; // TRIP_OFFERED | TRIP_ACCEPTED | TRIP_REJECTED | TRIP_EN_ROUTE | TRIP_ARRIVED | TRIP_ONBOARD | TRIP_DROPPED_OFF | TRIP_CANCELLED | TRIP_REASSIGNED | TRIP_ROUTE_READY | EXTERNAL_NEEDED | EXTERNAL_LINK_SET | SHUTTLE_CANCELLED | BOOKING_STATUS
  hotelId: string;
  bookingId: string;
  tripId?: string;
  requestId?: string;
  audience: EventAudience[];
  driverAccountId?: string;
  payload: Record<string, unknown>;
}

/** Bus nội bộ: realtime/shuttleFeed.ts (Socket.IO) và simulation.ts (đẩy vị trí) nghe 'event'. */
export const shuttleBus = new EventEmitter();

/**
 * Phát sự kiện. Gọi trong một transaction (vd. cascade hủy đơn trong transaction của caller) thì tự hoãn tới SAU commit
 * (rollback = bỏ) nhờ `afterCommit`; ngoài transaction thì phát ngay.
 */
export function publish(evt: ShuttleEvent): void {
  logger.debug({ evt }, 'shuttle event');
  afterCommit(() => shuttleBus.emit('event', evt));
}
export const publishAll = (events: ShuttleEvent[]): void => events.forEach(publish);

/** Đơn đổi trạng thái -> khách (phòng `booking:<code>`) và khách sạn biết ngay, khỏi chờ polling. Gọi TRONG transaction đổi trạng thái (hoãn tới sau commit). */
export const publishBookingStatus = (b: { id: string; hotelId: string }, status: string): void =>
  publish({ type: 'BOOKING_STATUS', hotelId: b.hotelId, bookingId: b.id, audience: ['GUEST', 'HOTEL'], payload: { status } });
