// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@airrest/api-client';

const S = vi.hoisted(() => ({ listStaff: vi.fn(), listRoles: vi.fn(), createStaff: vi.fn(), patchStaff: vi.fn(), resetStaffPassword: vi.fn() }));
vi.mock('../../data/hotelStaff', async (orig) => ({ ...(await orig()), listStaff: S.listStaff, listRoles: S.listRoles, createStaff: S.createStaff, patchStaff: S.patchStaff, resetStaffPassword: S.resetStaffPassword }));
const SESS = vi.hoisted(() => ({ v: { id: 'me' } }));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: SESS.v } }) }));
import Staff from './Staff';

const owner = { id: 'o', email: 'chu@x.vn', fullName: 'Chủ', phone: null, status: 'ACTIVE', isOwner: true, roleId: null, roleName: null };
const self = { id: 'me', email: 'me@x.vn', fullName: 'Tôi', phone: null, status: 'ACTIVE', isOwner: false, roleId: 'r2', roleName: 'Quản lý khách sạn' };
const lan = { id: 's1', email: 'lan@x.vn', fullName: 'Lan', phone: '0901234567', status: 'ACTIVE', isOwner: false, roleId: 'r1', roleName: 'Lễ tân' };
const roles = [{ id: 'r0', name: 'Chủ khách sạn', system: true, assignable: false }, { id: 'r1', name: 'Lễ tân', system: true, assignable: true }, { id: 'r2', name: 'Quản lý khách sạn', system: true, assignable: true }];
window.scrollTo = () => {};
beforeEach(() => { S.listStaff.mockResolvedValue({ items: [lan, self, owner], nextCursor: null }); S.listRoles.mockResolvedValue({ items: roles }); });
afterEach(() => { SESS.v = { id: 'me' }; cleanup(); Object.values(S).forEach((f) => f.mockReset()); });

describe('Nhân viên (cổng khách sạn)', () => {
  it('chủ chỉ đọc có nhãn Chủ; bản thân không có nút khóa/đặt lại', async () => {
    render(<Staff />);
    await screen.findAllByTestId('row');
    expect(screen.getByTestId('owner-note')).toBeTruthy();
    expect(screen.getAllByTestId('staff-lock')).toHaveLength(1); // chỉ Lan
    expect(screen.getAllByTestId('staff-reset')).toHaveLength(1);
    expect(screen.getAllByText('Chủ').length).toBeGreaterThan(0);
  });
  it('vai trò chọn được chỉ gồm vai trò assignable; thêm nhân viên -> hiện mật khẩu tạm một lần', async () => {
    S.createStaff.mockResolvedValue({ staff: lan });
    render(<Staff />);
    await screen.findAllByTestId('row');
    await waitFor(() => expect(screen.getByTestId('staff-new').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('staff-new'));
    fireEvent.change(screen.getByTestId('sf-email'), { target: { value: 'moi@x.vn' } });
    fireEvent.change(screen.getByTestId('sf-name'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByTestId('sf-save'));
    await screen.findByTestId('temp-pw');
    const body = S.createStaff.mock.calls[0][0];
    expect(body).toMatchObject({ email: 'moi@x.vn', fullName: 'Mới', roleId: 'r1' });
    expect(body.password.length).toBeGreaterThanOrEqual(12);
    expect(screen.getByTestId('temp-pw').textContent).toBe(body.password);
  });
  it('EMAIL_EXISTS hiện tiếng Việt và giữ hộp mở', async () => {
    S.createStaff.mockRejectedValue(new ApiError(409, 'EMAIL_EXISTS', 'Email đã được dùng'));
    render(<Staff />);
    await screen.findAllByTestId('row');
    await waitFor(() => expect(screen.getByTestId('staff-new').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('staff-new'));
    fireEvent.change(screen.getByTestId('sf-email'), { target: { value: 'lan@x.vn' } });
    fireEvent.change(screen.getByTestId('sf-name'), { target: { value: 'Lan 2' } });
    fireEvent.click(screen.getByTestId('sf-save'));
    expect((await screen.findByText(/đã được dùng cho một tài khoản khác/)).textContent).toMatch(/Email này/);
    expect(screen.getByTestId('staff-form')).toBeTruthy();
  });
  it('khóa có xác nhận -> PATCH status LOCKED', async () => {
    S.patchStaff.mockResolvedValue({ staff: lan });
    render(<Staff />);
    await screen.findAllByTestId('row');
    fireEvent.click(screen.getByTestId('staff-lock'));
    fireEvent.click(screen.getByTestId('staff-lock-dlg-confirm'));
    await waitFor(() => expect(S.patchStaff).toHaveBeenCalledWith('s1', { status: 'LOCKED' }));
  });
  it('đặt lại mật khẩu -> POST và hiện mật khẩu tạm; lỗi OWNER_PROTECTED hiện tiếng Việt', async () => {
    S.resetStaffPassword.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(403, 'OWNER_PROTECTED', 'x'));
    render(<Staff />);
    await screen.findAllByTestId('row');
    fireEvent.click(screen.getByTestId('staff-reset'));
    fireEvent.click(screen.getByTestId('rp-save'));
    const pw = (await screen.findByTestId('temp-pw')).textContent;
    expect(S.resetStaffPassword).toHaveBeenCalledWith('s1', pw);
    fireEvent.click(screen.getByTestId('reset-done'));
    fireEvent.click(screen.getByTestId('staff-reset'));
    fireEvent.click(screen.getByTestId('rp-save'));
    await screen.findByText('Không thể thao tác lên tài khoản chủ.');
  });
  it('nhiều khách sạn: chọn thêm khách sạn khi tạo nhân viên -> tải vai trò của khách sạn đó và gửi hotels với vai trò riêng từng nơi', async () => {
    SESS.v = { id: 'me', hotelId: 'h1', hotels: [{ id: 'h1', name: 'KS Một' }, { id: 'h2', name: 'KS Hai' }] };
    S.createStaff.mockResolvedValue({ staff: lan });
    render(<Staff />);
    await screen.findAllByTestId('row');
    await waitFor(() => expect(screen.getByTestId('staff-new').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('staff-new'));
    fireEvent.change(screen.getByTestId('sf-email'), { target: { value: 'moi@x.vn' } });
    fireEvent.change(screen.getByTestId('sf-name'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByTestId('sf-hotel-h2'));
    await waitFor(() => expect(S.listRoles).toHaveBeenCalledWith('h2')); // tải vai trò của khách sạn được chọn
    const sel = await screen.findByTestId('sf-role-h2'); // Select tùy biến: mở danh sách rồi chọn vai trò riêng cho KS Hai
    fireEvent.click(sel);
    fireEvent.click(await screen.findByRole('option', { name: /Quản lý/ }));
    fireEvent.click(screen.getByTestId('sf-save'));
    await screen.findByTestId('temp-pw');
    expect(S.createStaff.mock.calls[0][0].hotels).toEqual([{ hotelId: 'h1', roleId: 'r1' }, { hotelId: 'h2', roleId: 'r2' }]);
    expect(S.createStaff.mock.calls[0][0].roleId).toBeUndefined();
  });
});
