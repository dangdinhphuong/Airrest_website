import type { Actor, BookingStatus, PaymentStatus, RefundStatus, ReservationState } from '@airrest/shared-types';

// Hình dạng hàng đọc từ Postgres sau khi qua mapRow (camelCase, cột null bị bỏ). Schema: database/migrations/.
// Kiểu trạng thái dùng chung với FE nằm ở @airrest/shared-types; re-export để import cũ vẫn chạy.
export type { Actor, BookingStatus, PaymentStatus, RefundStatus, ReservationState };

// Tiền VND = bigint trong DB, đọc ra là number (xem database/pg.ts).
export type Money = number;

export interface AccountDoc {
  id: string;
  seq: number;
  type: 'HOTEL' | 'DRIVER' | 'ADMIN';
  email: string;
  passwordHash: string;
  fullName: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED';
  hotelId?: string;
  roleIds: string[];
  isOwner?: boolean;
  adminRole?: 'OPS' | 'SUPPORT' | 'FINANCE' | 'SYSADMIN';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDoc {
  id: string;
  key: string;
  name: string;
  scope: 'SYSTEM' | 'HOTEL';
  hotelId?: string;
  permissions: string[];
  system: boolean;
}

// Tài khoản nhận tiền của khách sạn. Chi tiết (số TK...) luôn mã hóa, không bao giờ trả ra API; chỉ trả labelMasked.
export interface PayoutAccountData {
  type: 'MOMO' | 'BANK';
  labelMasked: string;
  detailsEnc: string;
}
export interface PayoutAccount extends Partial<PayoutAccountData> {
  verifiedAt?: Date | string;
  changedAt?: Date | string;
  pendingChange?: PayoutAccountData & { requestedBy: string; requestedAt: Date | string };
}

export interface HotelDoc {
  id: string;
  seq: number;
  code: string;
  name: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'HIDDEN_DEBT';
  location: { type: 'Point'; coordinates: [number, number] };
  airports: Array<{ iata: string; km: number; minutes: number }>;
  amenities: string[];
  policy: { cancellationTemplate: 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE'; cleaningBufferMin: number; noShowGraceMin?: number };
  approval: { manual: boolean; manualUntil?: Date | string };
  rating: { avg: number; count: number };
  slug?: string;
  ownerAccountId?: string;
  description?: string;
  address?: { line: string; ward?: string; district?: string; city: string; country: string };
  contact?: { phone: string; email?: string };
  payoutAccount?: PayoutAccount;
  incidentScore: number;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface RoomTypeDoc {
  id: string;
  hotelId: string;
  name: string;
  totalRooms: number;
  pricing: { baseNightVnd: Money };
  active: boolean;
}

export interface RoomReservationDoc {
  id: string;
  hotelId: string;
  roomTypeId: string;
  kind: 'BOOKING' | 'BLOCK';
  bookingId?: string;
  qty: number;
  startsAt: Date;
  endsAt: Date;
  state: ReservationState;
  holdExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingDoc {
  id: string;
  seq: number;
  code: string;
  status: BookingStatus;
  hotelId: string;
  guest: { fullName: string; phone: string; email?: string };
  hotelSnapshot: { name: string };
  stay: { type: 'NIGHT' | 'HOURLY'; from: Date; to: Date; nights: number };
  lines: Array<{
    lineNo: number;
    roomTypeId: string;
    roomTypeName: string;
    qty: number;
    unitPriceVnd: Money;
    subtotalVnd: Money;
    reservationId: string;
  }>;
  pricing: { roomVnd: Money; shuttleVnd: Money; serviceFeeVnd: Money; discountVnd: Money; totalVnd: Money; params?: { configVersions: Record<string, number> } };
  // Dựng từ các cột payment_method/payment_status/paid_vnd/refunded_vnd (xem bookingFromRow).
  payment: { method: 'VNPAY' | 'AT_HOTEL'; status: string; paidVnd: Money; refundedVnd: Money };
  shuttle: { tripType: 'NONE' | 'ONE_WAY' | 'ROUND_TRIP'; legCount: number };
  expiresAt?: Date;
  checkedInAt?: Date;
  statusHistory: Array<{ from?: BookingStatus; to: BookingStatus; at: Date | string; by: Actor; reasonCode?: string }>;
  changeCount: number;
  flags: { disputeOpen: boolean; payoutHeld: boolean; needsCall: boolean };
  v: number;
  createdAt: Date;
  updatedAt: Date;
}

// Hàng bookings thô -> BookingDoc: gom 4 cột thanh toán thành `payment`, bỏ cột phụ trợ stayFrom.
export function bookingFromRow(r: Record<string, any>): BookingDoc {
  const { paymentMethod, paymentStatus, paidVnd, refundedVnd, stayFrom: _stayFrom, ...rest } = r;
  return { ...rest, payment: { method: paymentMethod, status: paymentStatus, paidVnd, refundedVnd } } as BookingDoc;
}

export interface AuditLogDoc {
  id: number;
  ts: Date;
  requestId?: string;
  actor: Actor;
  action: string;
  entity: { type: string; id: string };
  hotelId?: string;
  bookingId?: string;
  before?: unknown;
  after?: unknown;
  reasonCode?: string;
  reasonNote?: string;
}

export interface SystemConfigDoc {
  id: string;
  key: string;
  version: number;
  value: unknown;
  effectiveFrom: Date;
  changedBy: Actor;
  reason?: string;
  createdAt: Date;
}

export interface PaymentDoc {
  id: string;
  seq: number;
  bookingId: string;
  hotelId: string;
  method: 'VNPAY';
  amountVnd: Money;
  status: PaymentStatus;
  gateway: {
    tmnCode: string;
    orderId: string; // = vnp_TxnRef, unique (cột txn_ref)
    requestId: string;
    createDate: string; // vnp_CreateDate (yyyyMMddHHmmss GMT+7), cần cho querydr/refund
    transId?: number; // vnp_TransactionNo
    payUrl?: string;
    resultCode?: number;
    message?: string;
  };
  callbacks: Array<{ at: Date | string; resultCode: number; signatureOk: boolean }>;
  anomaly?: { kind: 'AMOUNT_MISMATCH' | 'LATE_SUCCESS' | 'DUPLICATE'; at: Date | string };
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefundDoc {
  id: string;
  seq: number;
  bookingId: string;
  hotelId: string;
  paymentId: string;
  key: string; // unique: chống hoàn kép (BR-CXL-12)
  amountVnd: Money;
  reasonCode: 'LATE_PAYMENT' | 'DUPLICATE_PAYMENT';
  method: 'VNPAY';
  status: RefundStatus;
  attempts: Array<{ at: Date | string; ok: boolean; code?: number; message?: string }>;
  gateway: { orderId: string; requestId: string; refundTransId?: number; resultCode?: number };
  dueAt: Date; // lần thử kế tiếp (≤ 24h kể từ lúc tạo, BR-CXL-13)
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Sổ cái chỉ thêm, không sửa/xóa (R2). Số tiền có dấu: + tăng, − giảm.
export type LedgerAccount = 'CUSTOMER_PAID' | 'HOTEL_PAYABLE' | 'AIRREST_REVENUE' | 'CUSTOMER_REFUNDABLE';
export interface LedgerEntryDoc {
  id: string;
  ts: Date;
  bookingId: string;
  hotelId: string;
  refType: 'PAYMENT' | 'REFUND';
  refId: string;
  account: LedgerAccount;
  amountVnd: Money;
  memo?: string;
}
