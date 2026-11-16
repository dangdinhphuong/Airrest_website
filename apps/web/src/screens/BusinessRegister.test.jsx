// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const post = vi.fn();
vi.mock('../lib/api', () => ({ api: { post: (...a) => post(...a) }, describeError: (e) => e.message, setAuthToken: () => {}, apiBase: 'http://x', getAuthToken: () => 't' }));
import BusinessRegister from './BusinessRegister';
import { validateBusinessRegister } from '../data/business';

afterEach(() => { cleanup(); post.mockReset(); });
const fill = (o = {}) => {
  const v = { name: 'Công ty ABC', taxCode: '0312345678', representative: 'Nguyễn An', email: 'a@abc.vn', phone: '0901234567', password: 'matkhau-dai-123', confirm: 'matkhau-dai-123', ...o };
  for (const [k, val] of Object.entries(v)) fireEvent.change(screen.getByTestId(`biz-${k}`), { target: { value: val } });
};

describe('validateBusinessRegister', () => {
  const ok = { name: 'Công ty ABC', taxCode: '0312345678', representative: 'An', email: 'a@b.vn', phone: '0901234567', password: 'x'.repeat(12), confirm: 'x'.repeat(12) };
  it('hợp lệ thì không lỗi', () => expect(validateBusinessRegister(ok)).toEqual({}));
  it('bắt từng trường', () => {
    const e = validateBusinessRegister({ ...ok, name: '', taxCode: 'a b', representative: '', email: 'sai', phone: 'abc', password: 'ngan', confirm: '' });
    expect(Object.keys(e).sort()).toEqual(['email', 'name', 'password', 'phone', 'representative', 'taxCode']);
    expect(validateBusinessRegister({ ...ok, confirm: 'khac' }).confirm).toMatch(/không khớp/);
  });
});

describe('BusinessRegister', () => {
  it('validate phía client, không gọi API khi sai', () => {
    render(<BusinessRegister onBack={() => {}} />);
    fill({ password: 'ngan', confirm: 'ngan', email: 'sai' });
    fireEvent.click(screen.getByTestId('biz-submit'));
    expect(screen.getByTestId('biz-password-error').textContent).toMatch(/12/);
    expect(screen.getByTestId('biz-email-error')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
  it('ô honeypot ẩn khỏi người dùng thật và luôn gửi rỗng', async () => {
    post.mockResolvedValue({ status: 'RECEIVED' });
    render(<BusinessRegister onBack={() => {}} />);
    const hp = screen.getByTestId('biz-website');
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    fill();
    fireEvent.click(screen.getByTestId('biz-submit'));
    await screen.findByTestId('biz-done');
    const [path, body, opt] = post.mock.calls[0];
    expect(path).toBe('/v1/auth/business/register');
    expect(body).toMatchObject({ name: 'Công ty ABC', taxCode: '0312345678', email: 'a@abc.vn', website: '' });
    expect(body).not.toHaveProperty('confirm');
    expect(opt).toEqual({ auth: false });
    expect(screen.getByRole('status').textContent).toMatch(/chờ quản trị viên duyệt/);
  });
  it('lỗi máy chủ hiện thông báo, giữ form', async () => {
    post.mockRejectedValue(new Error('Bạn thao tác quá nhanh'));
    render(<BusinessRegister onBack={() => {}} />);
    fill();
    fireEvent.click(screen.getByTestId('biz-submit'));
    await waitFor(() => expect(screen.getByTestId('biz-error').textContent).toMatch(/quá nhanh/));
    expect(screen.getByTestId('biz-form')).toBeTruthy();
  });
});
