// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ listFlightBoard: vi.fn(), getFlightSummary: vi.fn(), listAirports: vi.fn() }));
vi.mock('../../data/flights', () => api);

const { default: Flights, readParams } = await import('./Flights');

const AIRPORTS = [{ iata: 'HAN', name: 'Nội Bài' }, { iata: 'SGN', name: 'Tân Sơn Nhất' }, { iata: 'DAD', name: 'Đà Nẵng' }];
const flight = (o) => ({ id: o.code, airline: 'Vietnam Airlines', origin: 'HAN', dest: 'SGN', scheduledDepartureAt: '2026-11-11T03:00:00.000Z', newDepartureAt: null, status: 'ONTIME', cause: 'UNKNOWN', delayMinutes: null, ...o });
const board = (items, extra) => ({ items, count: items.length, truncated: false, ...extra });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/flights');
  api.listAirports.mockResolvedValue(AIRPORTS);
  api.getFlightSummary.mockResolvedValue({ items: [{ origin: 'HAN', total: 5, delayed: 2, cancelled: 1 }] });
  api.listFlightBoard.mockResolvedValue(board([flight({ code: 'VN100' })]));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const open = async () => { render(<Flights />); await screen.findByText('VN100'); };
const lastCall = () => api.listFlightBoard.mock.calls.at(-1)[0];

describe('Flights', () => {
  it('đọc URL: /flights?airport=SGN&dir=arrivals&date=...&status=...', async () => {
    window.history.replaceState(null, '', '/flights?airport=sgn&dir=arrivals&date=2026-11-12&status=DELAYED');
    await open();
    expect(lastCall()).toEqual({ airport: 'SGN', direction: 'arrivals', date: '2026-11-12', status: 'DELAYED' });
    expect(screen.getByRole('tab', { name: /SGN/ }).getAttribute('aria-selected')).toBe('true');
    expect(readParams('?airport=xx&dir=zzz&status=BAD').airport).toBe('HAN');
    expect(readParams('?dir=zzz&status=BAD')).toMatchObject({ dir: 'departures', status: '' });
  });

  it('đổi tab gọi API đúng tham số và ghi lại URL', async () => {
    await open();
    expect(lastCall()).toMatchObject({ airport: 'HAN', direction: 'departures' });
    fireEvent.click(screen.getByRole('tab', { name: /DAD/ }));
    await waitFor(() => expect(lastCall().airport).toBe('DAD'));
    expect(new URLSearchParams(window.location.search).get('airport')).toBe('DAD');
    fireEvent.click(screen.getByRole('button', { name: 'Đến' }));
    await waitFor(() => expect(lastCall().direction).toBe('arrivals'));
    expect(window.location.search).toContain('dir=arrivals');
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'CANCELLED' } });
    await waitFor(() => expect(lastCall().status).toBe('CANCELLED'));
    fireEvent.change(screen.getByLabelText('Ngày'), { target: { value: '2026-11-13' } });
    await waitFor(() => expect(lastCall().date).toBe('2026-11-13'));
    expect(window.location.search).toContain('date=2026-11-13');
  });

  it('phím mũi tên chuyển tab', async () => {
    await open();
    fireEvent.keyDown(screen.getByRole('tab', { name: /HAN/ }), { key: 'ArrowRight' });
    await waitFor(() => expect(lastCall().airport).toBe('SGN'));
    expect(screen.getByRole('tab', { name: /SGN/ }).getAttribute('tabindex')).toBe('0');
  });

  it('huy hiệu trạng thái bằng chữ, giờ mới và nguyên nhân; huy hiệu số chuyến trễ/hủy trên tab', async () => {
    api.listFlightBoard.mockResolvedValue(board([
      flight({ code: 'VN100' }),
      flight({ code: 'VN200', status: 'DELAYED', cause: 'AIRLINE', newDepartureAt: '2026-11-11T05:00:00.000Z', delayMinutes: 120 }),
      flight({ code: 'VN300', status: 'CANCELLED', cause: 'FORCE' }),
    ]));
    render(<Flights />);
    await screen.findByText('VN200');
    const rows = screen.getAllByTestId('flight-row');
    expect(within(rows[0]).getAllByText('Đúng giờ').length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText('Trễ').length).toBeGreaterThan(0);
    expect(within(rows[1]).getByTestId('new-time').textContent).toContain('12:00');
    expect(within(rows[1]).getByText('Do hãng bay')).toBeTruthy();
    expect(within(rows[2]).getAllByText('Hủy').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: /HAN/ }).textContent).toContain('3');
    expect(screen.getAllByText(/Dữ liệu mô phỏng/).length).toBeGreaterThan(0);
  });

  it('rỗng: thông báo rõ; lỗi: nút Thử lại gọi lại API', async () => {
    api.listFlightBoard.mockResolvedValueOnce(board([]));
    render(<Flights />);
    await screen.findByTestId('flights-empty');
    cleanup();
    api.listFlightBoard.mockRejectedValueOnce(new Error('boom'));
    render(<Flights />);
    const retry = await screen.findByRole('button', { name: /Thử lại/ });
    fireEvent.click(retry);
    await screen.findByText('VN100');
  });

  it('tìm theo mã: debounce 300ms, gọi mọi sân bay, lưu ?q=, xóa thì về tab cũ', async () => {
    window.history.replaceState(null, '', '/flights?airport=DAD');
    await open();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const box = screen.getByLabelText('Tìm chuyến bay theo mã');
      const calls = api.listFlightBoard.mock.calls.length;
      fireEvent.change(box, { target: { value: 'vn 2' } });
      await vi.advanceTimersByTimeAsync(200);
      expect(api.listFlightBoard.mock.calls.length).toBe(calls); // chưa hết 300ms
      await vi.advanceTimersByTimeAsync(150);
    } finally { vi.useRealTimers(); }
    await waitFor(() => expect(lastCall()).toEqual({ code: 'VN2', date: expect.any(String), status: '' }));
    expect(window.location.search).toContain('q=VN2');
    expect(window.location.search).toContain('airport=DAD');
    expect(screen.getByTestId('search-label').textContent).toContain('VN2');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa từ khóa' }));
    await waitFor(() => expect(lastCall()).toMatchObject({ airport: 'DAD', direction: 'departures' }));
    expect(window.location.search).not.toContain('q=');
  });

  it('đọc ?q= từ URL; Enter áp dụng ngay; ký tự lạ báo nhẹ và không gọi API; rỗng có thông báo', async () => {
    window.history.replaceState(null, '', '/flights?q=ab12&date=2026-11-12');
    api.listFlightBoard.mockResolvedValue(board([]));
    render(<Flights />);
    await screen.findByTestId('flights-empty');
    expect(lastCall()).toEqual({ code: 'AB12', date: '2026-11-12', status: '' });
    expect(screen.getByTestId('flights-empty').textContent).toContain('Không tìm thấy chuyến nào khớp “AB12” ngày 12/11');
    const box = screen.getByLabelText('Tìm chuyến bay theo mã');
    const calls = api.listFlightBoard.mock.calls.length;
    fireEvent.change(box, { target: { value: 'VN-2!' } });
    fireEvent.submit(box.closest('form'));
    expect(screen.getByRole('alert').textContent).toContain('chỉ gồm chữ và số');
    expect(api.listFlightBoard.mock.calls.length).toBe(calls);
    fireEvent.change(box, { target: { value: 'qh1' } });
    fireEvent.submit(box.closest('form'));
    await waitFor(() => expect(lastCall().code).toBe('QH1'));
  });
});
