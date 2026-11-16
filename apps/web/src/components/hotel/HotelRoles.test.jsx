// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@airrest/api-client';

const S = vi.hoisted(() => ({ listRoles: vi.fn(), listPermissions: vi.fn(), createRole: vi.fn(), patchRole: vi.fn(), deleteRole: vi.fn() }));
vi.mock('../../data/hotelStaff', async (orig) => ({ ...(await orig()), ...S }));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { permissions: ['booking:read', 'booking:checkin', 'hotel:role:manage'] } } }) }));
import HotelRoles from './HotelRoles';

const catalog = [
  { key: 'booking:read', group: 'Đơn đặt phòng', description: 'Xem đơn' },
  { key: 'booking:checkin', group: 'Đơn đặt phòng', description: 'Check-in' },
  { key: 'fleet:manage', group: 'Vận hành', description: 'Quản lý xe' },
];
const sample = { id: 'r1', name: 'Lễ tân', system: true, assignable: true, description: null, permissions: ['booking:read'], accountCount: 2 };
const custom = { id: 'c1', name: 'Ca đêm', system: false, assignable: true, description: 'x', permissions: ['booking:read'], accountCount: 1 };
window.scrollTo = () => {};
beforeEach(() => { S.listRoles.mockResolvedValue({ items: [sample, custom] }); S.listPermissions.mockResolvedValue({ items: catalog }); });
afterEach(() => { cleanup(); Object.values(S).forEach((f) => f.mockReset()); });

const open = async () => { render(<HotelRoles />); await screen.findAllByTestId('row'); await waitFor(() => expect(screen.getByTestId('role-new').disabled).toBe(false)); };
describe('Vai trò và phân quyền (cổng khách sạn)', () => {
  it('mẫu chỉ xem (nhãn Mẫu), tùy chỉnh có Sửa/Xóa, hiện số nhân viên đang dùng', async () => {
    await open();
    expect(screen.getByTestId('role-sample-note')).toBeTruthy();
    expect(screen.getAllByTestId('role-edit')).toHaveLength(1);
    expect(screen.getByText('Mẫu')).toBeTruthy();
    expect(screen.getAllByTestId('row')[0].textContent).toMatch(/2/);
  });
  it('tạo vai trò: chỉ quyền mình có chọn được, quyền không có bị khóa; gửi đúng body', async () => {
    S.createRole.mockResolvedValue({ role: custom });
    await open();
    fireEvent.click(screen.getByTestId('role-new'));
    expect(screen.getByTestId('perm-fleet:manage').disabled).toBe(true);
    expect(screen.getByText(/Bạn không có quyền này nên không gán được/)).toBeTruthy();
    expect(screen.getByTestId('role-save').disabled).toBe(true); // chưa chọn quyền
    fireEvent.change(screen.getByTestId('hr-name'), { target: { value: 'Lễ tân ca đêm' } });
    fireEvent.click(screen.getByTestId('perm-booking:read'));
    fireEvent.click(screen.getByTestId('perm-booking:checkin'));
    fireEvent.click(screen.getByTestId('role-save'));
    await waitFor(() => expect(S.createRole).toHaveBeenCalledWith({ name: 'Lễ tân ca đêm', description: undefined, permissions: ['booking:read', 'booking:checkin'] }));
  });
  it('xóa vai trò đang dùng: ROLE_IN_USE hiện thông báo kèm số nhân viên, hộp vẫn mở', async () => {
    S.deleteRole.mockRejectedValue(new ApiError(409, 'ROLE_IN_USE', 'x', { accountCount: 3 }));
    await open();
    fireEvent.click(screen.getByTestId('role-delete'));
    fireEvent.click(screen.getByTestId('role-del-dlg-confirm'));
    await screen.findByText(/đang được gán cho 3 nhân viên/);
    expect(S.deleteRole).toHaveBeenCalledWith('c1');
    expect(screen.getByTestId('role-del-dlg')).toBeTruthy();
  });
  it('PERMISSION_ESCALATION liệt kê quyền thiếu', async () => {
    S.patchRole.mockRejectedValue(new ApiError(403, 'PERMISSION_ESCALATION', 'x', { missing: ['fleet:manage'] }));
    await open();
    fireEvent.click(screen.getByTestId('role-edit'));
    fireEvent.click(screen.getByTestId('role-save'));
    await screen.findByText(/fleet:manage/);
  });
});
