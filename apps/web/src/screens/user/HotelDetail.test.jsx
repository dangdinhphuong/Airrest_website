// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@airrest/api-client';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const ID = '35269bbc-665c-456d-b3e8-e0e1308a1e34';
const api = vi.hoisted(() => ({ getHotel: vi.fn(), getReviews: vi.fn(), postReview: vi.fn(), listHotels: vi.fn(), listAirports: vi.fn() }));
vi.mock('../../data/user', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('./HotelMap', () => ({ default: ({ name }) => <div data-testid="hotel-map-stub">{name}</div> }));

const { toHotelView } = await import('../../data/user');
const { AppProvider } = await import('../../state/store');
const { default: HotelDetail } = await import('./HotelDetail');

// Dữ liệu đúng dạng GET /v1/hotels/:id (đi qua toHotelView thật của app).
const apiHotel = (over = {}) => toHotelView({
  id: ID, name: 'Ngọc Lan Inn', code: 'HAN-01', location: { coordinates: [105.8, 21.2] }, airports: [{ iata: 'HAN', km: 3.5, minutes: 9 }],
  amenities: ['WIFI', 'SHUTTLE_FREE', '24H_RECEPTION'], rating: { avg: 9.3, count: 21 }, images: [{ key: 'k', url: '/a.jpg' }],
  features: { freeCancel: true, shuttle: 'free', hourly: false, family: false, reception24: true, receptionCloseHour: null },
  stay: { checkInTime: '14:00', checkOutTime: '12:00', childPolicy: 'Trẻ dưới 6 tuổi ở miễn phí', petsAllowed: false }, stats: { floors: 3, totalRooms: 12 },
  rooms: [
    { id: 'r1', name: 'Deluxe', capacity: 2, beds: 1, areaM2: 22, baseNightVnd: 740000, nonRefundablePct: 10, roomsLeft: 2, amenities: ['WIFI'], images: [], view: 'Thung lũng', smoking: false, description: 'Phòng nhìn ra thung lũng' },
    { id: 'r2', name: 'Hết chỗ', capacity: 4, beds: 2, areaM2: 30, baseNightVnd: 900000, roomsLeft: 0, amenities: [], images: [] },
  ],
  ...over,
}, 'HAN');
const emptyReviews = { summary: { avg: 0, count: 0, distribution: Array(10).fill(0) }, items: [], nextCursor: null };

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
  window.history.pushState(null, '', `/khach-san/${ID}`);
  api.listAirports.mockResolvedValue([{ iata: 'HAN', name: 'Nội Bài' }]);
  api.listHotels.mockResolvedValue(Object.assign([], { total: 0 }));
  api.getHotel.mockImplementation(async () => apiHotel());
  api.getReviews.mockResolvedValue(emptyReviews);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }); // BookingModal (gsap) cần matchMedia
const open = async () => { render(<AppProvider><HotelDetail /></AppProvider>); await screen.findByRole('heading', { level: 1, name: 'Ngọc Lan Inn' }); };

