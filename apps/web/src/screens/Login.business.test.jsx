// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const loginStaff = vi.fn();
vi.mock('../data/auth', () => ({ loginStaff: (...a) => loginStaff(...a), logoutStaff: () => {} }));
vi.mock('../state/store', () => ({ useApp: () => ({ state: { session: null }, dispatch: vi.fn() }) }));
vi.mock('../lib/api', () => ({ describeError: (e) => `chung: ${e.message}`, setAuthToken: () => {}, setGuestToken: () => {} }));
vi.mock('../data/user', () => ({ FULLNAME_MAX: 100, PASSWORD_MIN: 8, USERNAME_MAX: 50, describeAuthError: () => '', loginPassenger: vi.fn(), registerPassenger: vi.fn(), validateRegister: () => ({}) }));
import Login from './Login';

afterEach(() => { cleanup(); loginStaff.mockReset(); });
const tryLogin = async (code) => {
  loginStaff.mockRejectedValue(Object.assign(new Error('m'), { status: 403, code }));
  render(<Login />);
  fireEvent.click(screen.getByText('Nhân sự'));
  fireEvent.change(screen.getByTestId('staff-email'), { target: { value: 'chu@abc.vn' } });
  fireEvent.change(document.getElementById('s-pw'), { target: { value: 'matkhau-dai-123' } });
  fireEvent.click(screen.getByTestId('staff-submit'));
  return (await screen.findByTestId('staff-error')).textContent;
};

describe('đăng nhập chủ doanh nghiệp chưa dùng được', () => {
  it('chờ duyệt', async () => expect(await tryLogin('BUSINESS_PENDING_APPROVAL')).toMatch(/chờ quản trị viên duyệt/));
  it('bị từ chối', async () => expect(await tryLogin('BUSINESS_REJECTED')).toMatch(/bị từ chối/));
  it('tạm ngưng', async () => expect(await tryLogin('BUSINESS_SUSPENDED')).toMatch(/tạm ngưng/));
  it('mã khác dùng thông báo chung', async () => expect(await tryLogin('X')).toMatch(/^chung:/));
  it('mở form đăng ký doanh nghiệp từ tab Nhân sự', async () => {
    render(<Login />);
    fireEvent.click(screen.getByText('Nhân sự'));
    fireEvent.click(screen.getByTestId('biz-open'));
    await waitFor(() => expect(screen.getByTestId('biz-form')).toBeTruthy());
  });
});
