import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn(async () => ({ items: [], total: 0 }));
vi.mock('../lib/api', () => ({ api: { get, post: vi.fn(async () => ({ booking: {}, shuttles: [] })) }, apiBase: '', asGuest: () => undefined, describeError: String }));
const { clearHotelCache, createBooking, listHotels, peekHotels } = await import('./user');

describe('bộ nhớ đệm danh sách khách sạn (stale-while-revalidate)', () => {
  beforeEach(() => { clearHotelCache(); get.mockClear(); });
  it('chưa có -> null; sau khi tải thì peek trả đúng kết quả theo sân bay + bộ lọc, mỗi khóa riêng', async () => {
    expect(peekHotels('HAN', { sort: 'rating' })).toBeNull();
    const r = await listHotels('HAN', undefined, { sort: 'rating' });
    expect(peekHotels('HAN', { sort: 'rating' })).toBe(r);
    expect(peekHotels('SGN', { sort: 'rating' })).toBeNull();
    expect(peekHotels('HAN', { sort: 'price' })).toBeNull();
  });
  it('listHotels luôn gọi API (peek chỉ để hiện tức thì); đặt phòng thành công xóa đệm', async () => {
    await listHotels('HAN', undefined, {});
    await listHotels('HAN', undefined, {});
    expect(get).toHaveBeenCalledTimes(2);
    expect(peekHotels('HAN', {})).not.toBeNull();
    await createBooking({ hotelId: 'h', rooms: [{ roomTypeId: 'r', qty: 1 }], guest: { fullName: 'A', phone: '0912345678' }, checkIn: '2030-01-01', checkOut: '2030-01-02', paymentMethod: 'AT_HOTEL' });
    expect(peekHotels('HAN', {})).toBeNull();
  });
});
