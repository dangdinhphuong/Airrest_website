// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

let appState = { session: null, loginAs: null };
vi.mock('../data/auth', () => ({ loginStaff: vi.fn(), logoutStaff: () => {} }));
vi.mock('../state/store', () => ({ useApp: () => ({ state: appState, dispatch: vi.fn() }) }));
vi.mock('../lib/api', () => ({ describeError: (e) => e.message, setAuthToken: () => {}, setGuestToken: () => {} }));
vi.mock('../data/user', () => ({ FULLNAME_MAX: 100, PASSWORD_MIN: 8, USERNAME_MAX: 50, describeAuthError: () => '', loginPassenger: vi.fn(), registerPassenger: vi.fn(), validEmail: () => true }));
import Login from './Login';

afterEach(() => { cleanup(); appState = { session: null, loginAs: null }; });

describe('màn đăng nhập: tab mặc định', () => {
  it('vào từ Cổng quản trị & đối tác (loginAs = admin) thì mở sẵn tab Nhân sự', () => {
    appState = { session: null, loginAs: 'admin' };
    render(<Login />);
    expect(screen.getByTestId('staff-email')).toBeTruthy();
  });
  it('vào bình thường thì mở tab Hành khách', () => {
    render(<Login />);
    expect(screen.queryByTestId('staff-email')).toBeNull();
  });
});
