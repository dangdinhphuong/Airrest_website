import type { Long, ObjectId } from 'mongodb';

// Tập con các trường dùng trong ví dụ; đầy đủ xem docs/mongodb/THIET_KE_MONGODB_AIRREST.md.
// Tiền ghi bằng Long (xem lib/money.ts), đọc ra là number.
export type Money = number | Long;

export interface AccountDoc {
  _id: ObjectId;
  type: 'HOTEL' | 'DRIVER' | 'ADMIN';
  email: string;
  passwordHash: string;
  fullName: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED';
  hotelId?: ObjectId;
  roleIds: ObjectId[];
  isOwner?: boolean;
  adminRole?: 'OPS' | 'SUPPORT' | 'FINANCE' | 'SYSADMIN';
  createdBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDoc {
  _id: ObjectId;
  key: string;
  name: string;
  scope: 'SYSTEM' | 'HOTEL';
  hotelId?: ObjectId;
  permissions: string[];
  system: boolean;
}

export interface HotelDoc {
  _id: ObjectId;
  code: string;
  name: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'HIDDEN_DEBT';
  location: { type: 'Point'; coordinates: [number, number] };
  airports: Array<{ iata: string; km: number; minutes: number }>;
  amenities: string[];
  policy: { cancellationTemplate: 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE'; cleaningBufferMin: number };
  approval: { manual: boolean; manualUntil?: Date };
  rating: { avg: number; count: number };
  slug?: string;
  ownerAccountId?: ObjectId;
  description?: string;
  address?: { line: string; ward?: string; district?: string; city: string; country: string };
  contact?: { phone: string; email?: string };
  payoutAccount?: PayoutAccount;
  incidentScore?: number;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: ObjectId;
}

// Tài khoản nhận tiền của khách sạn. Chi tiết (số TK...) luôn mã hóa, không bao giờ trả ra API; chỉ trả labelMasked.
export interface PayoutAccountData {
  type: 'MOMO' | 'BANK';
  labelMasked: string;
  detailsEnc: string;
}
export interface PayoutAccount extends Partial<PayoutAccountData> {
  verifiedAt?: Date;
  changedAt?: Date;
  pendingChange?: PayoutAccountData & { requestedBy: ObjectId; requestedAt: Date };
}

export interface RoomTypeDoc {
  _id: ObjectId;
  hotelId: ObjectId;
  name: string;
  totalRooms: number;
  pricing: { baseNightVnd: Money };
  active: boolean;
}

export type ReservationState = 'HOLD' | 'CONFIRMED' | 'CHECKED_IN' | 'RELEASED' | 'COMPLETED';

export interface RoomReservationDoc {
  _id: ObjectId;
  hotelId: ObjectId;
  roomTypeId: ObjectId;
  kind: 'BOOKING' | 'BLOCK';
  bookingId?: ObjectId;
  qty: number;
  from: Date;
  to: Date;
  state: ReservationState;
  holdExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryLockDoc {
  _id: ObjectId; // = roomTypeId
  seq: number;
}

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

export interface Actor {
  type: 'GUEST' | 'USER' | 'HOTEL' | 'ADMIN' | 'DRIVER' | 'SYSTEM';
  id?: string;
}

export interface BookingDoc {
  _id: ObjectId;
  code: string;
  status: BookingStatus;
  hotelId: ObjectId;
  guest: { fullName: string; phone: string; email?: string };
  hotelSnapshot: { name: string };
  stay: { type: 'NIGHT' | 'HOURLY'; from: Date; to: Date; nights: number };
  lines: Array<{
    lineNo: number;
    roomTypeId: ObjectId;
    roomTypeName: string;
    qty: number;
    unitPriceVnd: Money;
    subtotalVnd: Money;
    reservationId: ObjectId;
  }>;
  pricing: { roomVnd: Money; shuttleVnd: Money; serviceFeeVnd: Money; discountVnd: Money; totalVnd: Money; params?: { configVersions: Record<string, number> } };
  payment: { method: 'MOMO' | 'AT_HOTEL'; status: string; paidVnd: Money; refundedVnd: Money };
  shuttle: { tripType: 'NONE' | 'ONE_WAY' | 'ROUND_TRIP'; legCount: number };
  expiresAt?: Date;
  checkedInAt?: Date;
  statusHistory: Array<{ from?: BookingStatus; to: BookingStatus; at: Date; by: Actor; reasonCode?: string }>;
  changeCount: number;
  flags: { disputeOpen: boolean; payoutHeld: boolean; needsCall: boolean };
  v: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogDoc {
  _id: ObjectId;
  ts: Date;
  requestId?: string;
  actor: Actor;
  action: string;
  entity: { type: string; id: string };
  hotelId?: ObjectId;
  bookingId?: ObjectId;
  before?: unknown;
  after?: unknown;
  reasonCode?: string;
  reasonNote?: string;
}

export interface IdempotencyDoc {
  _id: ObjectId;
  scope: string;
  key: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'DONE';
  response?: { status: number; body: unknown };
  createdAt: Date;
  expireAt: Date;
}

export interface SystemConfigDoc {
  _id: ObjectId;
  key: string;
  version: number;
  value: unknown;
  effectiveFrom: Date;
  changedBy: Actor;
  reason?: string;
  createdAt: Date;
}
