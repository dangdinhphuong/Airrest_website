// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Activity, Users } from 'lucide-react';
import { StaffShell } from './StaffShell';

const items = [
  { id: 'a', label: 'Tổng quan', group: 'Tổng quan', icon: Activity },
  { id: 'b', label: 'Tài khoản', group: 'Hệ thống', icon: Users },
  { id: 'c', label: 'Nhật ký', group: 'Hệ thống', icon: Users },
];
const setup = (over = {}) => {
  const p = { portal: { label: 'Quản trị' }, items, cur: 'b', onPick: vi.fn(), onRoute: vi.fn(), onHome: vi.fn(), onLogout: vi.fn(), onLogin: vi.fn(),
    entries: items.map((item) => ({ key: item.id, area: 'admin', areaLabel: 'Quản trị', item })), session: { name: 'Lan' }, other: { label: 'Chuyển sang cổng Khách sạn', onClick: vi.fn(), testid: 'switch-area' }, ...over };
  render(<StaffShell {...p}><p>nội dung</p></StaffShell>);
  return p;
};
afterEach(() => { cleanup(); localStorage.clear(); });

describe('StaffShell', () => {
  it('giữ các data-testid cũ và chọn mục', () => {
    const p = setup();
    expect(screen.getByTestId('partner-sidebar')).toBeTruthy();
    expect(screen.getByTestId('breadcrumb').textContent).toContain('Hệ thống');
    fireEvent.click(screen.getByTestId('tab-c'));
    expect(p.onPick).toHaveBeenCalledWith(items[2]);
    fireEvent.click(screen.getByTestId('logo'));
    expect(p.onHome).toHaveBeenCalled();
  });
  it('menu người dùng: chuyển cổng và đăng xuất', () => {
    const p = setup();
    fireEvent.click(screen.getByTestId('partner-entry'));
    fireEvent.click(screen.getByTestId('switch-area'));
    expect(p.other.onClick).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('partner-entry'));
    fireEvent.click(screen.getByTestId('logout'));
    expect(p.onLogout).toHaveBeenCalled();
  });
  it('menu người dùng có mục Cài đặt -> onRoute(cổng, settings)', () => {
    const p = setup({ portal: { key: 'admin', label: 'Quản trị' } });
    fireEvent.click(screen.getByTestId('partner-entry'));
    fireEvent.click(screen.getByTestId('open-settings'));
    expect(p.onRoute).toHaveBeenCalledWith('admin', 'settings');
  });
  it('lọc cây không dấu; Ctrl+K tìm nhanh; ? mở phím tắt', () => {
    const p = setup();
    fireEvent.change(screen.getByTestId('nav-filter'), { target: { value: 'nhat ky' } });
    expect(screen.queryByTestId('tab-b')).toBeNull();
    expect(screen.getByTestId('tab-c')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /Tài khoản/ }));
    expect(p.onRoute).toHaveBeenCalledWith('admin', 'b');
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Phím tắt' })).toBeTruthy();
  });
  it('Ctrl+B thu gọn và nhớ trạng thái', () => {
    setup();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.queryByTestId('nav-filter')).toBeNull();
    expect(JSON.parse(localStorage.getItem('airrest-staff-shell@1')).collapsed).toBe(true);
  });
});
