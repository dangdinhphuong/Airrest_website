import type { ReservationState } from '@airrest/shared-types';

// Tồn phòng theo khoảng thời gian (SRS BR-BKG-02, thiết kế Mongo mục 5.1).
// Hàm thuần, không đụng DB -> dễ test. Khoảng nửa mở [from, to).
export interface Interval {
  from: Date;
  to: Date;
  qty: number;
}

export interface ReservationLike extends Interval {
  state: ReservationState;
  holdExpiresAt?: Date;
}

// Hoạt động = CONFIRMED/CHECKED_IN, hoặc HOLD chưa hết hạn.
export const isActive = (r: ReservationLike, now: Date): boolean =>
  r.state === 'CONFIRMED' ||
  r.state === 'CHECKED_IN' ||
  (r.state === 'HOLD' && !!r.holdExpiresAt && r.holdExpiresAt > now);

// Số phòng đồng thời LỚN NHẤT trong cửa sổ (sweep-line). Không cộng tổng các đoạn giao nhau,
// vì A(0-12h), B(12-24h), C(6-18h) giao nhau nhưng không bao giờ quá 1 phòng cùng lúc.
export function maxConcurrent(intervals: Interval[], window: { from: Date; to: Date }): number {
  const events: Array<{ t: number; d: number }> = [];
  for (const i of intervals) {
    const start = Math.max(i.from.getTime(), window.from.getTime());
    const end = Math.min(i.to.getTime(), window.to.getTime());
    if (start >= end) continue;
    events.push({ t: start, d: i.qty }, { t: end, d: -i.qty });
  }
  // Cùng thời điểm: trả phòng (-) trước nhận phòng (+) -> check-out 5:30 và check-in 5:30 không xung đột.
  events.sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.d;
    if (cur > max) max = cur;
  }
  return max;
}

export const remainingRooms = (total: number, existing: Interval[], window: { from: Date; to: Date }): number =>
  total - maxConcurrent(existing, window);

export const canBook = (total: number, existing: Interval[], req: Interval): boolean =>
  req.qty <= remainingRooms(total, existing, req);
