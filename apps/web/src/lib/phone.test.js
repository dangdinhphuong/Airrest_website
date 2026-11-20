import { describe, expect, it } from 'vitest';
import { isVnPhone } from './phone';

describe('isVnPhone', () => {
  it('nhận số hợp lệ ở mọi dạng', () => {
    for (const p of ['0912345678', '0912 345 678', '+84912345678', '84912345678', '0287654321', '091.234.5678']) expect(isVnPhone(p)).toBe(true);
  });
  it('chặn số giả và sai độ dài', () => {
    for (const p of ['0000000000', '0123456789', '0112345678', '01234', '091234567', '09123456789', '', 'abc', undefined]) expect(isVnPhone(p)).toBe(false);
  });
});
