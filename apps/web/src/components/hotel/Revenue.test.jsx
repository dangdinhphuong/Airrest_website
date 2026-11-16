// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = (id, code, name, r, e) => ({ hotelId: id, code, name, status: 'ACTIVE', bookings: 2, realizedVnd: r, expectedVnd: e, serviceFeeRealizedVnd: 10, serviceFeeExpectedVnd: 5, settlement: { grossVnd: 0, commissionVnd: 0, netVnd: 0 } });
const summary = { hotels: [H('h1', 'A', 'Sao Mai', 1000000, 500000), H('h2', 'B', 'Biển Xanh', 2000000, 0)], totals: { bookings: 4, realizedVnd: 3000000, expectedVnd: 500000, serviceFeeRealizedVnd: 20, serviceFeeExpectedVnd: 10, settlement: { grossVnd: 0, commissionVnd: 0, netVnd: 0 } } };
const hotelRep = { items: [{ bucket: '2026-11-01', bookings: 1, realizedVnd: 1000000, expectedVnd: 0, serviceFeeRealizedVnd: 5, serviceFeeExpectedVnd: 0 }], totals: { bookings: 1, realizedVnd: 1000000, expectedVnd: 0, serviceFeeRealizedVnd: 5, serviceFeeExpectedVnd: 0 }, settlement: { items: [], totals: { grossVnd: 0, commissionVnd: 0, netVnd: 0 } } };
const csv = vi.fn();
vi.mock('../../data/business', () => ({
  getHotelRevenue: async () => hotelRep, getBusinessRevenue: async () => summary,
  fetchReportCsv: async (...a) => { csv(...a); return { blob: new Blob(['x']), filename: 'a.csv' }; }, saveBlob: () => {},
}));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { hotelId: 'h1', business: { id: 'b' }, hotels: [{ id: 'h1', name: 'Sao Mai' }], permissions: ['business:report:read', 'booking:read'] } } }) }));
import Revenue from './Revenue';

window.scrollTo = () => {};
afterEach(() => { cleanup(); csv.mockReset(); });
const text = (el) => el.textContent.replace(/\s| /g, '');

describe('Revenue', () => {
  it('báo cáo khách sạn: thẻ số liệu và dòng tổng khớp', async () => {
    render(<Revenue />);
    await screen.findByTestId('rv-table');
    expect(text(screen.getByTestId('rv-k-real'))).toMatch(/1\.000\.000/);
    expect(screen.getByTestId('rv-define').textContent).toMatch(/ngày nhận phòng/);
    expect(screen.getAllByTestId('rv-row')).toHaveLength(2); // 1 ngày + tổng cộng
  });
  it('tổng doanh nghiệp: từng khách sạn + dòng Tổng cộng khớp, tải CSV đúng đường dẫn', async () => {
    render(<Revenue />);
    fireEvent.click(screen.getByTestId('sub-business'));
    await waitFor(() => expect(screen.getAllByTestId('rv-row')).toHaveLength(3));
    const rows = screen.getAllByTestId('rv-row');
    expect(text(rows[2])).toContain('Tổngcộng');
    expect(text(rows[2])).toMatch(/3\.000\.000/);
    expect(text(rows[0])).toMatch(/1\.000\.000/);
    fireEvent.click(screen.getByTestId('rv-csv'));
    await waitFor(() => expect(csv).toHaveBeenCalledWith('revenue/summary', expect.objectContaining({ from: expect.any(String) })));
  });
});
