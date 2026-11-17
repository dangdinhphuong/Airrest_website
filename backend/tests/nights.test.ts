import { describe, expect, it } from 'vitest';
import { stayNights } from '../lib/nights';

const vn = (s: string) => new Date(`${s}+07:00`);

describe('stayNights: đếm theo ngày lịch giờ VN', () => {
  it('nhận 14:00 trả 12:00 hôm sau = 1 đêm', () => expect(stayNights(vn('2026-11-17T14:00'), vn('2026-11-18T12:00'))).toBe(1));
  it('nhận sớm 06:00 / trả muộn 18:00 vẫn 1 đêm (trước đây làm tròn lên thành 2)', () => expect(stayNights(vn('2026-11-17T06:00'), vn('2026-11-18T18:00'))).toBe(1));
  it('2 đêm', () => expect(stayNights(vn('2026-11-17T14:00'), vn('2026-11-19T12:00'))).toBe(2));
  it('qua nửa đêm giờ VN: 23:30 -> 00:30 hôm sau là 1', () => expect(stayNights(vn('2026-11-17T23:30'), vn('2026-11-18T10:00'))).toBe(1));
  it('cùng ngày vẫn tối thiểu 1 đêm', () => expect(stayNights(vn('2026-11-17T08:00'), vn('2026-11-17T20:00'))).toBe(1));
});
