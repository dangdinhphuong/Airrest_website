// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StaffShell } from './StaffShell';

afterEach(() => { cleanup(); localStorage.clear(); });
const hotels = [{ id: 'h1', name: 'Sao Mai' }, { id: 'h2', name: 'Biển Xanh' }];
const setup = (hp) => {
  const p = { portal: { label: 'Khách sạn' }, items: [], cur: null, onPick: vi.fn(), onRoute: vi.fn(), onHome: vi.fn(), onLogout: vi.fn(), onLogin: vi.fn(), entries: [], session: { name: 'Chủ' }, other: null, hotelPicker: hp };
  render(<StaffShell {...p}><p>x</p></StaffShell>);
};

describe('chọn khách sạn đang làm việc', () => {
  it('header có select, đổi sang khách sạn khác gọi onSwitch', () => {
    const onSwitch = vi.fn();
    setup({ hotels, currentId: 'h1', onSwitch });
    const sel = screen.getByTestId('hotel-switch');
    expect(sel.value).toBe('h1');
    fireEvent.change(sel, { target: { value: 'h2' } });
    expect(onSwitch).toHaveBeenCalledWith('h2');
  });
  it('menu người dùng liệt kê khách sạn (dùng trên điện thoại)', () => {
    const onSwitch = vi.fn();
    setup({ hotels, currentId: 'h1', onSwitch });
    fireEvent.click(screen.getByTestId('partner-entry'));
    fireEvent.click(screen.getByTestId('menu-hotel-h2'));
    expect(onSwitch).toHaveBeenCalledWith('h2');
  });
  it('không có hotelPicker thì không hiện select', () => {
    setup(null);
    expect(screen.queryByTestId('hotel-switch')).toBeNull();
  });
});
