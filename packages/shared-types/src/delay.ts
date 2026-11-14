// Luồng đặt phòng cho khách delay chuyến (đơn vị chi trả). Schema: backend/database/migrations/017_airport_delay.sql.
export type PayerKind = 'AIRLINE' | 'GROUND_HANDLER' | 'AIRPORT';
export type PayerStatus = 'ACTIVE' | 'SUSPENDED';
export type SharedRoomPolicy = 'PRIVATE' | 'SHARED';
export type BedType = 'SINGLE' | 'DOUBLE' | 'TWIN' | 'FAMILY';
export type PaxCategory = 'INFANT' | 'CHILD' | 'ADULT';
export type DelayBatchStatus = 'DRAFT' | 'PLACING' | 'COMPLETED' | 'CANCELLED';
export type DelayGroupStatus = 'PENDING' | 'OFFERED' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
export type DelayOfferStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export const PNR_RE = /^[A-Z0-9]{5,8}$/;

// Em bé < 2 tuổi, trẻ em 2-11, người lớn >= 12.
export function paxCategoryFromAge(age: number): PaxCategory {
  return age < 2 ? 'INFANT' : age < 12 ? 'CHILD' : 'ADULT';
}
