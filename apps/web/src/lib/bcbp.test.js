import { describe, expect, it } from 'vitest';
import { ordinalToIso, parseBcbp } from './bcbp';

const SAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 100';
const now = new Date(2026, 7, 10); // 10/08/2026

describe('parseBcbp', () => {
  it('đọc số hiệu và ngày từ mẫu IATA', () => {
    expect(parseBcbp(SAMPLE, now)).toEqual({ flight: 'AC834', date: '2026-08-14' });
  });
  it('hãng 2 ký tự + số có chữ cái hậu tố', () => {
    const s = 'M1NGUYEN/AN           EXYZ789 SGNHANVN 0218A226Y012A0001 100';
    expect(parseBcbp(s, now)).toEqual({ flight: 'VN218A', date: '2026-08-14' });
  });
  it('không trả tên hay mã đặt chỗ', () => {
    expect(JSON.stringify(parseBcbp(SAMPLE, now))).not.toMatch(/DESMARAIS|ABC123/);
  });
  it('từ chối chuỗi không phải thẻ lên tàu', () => {
    for (const bad of ['', 'hello', 'https://example.com/ve', 'M1' + 'x'.repeat(20), null, undefined]) expect(parseBcbp(bad, now)).toBeNull();
  });
  it('từ chối ngày ngoài 1-366', () => {
    expect(parseBcbp(SAMPLE.replace(' 226F', ' 999F'), now)).toBeNull();
  });
});

describe('ordinalToIso', () => {
  it('chọn năm gần hôm nay nhất (qua năm)', () => {
    expect(ordinalToIso(5, new Date(2026, 11, 28))).toBe('2027-01-05');
    expect(ordinalToIso(360, new Date(2027, 0, 3))).toBe('2026-12-26');
  });
  it('366 chỉ hợp lệ ở năm nhuận', () => {
    expect(ordinalToIso(366, new Date(2026, 11, 30))).toBeNull();
    expect(ordinalToIso(366, new Date(2028, 11, 20))).toBe('2028-12-31');
  });
});
