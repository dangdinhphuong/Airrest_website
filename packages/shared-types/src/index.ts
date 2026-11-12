// Kiểu dùng chung FE/BE. Không import mongodb/zod ở đây để FE dùng được.
export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'NO_SHOW';

export type ReservationState = 'HOLD' | 'CONFIRMED' | 'CHECKED_IN' | 'RELEASED' | 'COMPLETED';
export type PaymentMethod = 'VNPAY' | 'AT_HOTEL';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type RefundStatus = 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'MANUAL_REQUIRED';

export type ActorType = 'GUEST' | 'USER' | 'HOTEL' | 'ADMIN' | 'DRIVER' | 'PASSENGER' | 'SYSTEM';
export interface Actor {
  type: ActorType;
  id?: string;
}

export type ChangeRequestType = 'CANCEL' | 'CHANGE';
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type ShuttleStatus = 'REQUESTED' | 'ASSIGNED' | 'DONE' | 'CANCELLED';
export * from './flights';
