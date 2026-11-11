import { describe, expect, it } from 'vitest';
import { cancellationQuote, changeQuote, type CancellationTier } from '@airrest/business-logic';
import { CONFIG_KEYS } from '../config/configKeys';

const D = CONFIG_KEYS['cancellation.fee'].default as Record<'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE', CancellationTier>;
const H = 3600_000;
const now = new Date('2026-12-01T00:00:00Z');
const base = { roomVnd: 600_000, nights: 1, serviceFeeVnd: 12_000, totalVnd: 612_000, paidVnd: 612_000, refundedVnd: 0 };
const q = (tier: keyof typeof D, hoursMs: number, o: Partial<typeof base> = {}) => cancellationQuote({ tier: D[tier], now, checkInAt: new Date(now.getTime() + hoursMs), ...base, ...o });

describe('phí hủy theo mốc giờ', () => {
  it('STANDARD còn 30h -> miễn phí, hoàn 100%', () => expect(q('STANDARD', 30 * H)).toMatchObject({ tier: 'FREE', keepVnd: 0, refundVnd: 612_000 }));
  it('STANDARD đúng 24h -> FREE; lệch 1ms -> PARTIAL giữ 50% + phí DV', () => {
    expect(q('STANDARD', 24 * H).tier).toBe('FREE');
    expect(q('STANDARD', 24 * H - 1)).toMatchObject({ tier: 'PARTIAL', keepVnd: 312_000, refundVnd: 300_000 });
  });
  it('STANDARD đúng 2h -> PARTIAL; lệch 1ms -> LATE giữ toàn bộ', () => {
    expect(q('STANDARD', 2 * H).tier).toBe('PARTIAL');
    expect(q('STANDARD', 2 * H - 1)).toMatchObject({ tier: 'LATE', keepVnd: 612_000, refundVnd: 0 });
  });
  it('FLEXIBLE đúng 2h -> FREE; lệch 1ms -> LATE', () => {
    expect(q('FLEXIBLE', 2 * H).tier).toBe('FREE');
    expect(q('FLEXIBLE', 2 * H - 1)).toMatchObject({ tier: 'LATE', keepVnd: 612_000 });
  });
  it('check-in đã qua -> LATE, không hoàn', () => expect(q('STANDARD', -H)).toMatchObject({ tier: 'LATE', refundVnd: 0 }));
  it('NON_REFUNDABLE luôn giữ toàn bộ', () => expect(q('NON_REFUNDABLE', 500 * H)).toMatchObject({ tier: 'LATE', keepVnd: 612_000, refundVnd: 0 }));
  it('đơn 3 đêm STANDARD còn 10h: giữ đêm đầu 300.000 + phí DV 36.000', () =>
    expect(q('STANDARD', 10 * H, { roomVnd: 1_800_000, nights: 3, serviceFeeVnd: 36_000, totalVnd: 1_836_000, paidVnd: 1_836_000 })).toMatchObject({ keepVnd: 336_000, refundVnd: 1_500_000 }));
  it('chưa thu tiền: refund 0 nhưng keepVnd vẫn báo giá', () => expect(q('STANDARD', 10 * H, { paidVnd: 0 })).toMatchObject({ refundVnd: 0, keepVnd: 312_000 }));
  it('đã hoàn một phần: không hoàn vượt phần còn lại', () => expect(q('STANDARD', 30 * H, { refundedVnd: 100_000 }).refundVnd).toBeLessThanOrEqual(512_000));
});

describe('đổi ngày: chênh lệch giá', () => {
  const fee = { bps: 200, minVnd: 10_000, roundToVnd: 1000 };
  it('3 đêm -> 2 đêm', () => expect(changeQuote({ unitPriceVnd: 600_000, qty: 1, oldNights: 3, newNights: 2, oldTotalVnd: 1_836_000, fee })).toEqual({ newRoomVnd: 1_200_000, newServiceFeeVnd: 24_000, newTotalVnd: 1_224_000, diffVnd: -612_000 }));
  it('1 đêm -> 3 đêm', () => expect(changeQuote({ unitPriceVnd: 600_000, qty: 1, oldNights: 1, newNights: 3, oldTotalVnd: 612_000, fee }).diffVnd).toBe(1_224_000));
});
