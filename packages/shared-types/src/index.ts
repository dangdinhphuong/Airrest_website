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
export type PaymentMethod = 'MOMO' | 'AT_HOTEL';
export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type RefundStatus = 'PENDING' | 'PROCESSING' | 'REFUNDED' | 'MANUAL_REQUIRED';

export type ActorType = 'GUEST' | 'USER' | 'HOTEL' | 'ADMIN' | 'DRIVER' | 'SYSTEM';
export interface Actor {
  type: ActorType;
  id?: string;
}
