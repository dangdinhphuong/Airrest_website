// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const B = { id: 'b1', code: 'AB1', status: 'PENDING', guest: { fullName: 'An' }, stay: { from: '2026-11-20', to: '2026-11-21' }, lines: [{ roomTypeName: 'Deluxe', qty: 1 }], pricing: { totalVnd: 1000 }, payment: { status: 'PAID' } };
const calls = [];
vi.mock('../../data/hotel', () => ({
  listBookings: async () => ({ items: [B], nextCursor: null }),
  confirmBooking: async (id) => { calls.push(['confirm', id]); },
  rejectBooking: async (id, r) => { calls.push(['reject', id, r]); },
  listRoomTypes: async () => ({ items: [{ id: 't1', code: 'DLX', name: 'Deluxe', capacity: 2, beds: 1, areaM2: 20, totalRooms: 3, pricing: { baseNightVnd: 500000 }, images: [] }] }),
  listFloors: async () => ({ items: [{ id: 'f1', name: 'Tầng 1', level: 1, roomCount: 1 }] }),
  listRooms: async () => ({ items: [{ id: 'r1', number: '101', floorId: 'f1', roomTypeId: 't1', status: 'ACTIVE', images: [] }] }),
  listVehicles: async () => ({ items: [{ id: 'v1', plate: '51A', seats: 4, active: true }] }),
  listDrivers: async () => ({ items: [] }),
  listPayouts: async () => ({ items: [{ id: 'p1', period: '2026-10', grossVnd: 1, commissionVnd: 0, netVnd: 1, status: 'PAID' }] }),
  getPayout: async () => ({ lines: [{ id: 'l1', kind: 'ROOM', grossVnd: 1, commissionVnd: 0, netVnd: 1 }] }),
}));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { id: 's' } } }) }));
vi.mock('../../lib/access', () => ({ hasPerm: () => true }));

import Bookings from './Bookings';
import Rooms from './Rooms';
import Fleet from './Fleet';
import Payouts from './Payouts';

window.scrollTo = () => {};
describe('hotel tabs', () => {
  it('Bookings: bảng + xác nhận + từ chối có lý do', async () => {
    render(<Bookings />);
    await screen.findByTestId('bk-row');
    expect(document.querySelectorAll('h1').length).toBe(1);
    fireEvent.click(screen.getByTestId('bk-confirm'));
    fireEvent.click(screen.getByTestId('bk-confirm-dlg-confirm'));
    await waitFor(() => expect(calls).toContainEqual(['confirm', 'b1']));
    fireEvent.click(screen.getByTestId('bk-reject-open'));
    fireEvent.click(screen.getByTestId('bk-reject-confirm'));
    expect(screen.getByRole('alert').textContent).toMatch(/ít nhất/);
    fireEvent.change(screen.getByTestId('bk-reject-reason'), { target: { value: 'hết phòng' } });
    fireEvent.click(screen.getByTestId('bk-reject-confirm'));
    await waitFor(() => expect(calls).toContainEqual(['reject', 'b1', 'hết phòng']));
    cleanup();
  });
  it('Rooms: bảng loại phòng + tầng + modal', async () => {
    render(<Rooms />);
    await screen.findByTestId('rt-row'); await screen.findByTestId('fl-row'); await screen.findByTestId('ru-row');
    fireEvent.click(screen.getByTestId('ru-detail')); // bấm số phòng -> hộp chi tiết phòng
    expect(screen.getByTestId('ru-detail-dlg')).toBeTruthy();
    fireEvent.click(screen.getByText('Đóng', { selector: 'button.btn' }));
    fireEvent.click(screen.getByTestId('rt-new'));
    expect(screen.getByTestId('room-form')).toBeTruthy();
    fireEvent.click(screen.getByText('Đóng', { selector: 'button.btn' }));
    fireEvent.click(screen.getByTestId('fl-new'));
    expect(screen.getByTestId('floor-form')).toBeTruthy();
    cleanup();
  });
  it('Fleet + Payouts', async () => {
    render(<Fleet />);
    await screen.findByTestId('vh-row');
    fireEvent.click(screen.getByTestId('sub-drivers'));
    expect(screen.getByTestId('empty')).toBeTruthy();
    cleanup();
    render(<Payouts />);
    fireEvent.click(await screen.findByTestId('po-toggle'));
    await screen.findByTestId('po-detail');
    await waitFor(() => expect(screen.getByTestId('po-detail').textContent).toContain('Tiền phòng'));
  });
});
