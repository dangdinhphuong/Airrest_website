import { describe, expect, it } from 'vitest';
import { hourlyOf, hourlyPrice, hourlyViolation, hourlyWindow, type HourlyConfig } from '@airrest/business-logic';

const cfg: HourlyConfig = { enabled: true, firstHourVnd: 120_000, nextHourVnd: 70_000, minHours: 2, maxHours: 6, cleaningMin: 30 };
const vn = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 1, h - 7, m)); // giờ VN ngày 2026-12-01

describe('đặt phòng theo giờ: giá và khung giờ (thuần)', () => {
  it('giá = giờ đầu + (giờ - 1) × giờ tiếp theo', () => {
    expect(hourlyPrice(cfg, 1)).toBe(120_000);
    expect(hourlyPrice(cfg, 3)).toBe(260_000);
    expect(hourlyPrice(cfg, 6)).toBe(120_000 + 5 * 70_000);
  });

  it('giờ ra và mốc nhả phòng gồm dọn phòng', () => {
    const w = hourlyWindow(vn(14), 3, 30);
    expect(w.endsAt.getTime()).toBe(vn(17).getTime());
    expect(w.holdTo.getTime()).toBe(vn(17, 30).getTime());
  });

  it('số giờ ngoài [min, max] hoặc không nguyên -> HOURS_OUT_OF_RANGE', () => {
    expect(hourlyViolation(cfg, vn(10), 1)).toBe('HOURS_OUT_OF_RANGE');
    expect(hourlyViolation(cfg, vn(10), 7)).toBe('HOURS_OUT_OF_RANGE');
    expect(hourlyViolation(cfg, vn(10), 2.5)).toBe('HOURS_OUT_OF_RANGE');
    expect(hourlyViolation(cfg, vn(10), 2)).toBeNull();
  });

  it('khung giờ bán: cả giờ vào lẫn giờ ra phải nằm trong [openFrom, openTo] giờ VN', () => {
    const o = { ...cfg, openFromHour: 8, openToHour: 22 };
    expect(hourlyViolation(o, vn(8), 2)).toBeNull();
    expect(hourlyViolation(o, vn(20), 2)).toBeNull(); // ra đúng 22:00
    expect(hourlyViolation(o, vn(21), 2)).toBe('OUTSIDE_OPEN_HOURS');
    expect(hourlyViolation(o, vn(7), 2)).toBe('OUTSIDE_OPEN_HOURS');
    expect(hourlyViolation({ ...cfg, openFromHour: 18, openToHour: 24 }, vn(23), 2)).toBe('OUTSIDE_OPEN_HOURS'); // qua nửa đêm
  });

  it('hourlyOf: chỉ trả khi bật, mặc định dọn 30 phút', () => {
    expect(hourlyOf({})).toBeNull();
    expect(hourlyOf({ hourly: { enabled: false } })).toBeNull();
    expect(hourlyOf({ hourly: { enabled: true, firstHourVnd: 1, nextHourVnd: 1, minHours: 1, maxHours: 2 } })?.cleaningMin).toBe(30);
  });
});
