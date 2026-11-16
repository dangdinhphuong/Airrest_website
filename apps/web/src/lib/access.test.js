import { describe, expect, it } from 'vitest';
import { areasOf, visibleTabs } from './access';
import { adminTabs } from './adminNav';
import { hotelTabs } from './hotelNav';
import { PERM } from './perms';

const ids = (s, tabs) => visibleTabs(s, tabs).map((t) => t.id);

describe('access: Cài đặt cá nhân', () => {
  it('Cài đặt có ở cả hai cổng nhưng không tự mở khu vực', () => {
    expect(areasOf({ permissions: [], hotelId: 'h' })).toEqual([]); // chỉ có tab Cài đặt -> không vào khu nào
    expect(ids({ permissions: [], hotelId: 'h' }, hotelTabs)).toEqual(['settings']);
  });
  it('nhân viên đơn vị chi trả: vào cổng quản trị và thấy Cài đặt', () => {
    const s = { permissions: [PERM.PAYER_DELAY_READ, PERM.PAYER_DELAY_MANAGE] };
    expect(areasOf(s)).toEqual(['admin']);
    expect(ids(s, adminTabs)).toContain('settings');
  });
  it('tài xế: chỉ cổng khách sạn, thấy Chuyến của tôi + Cài đặt, không thấy Nhân viên/Vai trò', () => {
    const s = { permissions: [PERM.TRIP_DRIVE], hotelId: 'h' };
    expect(areasOf(s)).toEqual(['hotel']);
    expect(ids(s, hotelTabs)).toEqual(['trips', 'settings']);
  });
  it('Nhân viên / Vai trò theo quyền hotel:staff:manage / hotel:role:manage; admin không có hai tab này', () => {
    expect(ids({ permissions: [PERM.BOOKING_READ], hotelId: 'h' }, hotelTabs)).not.toContain('staff');
    const s = { permissions: [PERM.BOOKING_READ, PERM.HOTEL_STAFF_MANAGE, PERM.HOTEL_ROLE_MANAGE], hotelId: 'h' };
    expect(ids(s, hotelTabs)).toEqual(expect.arrayContaining(['staff', 'roles']));
    expect(ids(s, adminTabs)).not.toEqual(expect.arrayContaining(['staff', 'roles']));
  });
});
