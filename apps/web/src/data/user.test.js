// Luật kiểm tra đăng ký khách phía client (khớp backend). Chạy: npx vitest run apps/web/src/data/user.test.js (từ thư mục gốc monorepo)
import { describe, expect, it } from 'vitest';
import { checkAttachments, listTopRated, bestRoom, bookingFieldError, buildShuttle, defaultPickup, describeAuthError, guestsSummary, roomFits, validateRegister, weekdayLabel } from './user';

const ok = { email: 'minhanh@example.com', username: 'minhanh', fullName: 'Minh Anh', password: 'matkhau123' };

describe('validateRegister', () => {
  it('hợp lệ thì không có lỗi', () => expect(validateRegister(ok)).toEqual({}));
  it('tên đăng nhập: bắt buộc, <= 50, không email/dãy >= 6 chữ số', () => {
    expect(validateRegister({ ...ok, username: '  ' }).username).toMatch(/Nhập/);
    expect(validateRegister({ ...ok, username: 'a'.repeat(51) }).username).toMatch(/50/);
    expect(validateRegister({ ...ok, username: 'a@b.vn' }).username).toMatch(/@/);
    expect(validateRegister({ ...ok, username: 'u0912345678' }).username).toMatch(/số điện thoại/);
    expect(validateRegister({ ...ok, username: 'u12345' }).username).toBeUndefined();
  });
  it('tên đăng nhập: chặn ký tự markup, vẫn cho khoảng trắng và chữ có dấu', () => {
    expect(validateRegister({ ...ok, username: 'a b<script>' }).username).toMatch(/không hợp lệ/);
    expect(validateRegister({ ...ok, username: 'x"y' }).username).toMatch(/không hợp lệ/);
    expect(validateRegister({ ...ok, username: 'Minh Ánh' }).username).toBeUndefined();
  });
  it('mật khẩu 8-128 ký tự', () => {
    expect(validateRegister({ ...ok, password: 'short' }).password).toMatch(/8/);
    expect(validateRegister({ ...ok, password: 'a'.repeat(129) }).password).toMatch(/128/);
  });
  it('email hợp lệ và họ tên bắt buộc', () => {
    expect(validateRegister({ ...ok, email: '' }).email).toMatch(/email/);
    expect(validateRegister({ ...ok, email: 'khong-phai-email' }).email).toMatch(/email/);
    expect(validateRegister({ ...ok, fullName: '  ' }).fullName).toMatch(/Nhập/);
    expect(validateRegister({ ...ok, fullName: 'a'.repeat(101) }).fullName).toMatch(/100/);
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
  it('đón sân bay lúc nhận phòng 14:00, ra sân bay lúc trả phòng 12:00', () => {
    expect(defaultPickup('TO_HOTEL', '2026-11-12', '2026-11-14', now)).toBe('2026-11-12T14:00');
    expect(defaultPickup('TO_AIRPORT', '2026-11-12', '2026-11-14', now)).toBe('2026-11-14T12:00');
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
      { direction: 'TO_HOTEL', pickupAt: '2026-11-12T14:00:00+07:00', airport: 'HAN', location: 'Cổng A' },
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

describe('checkAttachments (nút "+" trong chat)', () => {
  const f = (name, type, mb = 1) => ({ name, type, size: mb * 1024 * 1024 });
  it('nhận ảnh/video đúng loại và dung lượng', () => {
    const r = checkAttachments([f('a.jpg', 'image/jpeg'), f('b.mp4', 'video/mp4', 20)]);
    expect(r.ok).toHaveLength(2); expect(r.errors).toEqual([]);
  });
  it('từ chối sai loại, quá dung lượng, kèm lý do theo tên tệp', () => {
    const r = checkAttachments([f('a.pdf', 'application/pdf'), f('b.png', 'image/png', 6), f('c.mp4', 'video/mp4', 31)]);
    expect(r.ok).toEqual([]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toMatch(/^a\.pdf:/);
  });
  it('tối đa 5 ảnh, 1 video, 6 tệp, tính cả tệp đã chọn trước', () => {
    const imgs = (n, p = 'i') => Array.from({ length: n }, (_, i) => f(`${p}${i}.jpg`, 'image/jpeg'));
    expect(checkAttachments(imgs(6)).ok).toHaveLength(5);
    expect(checkAttachments([f('v2.mp4', 'video/mp4')], [f('v1.mp4', 'video/mp4')]).errors[0]).toMatch(/1 video/);
    expect(checkAttachments(imgs(2, 'n'), imgs(4)).ok).toHaveLength(1); // đã có 4 ảnh, chỉ thêm được 1
    expect(checkAttachments([f('x.mp4', 'video/mp4')], imgs(5)).ok).toHaveLength(1); // 5 ảnh + 1 video = đúng 6 tệp: được
    expect(checkAttachments([f('y.jpg', 'image/jpeg')], [...imgs(5), f('v.mp4', 'video/mp4')]).errors[0]).toMatch(/6 tệp/); // đã đủ 6: tệp thứ 7 bị chặn
  });
});
