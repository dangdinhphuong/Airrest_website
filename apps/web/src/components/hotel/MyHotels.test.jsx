// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const dispatch = vi.fn();
const items = [{ id: 'h1', code: 'HAN-A', name: 'Sao Mai', status: 'ACTIVE', address: { line: '1 A', city: 'Hà Nội' } }, { id: 'h2', code: 'HAN-B', name: 'Biển Xanh', status: 'DRAFT', address: { line: '2 B', city: 'Hà Nội' } }];
const biz = { listMyHotels: vi.fn(), switchWorkingHotel: vi.fn(), submitMyHotel: vi.fn(), createMyHotel: vi.fn() };
vi.mock('../../data/business', () => ({ listMyHotels: (...a) => biz.listMyHotels(...a), switchWorkingHotel: (...a) => biz.switchWorkingHotel(...a), submitMyHotel: (...a) => biz.submitMyHotel(...a), createMyHotel: (...a) => biz.createMyHotel(...a) }));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { hotelId: 'h1' } }, dispatch }) }));
vi.mock('../admin/LocationPicker', () => ({ default: () => null }));
vi.mock('../admin/kit', () => ({ AirportSelect: () => null, useAirports: () => ({ items: [], err: null }) }));
import MyHotels from './MyHotels';

window.scrollTo = () => {};
afterEach(() => { cleanup(); dispatch.mockReset(); Object.values(biz).forEach((f) => f.mockReset()); });

describe('MyHotels', () => {
  it('liệt kê, chuyển sang khách sạn khác -> dispatch switchHotel với danh sách mới', async () => {
    biz.listMyHotels.mockResolvedValue({ items });
    biz.switchWorkingHotel.mockResolvedValue({ hotel: { id: 'h2' }, hotels: items });
    render(<MyHotels />);
    await screen.findAllByTestId('mh-row');
    expect(screen.getAllByTestId('mh-switch')).toHaveLength(1); // h1 đang làm việc nên chỉ h2 có nút
    fireEvent.click(screen.getByTestId('mh-switch'));
    await waitFor(() => expect(biz.switchWorkingHotel).toHaveBeenCalledWith('h2'));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'switchHotel', hotelId: 'h2', hotels: items }));
  });
  it('gửi hồ sơ cho khách sạn nháp', async () => {
    biz.listMyHotels.mockResolvedValue({ items });
    biz.submitMyHotel.mockResolvedValue({});
    render(<MyHotels />);
    await screen.findAllByTestId('mh-row');
    fireEvent.click(screen.getByTestId('mh-submit-hotel'));
    fireEvent.click(screen.getByTestId('mh-submit-hotel-dlg-confirm'));
    await waitFor(() => expect(biz.submitMyHotel).toHaveBeenCalledWith('h2'));
  });
  it('chưa có khách sạn nào: hiện hướng dẫn tạo', async () => {
    biz.listMyHotels.mockResolvedValue({ items: [] });
    render(<MyHotels />);
    expect((await screen.findByTestId('mh-empty')).textContent).toMatch(/Tạo khách sạn/);
  });
});
