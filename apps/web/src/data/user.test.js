// Luật kiểm tra đăng ký khách phía client (khớp backend). Chạy: npx vitest run apps/web/src/data/user.test.js (từ thư mục gốc monorepo)
import { describe, expect, it } from 'vitest';
import { listTopRated, bestRoom, bookingFieldError, buildShuttle, defaultPickup, describeAuthError, guestsSummary, roomFits, validateRegister, weekdayLabel } from './user';

const ok = { username: 'minhanh', password: 'matkhau123', confirm: 'matkhau123' };

describe('validateRegister', () => {
  it('hợp lệ thì không có lỗi', () => expect(validateRegister(ok)).toEqual({}));
  it('tên đăng nhập: bắt buộc, <= 50, không email/dãy >= 6 chữ số', () => {
    expect(validateRegister({ ...ok, username: '  ' }).username).toMatch(/Nhập/);
    expect(validateRegister({ ...ok, username: 'a'.repeat(51) }).username).toMatch(/50/);
    expect(validateRegister({ ...ok, username: 'a@b.vn' }).username).toMatch(/email/);
    expect(validateRegister({ ...ok, username: 'u0912345678' }).username).toMatch(/số điện thoại/);
    expect(validateRegister({ ...ok, username: 'u12345' }).username).toBeUndefined();
  });
  it('mật khẩu 8-128 ký tự và phải nhập lại khớp', () => {
    expect(validateRegister({ ...ok, password: 'short', confirm: 'short' }).password).toMatch(/8/);
    expect(validateRegister({ ...ok, password: 'a'.repeat(129), confirm: 'a'.repeat(129) }).password).toMatch(/128/);
    expect(validateRegister({ ...ok, confirm: '' }).confirm).toMatch(/Nhập lại/);
    expect(validateRegister({ ...ok, confirm: 'khac' }).confirm).toMatch(/không khớp/);
  });
});

describe('describeAuthError', () => {
  it('dịch mã lỗi của backend', () => {
    expect(describeAuthError({ code: 'USERNAME_TAKEN' })).toBe('Tên đăng nhập đã được dùng.');
    expect(describeAuthError({ code: 'INVALID_CREDENTIALS' })).toBe('Sai tên đăng nhập hoặc mật khẩu.');
    expect(describeAuthError({ status: 429 })).toMatch(/thử lại sau/);
  });
});

const R2 = { id: 'a', price: 500, maxOccupancy: 2, availableRooms: 3 };
const R4 = { id: 'b', price: 900, maxOccupancy: 4, availableRooms: 1 };

describe('lọc phòng theo sức chứa', () => {
  it('capacity × số phòng >= số người và còn đủ phòng', () => {
    expect(roomFits(R2, 5, 2)).toBe(false); // 4 chỗ
    expect(roomFits(R2, 4, 2)).toBe(true);
    expect(roomFits(R4, 4, 2)).toBe(false); // chỉ còn 1 phòng
    expect(roomFits(R4, 4, 1)).toBe(true);
  });
  it('bestRoom chọn loại rẻ nhất thỏa điều kiện, không có thì null', () => {
    expect(bestRoom({ rooms: [R4, R2] }, 2, 1)).toBe(R2);
    expect(bestRoom({ rooms: [R4, R2] }, 4, 1)).toBe(R4);
    expect(bestRoom({ rooms: [R4, R2] }, 9, 1)).toBeNull();
  });
  it('tóm tắt khách và phòng', () => {
    expect(guestsSummary({ adults: 3, children: 2, rooms: 2 })).toBe('3 người lớn, 2 trẻ em · 2 phòng');
    expect(guestsSummary({ adults: 1, children: 0, rooms: 1 })).toBe('1 người lớn · 1 phòng');
  });
});

describe('thứ trong tuần', () => {
  it('định dạng vi-VN', () => {
    expect(weekdayLabel('2026-11-14')).toBe('Thứ Bảy, 14/11/2026');
    expect(weekdayLabel('2026-11-15')).toMatch(/^Chủ Nhật, 15\/11\/2026$/);
  });
});

describe('giờ đón mặc định (giờ VN)', () => {
  const now = Date.parse('2026-11-10T00:00:00+07:00');
  it('đón sân bay 12:00 ngày nhận, ra sân bay 10:00 ngày trả', () => {
    expect(defaultPickup('TO_HOTEL', '2026-11-12', '2026-11-14', now)).toBe('2026-11-12T12:00');
    expect(defaultPickup('TO_AIRPORT', '2026-11-12', '2026-11-14', now)).toBe('2026-11-14T10:00');
  });
  it('đã qua thì dời tới khoảng 1 giờ nữa', () => {
    const late = Date.parse('2026-11-12T15:30:00+07:00');
    expect(defaultPickup('TO_HOTEL', '2026-11-12', '2026-11-13', late)).toBe('2026-11-12T16:30');
  });
});

describe('buildShuttle', () => {
  const now = Date.parse('2026-11-10T00:00:00+07:00');
  it('không chọn chiều nào thì undefined', () => expect(buildShuttle({ airport: 'HAN', TO_HOTEL: { on: false }, TO_AIRPORT: { on: false } }, '2026-11-12', '2026-11-13', now)).toBeUndefined());
  it('dựng legs đúng định dạng, không có giá/passengers', () => {
    const b = buildShuttle({ airport: 'HAN', TO_HOTEL: { on: true, at: '', location: ' Cổng A ' }, TO_AIRPORT: { on: true, at: '2026-11-13T09:30' } }, '2026-11-12', '2026-11-13', now);
    expect(b).toEqual({ legs: [
      { direction: 'TO_HOTEL', pickupAt: '2026-11-12T12:00:00+07:00', airport: 'HAN', location: 'Cổng A' },
      { direction: 'TO_AIRPORT', pickupAt: '2026-11-13T09:30:00+07:00', airport: 'HAN' },
    ] });
  });
});

describe('bookingFieldError', () => {
  it('dịch lỗi 422 và chỉ ra trường', () => {
    expect(bookingFieldError({ code: 'GUESTS_EXCEED_CAPACITY', details: { maxGuests: 4 } })).toEqual({ field: 'guests', text: expect.stringContaining('tối đa 4 người') });
    expect(bookingFieldError({ code: 'PICKUP_OUT_OF_STAY_WINDOW' }).field).toBe('pickup');
    expect(bookingFieldError({ code: 'SOLD_OUT' })).toBeNull();
  });
});

describe('listTopRated', () => {
  const mk = (n) => async (_a, _s, q) => Array.from({ length: q.minReviews === 3 ? n : 4 }, (_, i) => ({ id: `${q.minReviews}-${i}` }));
  it('đủ 4 khách sạn >= 3 lượt thì giữ nguyên, sort rating, limit 4', async () => {
    const calls = [];
    const f = async (a, s, q) => { calls.push([a, q]); return mk(4)(a, s, q); };
    expect((await listTopRated(null, {}, 4, f)).map((h) => h.id)).toEqual(['3-0', '3-1', '3-2', '3-3']);
    expect(calls).toEqual([[undefined, { sort: 'rating', minReviews: 3, limit: 4 }]]);
  });
  it('dưới 4 thì hạ ngưỡng xuống 1 lượt; 0 thì mảng rỗng', async () => {
    expect((await listTopRated(null, {}, 4, mk(2)))[0].id).toBe('1-0');
    expect(await listTopRated(null, {}, 4, async () => [])).toEqual([]);
  });
});
