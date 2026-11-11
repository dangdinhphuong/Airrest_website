import { describe, expect, it } from 'vitest';
import { shuttlePrice } from '@airrest/business-logic';
import { CONFIG_KEYS } from '../config/configKeys';

const cfg = CONFIG_KEYS['pricing.shuttle'].default;
const noon = new Date('2026-12-01T05:00:00Z'); // 12:00 VN
// Giờ VN -> UTC: trừ 7 giờ.
const vn = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 1, h - 7, m));

describe('giá xe đưa đón (P-08)', () => {
  it('bậc km ban ngày', () => {
    expect(shuttlePrice(cfg, 3, noon)?.priceVnd).toBe(60_000);
    expect(shuttlePrice(cfg, 3.1, noon)?.priceVnd).toBe(70_000);
    expect(shuttlePrice(cfg, 6.5, noon)?.priceVnd).toBe(100_000);
    expect(shuttlePrice(cfg, 25, noon)?.priceVnd).toBe(280_000);
    expect(shuttlePrice(cfg, 25.1, noon)).toBeNull();
  });
  it('mốc phụ thu đêm 22:00 (gồm) - 06:00 (không gồm), giờ VN', () => {
    expect(shuttlePrice(cfg, 6.5, vn(21, 59))).toMatchObject({ night: false, priceVnd: 100_000 });
    expect(shuttlePrice(cfg, 6.5, vn(22))).toMatchObject({ night: true, priceVnd: 120_000 });
    expect(shuttlePrice(cfg, 6.5, vn(5, 59))?.night).toBe(true);
    expect(shuttlePrice(cfg, 6.5, vn(6))?.night).toBe(false);
  });
});
