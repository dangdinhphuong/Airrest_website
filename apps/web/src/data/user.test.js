// Luật kiểm tra đăng ký khách phía client (khớp backend). Chạy: npx vitest run apps/web/src/data/user.test.js (từ thư mục gốc monorepo)
import { describe, expect, it } from 'vitest';
import { describeAuthError, validateRegister } from './user';

const ok = { username: 'minhanh', password: 'matkhau123', confirm: 'matkhau123' };

describe('validateRegister', () => {
  it('hợp lệ thì không có lỗi', () => expect(validateRegister(ok)).toEqual({}));
  it('tên đăng nhập: bắt buộc, <= 50, không email/dãy >= 6 chữ số', () => {
    expect(validateRegister({ ...ok, username: '  ' }).username).toMatch(/Nhập/);
    expect(validateRegister({ ...ok, username: 'a'.repeat(51) }).username).toMatch(/50/);
    expect(validateRegister({ ...ok, username: 'a@b.vn' }).username).toMatch(/email/);
    expect(validateRegister({ ...ok, username: 'u0912345678' }).username).toMatch(/số điện thoại/);
    expect(validateRegister({ ...ok, username: 'u12345' }).username).toBeUndefined();
  });
  it('mật khẩu 8-128 ký tự và phải nhập lại khớp', () => {
    expect(validateRegister({ ...ok, password: 'short', confirm: 'short' }).password).toMatch(/8/);
    expect(validateRegister({ ...ok, password: 'a'.repeat(129), confirm: 'a'.repeat(129) }).password).toMatch(/128/);
    expect(validateRegister({ ...ok, confirm: '' }).confirm).toMatch(/Nhập lại/);
    expect(validateRegister({ ...ok, confirm: 'khac' }).confirm).toMatch(/không khớp/);
  });
});

describe('describeAuthError', () => {
  it('dịch mã lỗi của backend', () => {
    expect(describeAuthError({ code: 'USERNAME_TAKEN' })).toBe('Tên đăng nhập đã được dùng.');
    expect(describeAuthError({ code: 'INVALID_CREDENTIALS' })).toBe('Sai tên đăng nhập hoặc mật khẩu.');
    expect(describeAuthError({ status: 429 })).toMatch(/thử lại sau/);
  });
});
