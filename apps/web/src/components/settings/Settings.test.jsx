// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@airrest/api-client';

const dispatch = vi.fn();
const api = { getMe: vi.fn(), changePassword: vi.fn(), updateProfile: vi.fn() };
vi.mock('../../data/settings', () => ({ getMe: (...a) => api.getMe(...a), changePassword: (...a) => api.changePassword(...a), updateProfile: (...a) => api.updateProfile(...a) }));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { id: 'u1', name: 'Lan', permissions: ['a', 'b'] } }, dispatch }) }));
import Settings, { passwordError } from './Settings';

const OLD = 'MatKhauCu-2026!';
const NEW = 'MatKhauMoi-2026!';
const type = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });
const fill = (cur, next, again) => { type('pw-cur', cur); type('pw-next', next); type('pw-again', again); };
beforeEach(() => { api.getMe.mockResolvedValue({ user: { id: 'u1', type: 'HOTEL', email: 'lan@x.vn', fullName: 'Lan', phone: '0901234567' } }); });
afterEach(() => { cleanup(); dispatch.mockReset(); Object.values(api).forEach((f) => f.mockReset()); });

describe('Cài đặt: đổi mật khẩu', () => {
  it('kiểm phía trình duyệt: ngắn, trùng cũ, không khớp -> không gọi API', async () => {
    render(<Settings />); await screen.findByTestId('pf-name');
    fill(OLD, 'ngan', 'ngan'); fireEvent.click(screen.getByTestId('pw-save'));
    expect(screen.getByText(/ít nhất 12 ký tự/)).toBeTruthy();
    fill(OLD, OLD, OLD); fireEvent.click(screen.getByTestId('pw-save'));
    expect(screen.getByText(/phải khác mật khẩu hiện tại/)).toBeTruthy();
    fill(OLD, NEW, NEW + 'x'); fireEvent.click(screen.getByTestId('pw-save'));
    expect(screen.getByText(/chưa khớp/)).toBeTruthy();
    expect(api.changePassword).not.toHaveBeenCalled();
  });
  it('thành công: gọi API, xóa ô, hiện thông báo, không dispatch đăng xuất', async () => {
    api.changePassword.mockResolvedValue(undefined);
    render(<Settings />); await screen.findByTestId('pf-name');
    fill(OLD, NEW, NEW); fireEvent.click(screen.getByTestId('pw-save'));
    await screen.findByTestId('pw-ok');
    expect(api.changePassword).toHaveBeenCalledWith(OLD, NEW);
    expect(screen.getByTestId('pw-cur').value).toBe('');
    expect(screen.getByTestId('pw-next').value).toBe('');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('WRONG_CURRENT_PASSWORD hiện ở ô mật khẩu hiện tại, giữ nội dung ô mới', async () => {
    api.changePassword.mockRejectedValue(new ApiError(400, 'WRONG_CURRENT_PASSWORD', 'x'));
    render(<Settings />); await screen.findByTestId('pf-name');
    fill(OLD, NEW, NEW); fireEvent.click(screen.getByTestId('pw-save'));
    await screen.findByText('Mật khẩu hiện tại không đúng.');
    expect(screen.getByTestId('pw-next').value).toBe(NEW);
  });
  it('429 hiện thông báo chung; SAME_PASSWORD và 422 gắn vào ô mới', () => {
    expect(passwordError(new ApiError(429, 'RATE_LIMITED', 'x')).text).toMatch(/quá nhanh/);
    expect(passwordError(new ApiError(422, 'SAME_PASSWORD', 'x'))).toEqual({ field: 'next', text: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    expect(passwordError(new ApiError(422, 'VALIDATION', 'x')).field).toBe('next');
  });
  it('hiện/ẩn mật khẩu', async () => {
    render(<Settings />); await screen.findByTestId('pf-name');
    expect(screen.getByTestId('pw-cur').type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /Hiện mật khẩu hiện tại/ }));
    expect(screen.getByTestId('pw-cur').type).toBe('text');
  });
});

describe('Cài đặt: hồ sơ', () => {
  it('email chỉ đọc, loại tài khoản hiển thị; lưu -> PATCH + đồng bộ tên phiên', async () => {
    api.updateProfile.mockResolvedValue({ user: { fullName: 'Lan Anh', phone: null } });
    render(<Settings />); await screen.findByTestId('pf-name');
    expect(screen.getByTestId('pf-email').disabled).toBe(true);
    expect(screen.getByTestId('pf-email').value).toBe('lan@x.vn');
    expect(screen.getByTestId('pf-role').value).toMatch(/khách sạn/);
    fireEvent.change(screen.getByTestId('pf-name'), { target: { value: 'Lan Anh' } });
    fireEvent.change(screen.getByTestId('pf-phone'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('pf-save'));
    await screen.findByTestId('profile-ok');
    expect(api.updateProfile).toHaveBeenCalledWith({ fullName: 'Lan Anh', phone: null });
    expect(dispatch).toHaveBeenCalledWith({ type: 'profile', name: 'Lan Anh' });
  });
  it('SĐT sai định dạng chặn lưu', async () => {
    render(<Settings />); await screen.findByTestId('pf-name');
    fireEvent.change(screen.getByTestId('pf-phone'), { target: { value: 'abc' } });
    expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeTruthy();
    expect(screen.getByTestId('pf-save').disabled).toBe(true);
    await waitFor(() => expect(api.updateProfile).not.toHaveBeenCalled());
  });
});