describe('HotelDetail', () => {
  it('đọc id từ đường dẫn, gọi API đúng khách sạn và hiện các mục chính', async () => {
    await open();
    expect(api.getHotel.mock.calls[0][0]).toBe(ID);
    for (const name of ['Tổng quan', 'Phòng & giá', 'Tiện ích', 'Vị trí', 'Chính sách', 'Đánh giá']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(screen.getByText('9.3/10 · 21 đánh giá')).toBeTruthy();
    expect(screen.getByTestId('hotel-map-stub').textContent).toBe('Ngọc Lan Inn');
    const rooms = screen.getAllByTestId('detail-room');
    expect(rooms).toHaveLength(2);
    expect(within(rooms[0]).getByText('740.000đ')).toBeTruthy();
    expect(within(rooms[0]).getByText('Hướng Thung lũng')).toBeTruthy();
    expect(within(rooms[1]).getByTestId('room-qty').disabled).toBe(true); // hết phòng
    expect(screen.getByRole('button', { name: 'Đặt phòng' }).disabled).toBe(true); // chưa chọn phòng nào
  });

  it('chính sách: có dữ liệu thì hiện; thiếu thì "Liên hệ khách sạn"', async () => {
    await open();
    expect(screen.getByText('Từ 14:00')).toBeTruthy();
    expect(screen.getByText('Trẻ dưới 6 tuổi ở miễn phí')).toBeTruthy();
    expect(screen.getByText('Không được mang theo')).toBeTruthy();
    cleanup();
    api.getHotel.mockImplementation(async () => apiHotel({ stay: { checkInTime: null, checkOutTime: null, childPolicy: null, petsAllowed: null } }));
    await open();
    expect(screen.getAllByText('Liên hệ khách sạn').length).toBe(4);
  });

  const qtyOf = (room, i = 0) => within(room).getAllByTestId('room-qty')[i];
  const book = () => fireEvent.click(screen.getByRole('button', { name: 'Đặt phòng' }));

  it('Đặt phòng: chọn số phòng ở dòng, khung tổng cộng tiền, một nút đặt ghi giỏ và mở form đặt ngay tại trang (không chuyển trang)', async () => {
    await open();
    const room = screen.getAllByTestId('detail-room')[0];
    fireEvent.change(qtyOf(room), { target: { value: '2' } });
    expect(within(screen.getByTestId('room-summary')).getByText(/2 phòng/)).toBeTruthy();
    book();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(window.location.pathname).not.toBe('/noi-nghi');
    expect(JSON.parse(window.localStorage.getItem('airrest.cart'))).toMatchObject({ hotelId: ID, lines: [{ roomTypeId: 'r1', qty: 2, price: 740000 }] });
  });

  it('mức Không hoàn hủy là một dòng riêng: chọn thì giỏ ghi ratePlan và giá đã giảm; chọn mức khác thì bỏ dòng mức cũ', async () => {
    await open();
    const room = screen.getAllByTestId('detail-room')[0];
    expect(within(screen.getAllByTestId('detail-room')[1]).getAllByTestId('rate-row')).toHaveLength(1); // loại phòng không có mức này
    expect(within(room).getAllByTestId('rate-row')[1].textContent).toContain('666.000đ');
    fireEvent.change(qtyOf(room, 0), { target: { value: '1' } });
    fireEvent.change(qtyOf(room, 1), { target: { value: '1' } });
    expect(qtyOf(room, 0).value).toBe('0'); // một đơn một mức hủy
    book();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(JSON.parse(window.localStorage.getItem('airrest.cart')).lines[0]).toMatchObject({ roomTypeId: 'r1', price: 666000, ratePlan: 'NON_REFUNDABLE' });
  });

  it('đổi ngày nhận phòng thì tải lại giá/phòng còn theo cửa sổ mới', async () => {
    await open();
    const before = api.getHotel.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Ngày nhận phòng'), { target: { value: '2099-01-10' } });
    await waitFor(() => expect(api.getHotel.mock.calls.length).toBe(before + 1));
    const win = api.getHotel.mock.calls.at(-1)[2];
    expect(win.from).toBe('2099-01-10T07:00:00.000Z'); // 14:00 giờ VN
  });

  it('đánh giá: gửi đúng body, báo thành công rồi tải lại danh sách', async () => {
    api.postReview.mockResolvedValue({ review: {} });
    await open();
    expect(await screen.findByText(/Chưa có đánh giá nào/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    const form = screen.getByTestId('review-form');
    const [code, phone] = form.querySelectorAll('input');
    fireEvent.change(code, { target: { value: ' AR-ABCD1234 ' } });
    fireEvent.change(phone, { target: { value: '0911222333' } });
    fireEvent.change(form.querySelector('select'), { target: { value: '8' } });
    fireEvent.change(form.querySelector('textarea'), { target: { value: 'Sạch sẽ' } });
    api.getReviews.mockResolvedValue({ summary: { avg: 8, count: 1, distribution: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0] }, items: [{ id: 'x', reviewerName: 'Mai', score: 8, comment: 'Sạch sẽ', createdAt: '2026-11-16T00:00:00Z' }], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    expect(await screen.findByText('Cảm ơn bạn đã đánh giá!')).toBeTruthy();
    expect(api.postReview).toHaveBeenCalledWith(ID, { code: 'AR-ABCD1234', phone: '0911222333', score: 8, comment: 'Sạch sẽ' });
    expect(await screen.findByTestId('review-avg')).toBeTruthy();
    expect(screen.getByText('Mai')).toBeTruthy();
  });

  it('đánh giá bị từ chối: hiện lỗi từ backend, không đóng form', async () => {
    api.postReview.mockRejectedValue(new ApiError(409, 'REVIEW_EXISTS', 'Đơn này đã được đánh giá'));
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Viết đánh giá' }));
    const form = screen.getByTestId('review-form');
    const [code, phone] = form.querySelectorAll('input');
    fireEvent.change(code, { target: { value: 'AR-ABCD1234' } });
    fireEvent.change(phone, { target: { value: '0911222333' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/đã được đánh giá/);
    expect(screen.getByTestId('review-form')).toBeTruthy();
  });

  it('khách sạn không tồn tại: hiện thông báo lỗi và nút quay lại', async () => {
    api.getHotel.mockRejectedValue(new ApiError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn'));
    render(<AppProvider><HotelDetail /></AppProvider>);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Không tìm thấy/);
    expect(screen.getByRole('button', { name: /Quay lại danh sách/ })).toBeTruthy();
  });
});
