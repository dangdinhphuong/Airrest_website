import { serviceFee, type ServiceFeeParams } from './pricing';

// Phí hủy theo gói chính sách (BA §5). Hàm thuần: không đọc DB, không dùng đồng hồ hệ thống (nhận `now`).
export interface CancellationTier {
  freeHours: number | null;
  partialHours: number | null;
  partialBps: number;
  lateBps: number;
  base: 'FIRST_NIGHT' | 'ALL_NIGHTS';
}

export interface CancellationQuote {
  tier: 'FREE' | 'PARTIAL' | 'LATE';
  hoursBefore: number;
  keepVnd: number;
  refundVnd: number;
}

export function cancellationQuote(i: {
  tier: CancellationTier;
  checkInAt: Date;
  now: Date;
  roomVnd: number;
  nights: number;
  serviceFeeVnd: number;
  totalVnd: number;
  paidVnd: number;
  refundedVnd: number;
}): CancellationQuote {
  const hoursBefore = (i.checkInAt.getTime() - i.now.getTime()) / 3_600_000;
  const t = i.tier;
  let tier: CancellationQuote['tier'];
  let bps = 0;
  if (t.freeHours !== null && hoursBefore >= t.freeHours) tier = 'FREE';
  else if (t.partialHours !== null && hoursBefore >= t.partialHours) {
    tier = 'PARTIAL';
    bps = t.partialBps;
  } else {
    tier = 'LATE';
    bps = t.lateBps;
  }
  const base = t.base === 'ALL_NIGHTS' ? i.roomVnd : Math.round(i.roomVnd / i.nights);
  const keepRoom = Math.round((base * bps) / 10_000);
  // BR-CXL-06: hủy có phạt thì phí dịch vụ không hoàn.
  const keepVnd = keepRoom + (keepRoom > 0 ? i.serviceFeeVnd : 0);
  const refundVnd = Math.max(0, Math.min(i.paidVnd - i.refundedVnd, i.totalVnd - keepVnd));
  return { tier, hoursBefore, keepVnd, refundVnd };
}

// Đổi ngày: giữ giá đơn vị của đơn gốc, tính lại tiền phòng + phí dịch vụ theo số đêm mới.
export function changeQuote(i: { unitPriceVnd: number; qty: number; oldNights: number; newNights: number; oldTotalVnd: number; fee: ServiceFeeParams }) {
  const newRoomVnd = i.unitPriceVnd * i.qty * i.newNights;
  const newServiceFeeVnd = serviceFee(newRoomVnd, i.fee);
  const newTotalVnd = newRoomVnd + newServiceFeeVnd;
  return { newRoomVnd, newServiceFeeVnd, newTotalVnd, diffVnd: newTotalVnd - i.oldTotalVnd };
}
