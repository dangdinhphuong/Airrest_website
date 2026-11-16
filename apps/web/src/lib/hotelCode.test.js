import { describe, expect, it } from 'vitest';
import { hotelCodeFrom } from './hotelCode';

describe('hotelCodeFrom', () => {
  it('bỏ dấu, ghép IATA, hợp lệ với mẫu backend', () => {
    expect(hotelCodeFrom('HAN', 'Khách sạn Hà Nội Đẹp')).toBe('HAN-KHACH-SAN-HA-NOI-DEP');
    for (const n of ['', 'a', '!!!', 'x'.repeat(80)]) for (const a of [0, 1]) expect(hotelCodeFrom('HAN', n, a)).toMatch(/^[A-Z0-9-]{3,30}$/);
  });
});
