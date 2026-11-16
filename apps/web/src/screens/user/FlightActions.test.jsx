// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ session: null, board: vi.fn(), summary: vi.fn(), airports: vi.fn(), createFlight: vi.fn(), patchFlight: vi.fn(), adminAirports: vi.fn() }));
vi.mock('../../data/flights', () => ({ listFlightBoard: m.board, getFlightSummary: m.summary, listAirports: m.airports }));
vi.mock('../../data/admin', async (orig) => ({ ...(await orig()), createFlight: m.createFlight, patchFlight: m.patchFlight, listAirports: m.adminAirports }));
vi.mock('../../components/Select', () => ({ default: ({ children, ...p }) => <select {...p}>{children}</select> })); // Select thật là ô chọn tùy biến
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: m.session } }) }));

const { default: Flights } = await import('./Flights');

const AP = [{ iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }, { iata: 'SGN', name: 'Tân Sơn Nhất', city: 'TP.HCM' }];
const F = { id: 'f1', code: 'VN100', flightDate: '2026-11-11', airline: 'VNA', origin: 'HAN', dest: 'SGN', scheduledDepartureAt: '2026-11-11T03:00:00.000Z', newDepartureAt: null, status: 'ONTIME', cause: 'UNKNOWN', delayMinutes: null };

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/flights');
  m.session = null;
  m.airports.mockResolvedValue(AP);
  m.adminAirports.mockResolvedValue({ items: AP });
  m.summary.mockResolvedValue({ items: [] });
  m.board.mockResolvedValue({ items: [F], count: 1, truncated: false });
  m.createFlight.mockResolvedValue({ flight: { ...F, code: 'VN999', origin: 'SGN', flightDate: '2026-11-12' } });
  m.patchFlight.mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const open = async () => { render(<Flights />); await screen.findByText('VN100'); };

describe('Flights: hành động quản trị theo quyền', () => {
  it('chưa đăng nhập hoặc thiếu quyền: không có nút', async () => {
    await open();
    expect(screen.queryByTestId('flight-new')).toBeNull();
    expect(screen.queryByTestId('flight-change-open')).toBeNull();
    cleanup();
    m.session = { permissions: ['support:handle'] };
    await open();
    expect(screen.queryByTestId('flight-new')).toBeNull();
  });

  it('có flight:manage: tạo chuyến gửi đúng payload (giờ VN +07:00) rồi chuyển tới tab/ngày chuyến mới', async () => {
    m.session = { permissions: ['flight:manage'] };
    await open();
    fireEvent.click(screen.getByTestId('flight-new'));
    const form = await screen.findByTestId('flight-create');
    await waitFor(() => expect(form.querySelector('#cf-origin option[value="SGN"]')).toBeTruthy());
    expect(form.querySelector('#cf-origin').value).toBe('HAN'); // mặc định = tab đang xem
    fireEvent.change(form.querySelector('#cf-code'), { target: { value: 'vn999' } });
    fireEvent.change(form.querySelector('#cf-origin'), { target: { value: 'SGN' } });
    fireEvent.change(form.querySelector('#cf-dest'), { target: { value: 'HAN' } });
    fireEvent.change(form.querySelector('#cf-at'), { target: { value: '2026-11-12T08:30' } });
    fireEvent.change(form.querySelector('#cf-reason'), { target: { value: 'Thêm chuyến thử' } });
    fireEvent.submit(form);
    await waitFor(() => expect(m.createFlight).toHaveBeenCalledWith({ code: 'VN999', origin: 'SGN', dest: 'HAN', scheduledDepartureAt: '2026-11-12T01:30:00.000Z', reason: 'Thêm chuyến thử' }));
    await waitFor(() => expect(m.board.mock.calls.at(-1)[0]).toMatchObject({ airport: 'SGN', date: '2026-11-12' }));
  });

  it('Delay đến…: xem trước giờ cũ→mới, phím tắt, chặn giờ không sau giờ lịch, gửi đúng payload và làm mới ngay', async () => {
    m.session = { permissions: ['flight:manage'] };
    await open();
    fireEvent.click(screen.getByTestId('flight-change-open'));
    const form = await screen.findByTestId('flight-change');
    const dep = form.querySelector('#ch-dep');
    fireEvent.change(dep, { target: { value: '2026-11-11T09:00' } }); // trước giờ lịch 10:00 VN
    expect(screen.getByRole('alert').textContent).toContain('sau giờ lịch');
    expect(screen.getByRole('button', { name: 'Xác nhận' }).disabled).toBe(true);
    fireEvent.change(dep, { target: { value: '2026-11-11T10:00' } }); // bằng giờ lịch
    fireEvent.click(screen.getByRole('button', { name: '+120 phút' }));
    expect(dep.value).toBe('2026-11-11T12:00');
    expect(screen.getByTestId('delay-preview').textContent).toContain('2 giờ 0 phút');
    fireEvent.change(form.querySelector('#ch-reason'), { target: { value: 'Chậm kỹ thuật' } });
    const calls = m.board.mock.calls.length;
    fireEvent.submit(form);
    await waitFor(() => expect(m.patchFlight).toHaveBeenCalledWith('f1', { status: 'DELAYED', newDepartureAt: '2026-11-11T05:00:00.000Z', cause: 'AIRLINE', reason: 'Chậm kỹ thuật' }));
    await waitFor(() => expect(m.board.mock.calls.length).toBeGreaterThan(calls));
  });

  it('Hủy chuyến và Đưa về đúng giờ không gửi giờ mới', async () => {
    m.session = { permissions: ['flight:manage'] };
    await open();
    fireEvent.click(screen.getByTestId('flight-change-open'));
    let form = await screen.findByTestId('flight-change');
    fireEvent.change(form.querySelector('#ch-action'), { target: { value: 'ONTIME' } });
    fireEvent.change(form.querySelector('#ch-reason'), { target: { value: 'Khôi phục' } });
    fireEvent.submit(form);
    await waitFor(() => expect(m.patchFlight).toHaveBeenCalledWith('f1', { status: 'ONTIME', reason: 'Khôi phục' }));
  });
});
