import { describe, expect, it } from 'vitest';
import { parseFlag } from './features';

describe('parseFlag (công tắc tính năng từ biến môi trường)', () => {
  it('không đặt hoặc để trống thì giữ mặc định', () => {
    expect(parseFlag(undefined)).toBe(true);
    expect(parseFlag('')).toBe(true);
    expect(parseFlag('   ')).toBe(true);
    expect(parseFlag(undefined, false)).toBe(false);
  });
  it.each(['false', 'FALSE', 'False', '0', 'off', 'OFF', 'no', 'disabled', ' false '])('"%s" -> tắt', (v) => expect(parseFlag(v)).toBe(false));
  it.each(['true', 'TRUE', '1', 'on', 'yes', 'enabled'])('"%s" -> bật', (v) => expect(parseFlag(v)).toBe(true));
  it('giá trị lạ/gõ sai (fasle, tắt) vẫn BẬT: lỡ tay không vô tình làm mất chatbot', () => {
    expect(parseFlag('fasle')).toBe(true);
    expect(parseFlag('tắt')).toBe(true);
  });
});
