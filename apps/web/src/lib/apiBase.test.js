// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseBase } from './api';

describe('parseBase (VITE_API_BASE_URL)', () => {
  it('địa chỉ đầy đủ: giữ origin + đường dẫn, bỏ dấu / cuối', () => {
    expect(parseBase('http://localhost:3000')).toBe('http://localhost:3000');
    expect(parseBase(' https://api.airrest.dpdns.org/ ')).toBe('https://api.airrest.dpdns.org');
    expect(parseBase('https://x.vn/base/')).toBe('https://x.vn/base');
  });
  it('"/" hoặc "same-origin": gọi API cùng địa chỉ với web', () => {
    expect(parseBase('/')).toBe(window.location.origin);
    expect(parseBase('same-origin')).toBe(window.location.origin);
  });
  it('bỏ trống, sai giao thức, rác: vẫn là lỗi cấu hình (null), không tự đoán', () => {
    for (const bad of [undefined, null, '', '   ', 'ftp://x', 'javascript:alert(1)', 'localhost:3000', 'api', '/api/v1']) expect(parseBase(bad), String(bad)).toBeNull();
  });
});
