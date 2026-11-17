import type { HourlyConfig } from '@airrest/business-logic';
import type { Actor, BedType, BookingStatus, DelayBatchStatus, DelayGroupStatus, DelayOfferStatus, PayerKind, PayerStatus, PaymentMethod, PaymentStatus, PaxCategory, RefundStatus, ReservationState, SharedRoomPolicy } from '@airrest/shared-types';

// Hình dạng hàng đọc từ Postgres sau khi qua mapRow (camelCase, cột null bị bỏ). Schema: database/migrations/.
// Kiểu trạng thái dùng chung với FE nằm ở @airrest/shared-types; re-export để import cũ vẫn chạy.
export type { Actor, BookingStatus, PaymentMethod, PaymentStatus, RefundStatus, ReservationState };

// Tiền VND = bigint trong DB, đọc ra là number (xem database/pg.ts).
export type Money = number;

export interface AccountDoc {
  id: string;
  seq: number;
  type: 'HOTEL' | 'DRIVER' | 'ADMIN' | 'PASSENGER' | 'PAYER';
  email?: string; // null với PASSENGER (đăng nhập bằng username)
  username?: string; // chỉ PASSENGER
  contactEmail?: string; // chỉ PASSENGER (đăng ký mới; tài khoản cũ không có)
  passwordHash: string;
  fullName: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED';
  hotelId?: string;
  businessId?: string; // chỉ tài khoản chủ doanh nghiệp
  phone?: string;
  payerId?: string; // chỉ PAYER
  payerStationId?: string; // chỉ PAYER; null = cấp đơn vị
  roleIds: string[];
  preferences?: Record<string, unknown>; // chỉ PASSENGER: { airport?, adults?, children?, rooms?, paymentMethod? }
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
  description?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
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
  policy: { cancellationTemplate: 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE'; cleaningBufferMin: number; noShowGraceMin?: number; receptionCloseHour?: number; checkInTime?: string; checkOutTime?: string; childPolicy?: string; petsAllowed?: boolean };
  approval: { manual: boolean; manualUntil?: Date | string };
  rating: { avg: number; count: number };
  slug?: string;
  ownerAccountId?: string;
  businessId?: string;
  description?: string;
  address?: { line: string; ward?: string; district?: string; city: string; country: string };
  contact?: { phone: string; email?: string };
  images?: string[]; // khóa object R2
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
  pricing: { baseNightVnd: Money; hourly?: HourlyConfig; nonRefundablePct?: number }; // hourly: cấu hình đặt theo giờ (xem business-logic/hourly.ts)
  active: boolean;
  code?: string;
  capacity: number;
  beds: number;
  areaM2: number;
  retiredAt?: Date;
  bedType: BedType;
  connecting: boolean;
  family: boolean;
  description?: string;
  view?: string;
  amenities: string[];
  smoking: boolean;
  maxAdults?: number;
  maxChildren?: number;
  images: string[]; // khóa R2 có thứ tự, ảnh đầu = ảnh bìa
  createdAt: Date;
  updatedAt: Date;
}

export interface FloorDoc {
  id: string;
  hotelId: string;
  name: string;
  level: number;
  sortOrder: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Phòng riêng lẻ. Tồn kho vẫn đếm theo loại (room_types.total_rooms), đơn không gán vào phòng cụ thể.
export interface RoomDoc {
  id: string;
  hotelId: string;
  floorId: string;
  roomTypeId: string;
  number: string;
  status: 'ACTIVE' | 'INACTIVE';
  note?: string;
  view?: string;
  smoking?: boolean;
  maxAdults?: number;
  maxChildren?: number;
  amenitiesExtra: string[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomBlockDoc {
  id: string;
  seq: number;
  hotelId: string;
  roomTypeId: string;
  kind: 'LOCK' | 'MAINTENANCE';
  qty: number;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  createdBy: Actor;
  releasedAt?: Date;
  releasedBy?: Actor;
  createdAt: Date;
}

// Khách sạn thay thế gợi ý khi từ chối đơn (tối đa 3).
export interface Alternative {
  hotelId: string;
  hotelName: string;
  roomTypeId: string;
  roomTypeName: string;
  baseNightVnd: number;
  airport: string;
  km: number;
}

export interface BookingDecisionDoc {
  bookingId: string;
  decision: 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  reason?: string;
  decidedBy: Actor;
  decidedAt: Date;
  alternatives: Alternative[];
}

export interface ChangeRequestDoc {
  id: string;
  seq: number;
  bookingId: string;
  hotelId: string;
  type: 'CANCEL' | 'CHANGE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reasonCode: string;
  reasonNote?: string;
  newFrom?: Date;
  newTo?: Date;
  quote: Record<string, any>;
  requestedBy: Actor;
  decidedBy?: Actor;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportTicketDoc {
  id: string;
  seq: number;
  code: string;
  bookingId?: string;
  hotelId?: string;
  accountId?: string; // khách đăng nhập lúc gửi; null với khách vãng lai
  contact: { fullName?: string; phone: string; email?: string };
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assigneeId?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportAttachmentDoc {
  id: string;
  seq: number;
  ticketId: string;
  storageKey: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4';
  sizeBytes: number;
  status: 'PENDING' | 'READY';
  createdAt: Date;
}

export interface SupportMessageDoc {
  id: string;
  seq: number;
  ticketId: string;
  author: Actor & { name?: string };
  body: string;
  internal: boolean;
  createdAt: Date;
}

export interface ShuttleRequestDoc {
  id: string;
  seq: number;
  bookingId: string;
  hotelId: string;
  direction: 'TO_HOTEL' | 'TO_AIRPORT';
  airportIata: string;
  distanceKm: number;
  pickupAt: Date;
  location?: string;
  note?: string;
  priceVnd: number;
  configVersion: number;
  passengers: number;
  billed: boolean; // true: giá xe nằm trong tổng đơn (đặt cùng đơn); false: yêu cầu xe tạo sau, không thu riêng
  status: 'REQUESTED' | 'ASSIGNED' | 'DONE' | 'CANCELLED';
  driver?: { name: string; phone: string };
  assignedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlightDoc {
  id: string;
  seq: number;
  code: string;
  airline: string;
  origin: string;
  dest?: string;
  schedDep: Date;
  flightDate: string; // YYYY-MM-DD giờ VN (đọc qua to_char)
  newDep?: Date;
  status: 'ONTIME' | 'DELAYED' | 'CANCELLED';
  cause: 'AIRLINE' | 'FORCE' | 'UNKNOWN';
  cancelledAt?: Date;
  distanceKm?: number;
  simulated: boolean;
  simScenario: 'approve' | 'reject' | 'hotelfull' | 'noreply';
  createdAt: Date;
  updatedAt: Date;
}

export interface FlightChangeDoc {
  id: string;
  seq: number;
  flightId: string;
  fromDep?: Date;
  toDep?: Date;
  statusBefore: string;
  statusAfter: string;
  causeBefore: string;
  causeAfter: string;
  reason: string;
  changedBy: Actor;
  createdAt: Date;
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
  guest: { fullName: string; phone: string; email?: string; count: number; children: number }; // count = TỔNG số người ở (đã gồm trẻ em), children = số trẻ em trong đó; đơn cũ -> bookingFromRow trả 1 và 0
  hotelSnapshot: { name: string };
  stay: { type: 'NIGHT' | 'HOURLY' | 'MIXED'; from: Date; to: Date; nights: number }; // HOURLY = mọi dòng theo giờ (from/to = cửa sổ), MIXED = có cả đêm và giờ
  lines: Array<{
    lineNo: number;
    roomTypeId: string;
    roomTypeName: string;
    qty: number;
    unitPriceVnd: Money;
    subtotalVnd: Money;
    reservationId: string;
    kind: 'NIGHT' | 'HOURLY'; // đơn cũ không lưu -> bookingFromRow trả NIGHT
    ratePlan?: 'STANDARD' | 'NON_REFUNDABLE'; // mức giá đã đặt (chỉ dòng đêm); đơn cũ không lưu = STANDARD
    startsAt?: Date | string; // chỉ HOURLY: giờ vào, giờ ra = endsAt = startsAt + hours
    endsAt?: Date | string;
    hours?: number;
  }>;
  pricing: { roomVnd: Money; shuttleVnd: Money; serviceFeeVnd: Money; discountVnd: Money; totalVnd: Money; params?: { configVersions: Record<string, number> } };
  // Dựng từ các cột payment_method/payment_status/paid_vnd/refunded_vnd (xem bookingFromRow).
  payment: { method: PaymentMethod; status: string; paidVnd: Money; refundedVnd: Money };
  shuttle: { tripType: 'NONE' | 'ONE_WAY' | 'ROUND_TRIP'; legCount: number };
  expiresAt?: Date;
  checkedInAt?: Date;
  statusHistory: Array<{ from?: BookingStatus; to: BookingStatus; at: Date | string; by: Actor; reasonCode?: string }>;
  changeCount: number;
  // cancellationTemplate: chính sách hủy chốt lúc đặt (đổi chính sách khách sạn sau đó không ảnh hưởng đơn cũ); đơn cũ không có -> dùng chính sách hiện tại của khách sạn
  flags: { disputeOpen: boolean; payoutHeld: boolean; needsCall: boolean; cancellationTemplate?: 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE' };
  batchId?: string; // đơn thuộc lô delay (payment.method = PAYER)
  groupId?: string;
  simulated?: boolean; // cột mặc định false; bookingFromRow giữ nguyên, đơn tạo trong service chưa điền
  v: number;
  createdAt: Date;
  updatedAt: Date;
}

// Hàng bookings thô -> BookingDoc: gom 4 cột thanh toán thành `payment`, bỏ cột phụ trợ stayFrom.
export function bookingFromRow(r: Record<string, any>): BookingDoc {
  const { paymentMethod, paymentStatus, paidVnd, refundedVnd, stayFrom: _stayFrom, accountId: _accountId, ...rest } = r;
  if (Array.isArray(rest.lines)) rest.lines = rest.lines.map((l: Record<string, unknown>) => (l.kind ? l : { ...l, kind: 'NIGHT' }));
  if (rest.guest) rest.guest = { ...rest.guest, count: rest.guest.count ?? 1, children: rest.guest.children ?? 0 }; // đơn cũ chưa lưu số người -> 1
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
  method: 'VNPAY' | 'MOMO' | 'SEPAY';
  amountVnd: Money;
  status: PaymentStatus;
  gateway: {
    tmnCode?: string; // chỉ VNPay
    orderId: string; // = vnp_TxnRef / MoMo orderId, unique (cột txn_ref)
    requestId: string;
    createDate?: string; // chỉ VNPay: vnp_CreateDate (yyyyMMddHHmmss GMT+7), cần cho querydr/refund
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
  reasonCode: 'LATE_PAYMENT' | 'DUPLICATE_PAYMENT' | 'HOTEL_REJECTED' | 'HOTEL_NO_RESPONSE' | 'CANCEL_APPROVED' | 'CHANGE_DOWNSIZE' | 'SHUTTLE_CANCELLED';
  method: 'VNPAY' | 'MOMO' | 'SEPAY';
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

export type TripStatus = 'OFFERED' | 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED' | 'ONBOARD' | 'DROPPED_OFF' | 'CANCELLED' | 'REJECTED' | 'NEEDS_EXTERNAL';
export interface ShuttleTripDoc {
  id: string;
  seq: number;
  requestId: string;
  bookingId: string;
  hotelId: string;
  kind: 'OWN' | 'EXTERNAL';
  vehicleId?: string;
  driverAccountId?: string;
  seats: number;
  status: TripStatus;
  offeredAt?: Date;
  acceptedAt?: Date;
  enRouteAt?: Date;
  arrivedAt?: Date;
  onboardAt?: Date;
  droppedOffAt?: Date;
  cancelledAt?: Date;
  rejectedAt?: Date;
  rejectReason?: string;
  cancelNote?: string;
  route?: unknown;
  eta?: Date;
  provider?: 'GRAB' | 'XANHSM' | 'OTHER';
  shareUrl?: string;
  extDriverName?: string;
  extPlate?: string;
  extPhone?: string;
  externalReason?: string;
  extEtaAt?: Date;
  simulated?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// --- Đặt phòng cho khách delay chuyến (migration 017) ---
export interface PayerDoc {
  id: string;
  seq: number;
  code: string;
  name: string;
  kind: PayerKind;
  status: PayerStatus;
  contact?: { name?: string; phone?: string; email?: string };
  sharedRoomPolicy: SharedRoomPolicy;
  allowUpgrade: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayerStationDoc {
  id: string;
  payerId: string;
  airportIata: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayerHotelRateDoc {
  id: string;
  payerId: string;
  hotelId: string;
  roomTypeId: string;
  nightRateVnd: Money;
  hourlyRates: Array<{ hours: number; priceVnd: Money }>;
  commissionPct: number; // numeric(5,2): pg trả string, ép Number khi đọc
  validFrom: string; // YYYY-MM-DD (cột date; đọc qua to_char)
  validTo?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DelayBatchDoc {
  id: string;
  seq: number;
  payerId: string;
  stationId: string;
  flightId: string;
  status: DelayBatchStatus;
  simulated: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DelayGroupDoc {
  id: string;
  batchId: string;
  pnr: string;
  noSplit: boolean;
  status: DelayGroupStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DelayFlightPaxDoc {
  id: string;
  seq: number;
  payerId: string;
  stationId: string;
  flightId: string;
  groupId?: string;
  pnr: string;
  fullName: string;
  age: number;
  category: PaxCategory;
  isRepresentative: boolean;
  email?: string;
  phone?: string;
  contactEmail?: string; // bản sửa của quầy, chỉ áp dụng cho đơn
  contactPhone?: string;
  specialNeeds: string[];
  simulated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DelayRoomOfferDoc {
  id: string;
  seq: number;
  batchId: string;
  groupId: string;
  bookingId?: string;
  hotelId: string;
  roomTypeId: string;
  qty: number;
  status: DelayOfferStatus;
  expiresAt: Date;
  rejectReason?: string;
  roomNumbers: string[];
  transferCount: number;
  rejectedHotelIds: string[];
  respondedAt?: Date;
  extensionStatus: 'NONE' | 'PROPOSED' | 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  proposedLeaveAt?: Date;
  extensionRequestedAt?: Date;
  extensionRespondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessDoc {
  id: string;
  seq: number;
  code?: string;
  name: string;
  taxCode?: string;
  representative?: string;
  email?: string;
  phone?: string;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  rejectReason?: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
