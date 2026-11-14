import { describe, expect, it } from 'vitest';
import { normalizeGroup, parseGroupQuery } from './groupLookup';

describe('tra cứu mã nhóm', () => {
  it('tách mã nhóm và SĐT', () => {
    expect(parseGroupQuery('nh-ab12cd34 0912 345 678')).toEqual({ groupCode: 'NH-AB12CD34', phone: '0912 345 678' });
    expect(parseGroupQuery('NH-AB12CD34')).toEqual({ groupCode: 'NH-AB12CD34', phone: null });
    expect(parseGroupQuery('AR-AB12CD34 0912345678').groupCode).toBeNull();
  });
  it('đọc đủ 5 trạng thái, checkoutAt chữ o thường', () => {
    const g = normalizeGroup({ groupCode: 'NH-1', status: 'PARTIAL', rooms: [
      { status: 'CONFIRMED', guest: 'Nguyen A.', members: 2, hotelName: 'KS A', roomNumbers: ['101'], checkInAt: 'x', checkoutAt: 'y', bookingCode: 'AR-1' },
      { status: 'WAITING_HOTEL', hotelName: 'lộ', bookingCode: 'AR-2' },
      { status: 'TRANSFERRING' }, { status: 'NEEDS_STAFF' }, { status: 'CANCELLED' }] });
    expect(g.rooms[0]).toMatchObject({ confirmed: true, hotelName: 'KS A', roomNumbers: ['101'], checkInAt: 'x', checkOutAt: 'y', bookingCode: 'AR-1', guest: 'Nguyen A.', members: 2 });
    expect(g.rooms.slice(1).map((r) => r.label)).toEqual(['Đang chờ khách sạn xác nhận', 'Đang tìm khách sạn khác cho bạn', 'Vui lòng liên hệ nhân viên sân bay', 'Đã hủy']);
    expect(g.rooms[1]).toMatchObject({ confirmed: false, hotelName: '', bookingCode: null });
    expect(g.rooms[3].needsStaff).toBe(true);
    expect(normalizeGroup({}).rooms).toEqual([]);
  });
});
