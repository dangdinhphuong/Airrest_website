// @vitest-environment jsdom
// Đặt phòng ngay trong chat (botBook): xác nhận rõ ràng, chống tạo trùng, chuyển sang SePay an toàn. data/user.js và cart.js được giả, không gọi mạng.
// Chạy: npx vitest run apps/web/src/screens/user/botBook.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = { createBooking: vi.fn(), quoteBooking: vi.fn(), listPaymentMethods: vi.fn(), saveLastBooking: vi.fn(), getHourlySlots: vi.fn() };
vi.mock('../../data/user', () => ({
  AT_HOTEL_ONLY: [{ id: 'AT_HOTEL', label: 'Thanh toán tại khách sạn' }],
  PAY_LABEL: { AT_HOTEL: 'Tại khách sạn', SEPAY: 'SePay' },
  bookingFieldError: (e) => (e?.code === 'GUESTS_EXCEED_CAPACITY' ? { field: 'guests', text: 'Quá sức chứa.' } : null),
  describeApiError: (e) => `Lỗi: ${e.message}`,
  createBooking: (...a) => api.createBooking(...a), quoteBooking: (...a) => api.quoteBooking(...a),
  listPaymentMethods: (...a) => api.listPaymentMethods(...a), saveLastBooking: (...a) => api.saveLastBooking(...a), getHourlySlots: (...a) => api.getHourlySlots(...a),
  airportName: (c) => c, getAirports: () => [{ iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }], listAirports: async () => [],
  lookupBookingFull: vi.fn(), lookupFlight: vi.fn(), understandText: async () => null, composeReply: async () => null, normalizeText: async () => null,
}));
vi.mock('./cart', async (orig) => ({ ...(await orig()), saveGuest: vi.fn(), savePay: vi.fn() })); // hourlyPriceOf thật
import { beginBook, bookFlow, parseHM } from './botBook';
import { reply } from './botEngine';

const hotel = { id: 'h1', name: 'Kênh Xanh Inn', freeCancel: true, room: { id: 'r1', name: 'Standard' } };
const search = (o = {}) => ({ dates: { checkIn: '2026-11-20', checkOut: '2026-11-21' }, party: { adults: 2, children: 0, rooms: 1 }, flags: [], airport: 'HAN', ...o });
const mk = (o = {}) => ({ search: search(), found: [hotel], ...o });
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const say = (mem, text) => bookFlow(text, norm(text), {}, mem);
const AT_HOTEL = [{ id: 'AT_HOTEL', label: 'Thanh toán tại khách sạn' }];
const BOTH = [...AT_HOTEL, { id: 'SEPAY', label: 'SePay', mode: 'live' }];
const ordered = (extra = {}) => ({ code: 'AR-7K3M9P2Q', status: 'PENDING', payment: { method: 'AT_HOTEL' }, pricing: { totalVnd: 740000 }, ...extra });
// Đi tới bước xác nhận: tên, SĐT, bỏ qua email (và chọn thanh toán nếu có nhiều cổng).
async function toConfirm(mem, ctx = {}, pay) {
  await beginBook(mem, ctx, hotel);
  await say(mem, 'Nguyễn Văn An');
  await say(mem, '0912 345 678');
  const r = await say(mem, 'Bỏ qua');
  return pay ? say(mem, pay) : r;
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listPaymentMethods.mockResolvedValue(AT_HOTEL);
  api.quoteBooking.mockResolvedValue({ nights: 1, roomVnd: 700000, serviceFeeVnd: 40000, totalVnd: 740000 });
});

describe('thu thông tin và tóm tắt', () => {
  it('hỏi tên → SĐT → email (tùy chọn) rồi tóm tắt kèm tổng tiền do backend tính; CHƯA tạo đơn', async () => {
    const mem = mk();
    expect((await beginBook(mem, {}, hotel)).text).toMatch(/họ và tên/);
    expect((await say(mem, 'Nguyễn Văn An')).text).toMatch(/điện thoại/);
    expect((await say(mem, '0912 345 678')).text).toMatch(/email/);
    const r = await say(mem, 'Bỏ qua');
    expect(r.text).toMatch(/Kênh Xanh Inn/);
    expect(r.text).toMatch(/Standard × 1/);
    expect(r.text).toMatch(/20\/11\/2026/);
    expect(r.text).toMatch(/tổng 740\.000/);
    expect(r.text).toMatch(/Nguyễn Văn An, SĐT 0912345678/);
    expect(r.chips).toEqual(['Xác nhận đặt', 'Sửa thông tin', 'Dừng']);
    expect(api.quoteBooking).toHaveBeenCalledWith({ hotelId: 'h1', rooms: [{ roomTypeId: 'r1', qty: 1 }], checkIn: '2026-11-20', checkOut: '2026-11-21' });
    expect(api.createBooking).not.toHaveBeenCalled();
  });
  it('họ tên/SĐT/email: câu hỏi mang slot riêng (để naturalize không đưa lời khách cho AI)', async () => {
    const mem = mk();
    expect(await beginBook(mem, {}, hotel)).toMatchObject({ say: 'ask', slot: 'name' });
    expect(await say(mem, 'An')).toMatchObject({ slot: 'phone' });
  });
  it('SĐT hoặc họ tên sai thì hỏi lại, không đi tiếp', async () => {
    const mem = mk();
    await beginBook(mem, {}, hotel);
    expect((await say(mem, '1')).slot).toBe('name');
    await say(mem, 'Nguyễn Văn An');
    expect((await say(mem, '12345')).text).toMatch(/chưa đúng/);
    expect(mem.step).toBe('phone');
  });
  it('khách đã đăng nhập: dùng sẵn họ tên và SĐT của tài khoản, nhảy tới bước email', async () => {
    const mem = mk();
    const r = await beginBook(mem, { user: { fullName: 'Trần Thị B', phone: '0987654321' } }, hotel);
    expect(r.slot).toBe('email');
    expect((await say(mem, 'Bỏ qua')).text).toMatch(/Trần Thị B, SĐT 0987654321/);
  });
  it('có nhiều cổng thanh toán thì hỏi hình thức; chọn online thì tóm tắt ghi rõ sẽ sang SePay', async () => {
    api.listPaymentMethods.mockResolvedValue(BOTH);
    const mem = mk();
    const r = await toConfirm(mem);
    expect(r.slot).toBe('pay');
    expect(r.chips).toEqual(['Thanh toán tại khách sạn', 'Thanh toán online qua SePay']);
    const s = await say(mem, 'Thanh toán online qua SePay');
    expect(s.text).toMatch(/Thanh toán: SePay/);
    expect(s.text).toMatch(/chuyển bạn sang trang thanh toán SePay/);
  });
  it('phòng theo giờ: chuyển sang trang khách sạn, không mở luồng đặt', async () => {
    const mem = mk({ search: search({ flags: ['hourly'] }) });
    const r = await beginBook(mem, {}, hotel);
    expect(r.actions[0].act).toEqual({ type: 'openProperty', id: 'h1' });
    expect(mem.flow).toBeUndefined();
  });
  it('chưa tìm gì (không có ngày/số khách) thì đưa khách đi tìm trước', async () => {
    const r = await beginBook({}, {}, hotel);
    expect(r.chips).toContain('Tìm & đặt phòng');
  });
});

describe('xác nhận trước khi đặt', () => {
  it('"ok", "được", "uh" KHÔNG tạo đơn: nhắc bấm đúng nút', async () => {
    const mem = mk();
    await toConfirm(mem);
    for (const t of ['ok', 'được', 'uh', 'đồng ý', 'đặt đi']) {
      const r = await say(mem, t);
      expect(r.text).toMatch(/chưa tạo đơn nào/);
    }
    expect(api.createBooking).not.toHaveBeenCalled();
  });
  it('"Xác nhận đặt" mới tạo đơn, với đúng dữ liệu và một idempotencyKey; xong thì đóng luồng', async () => {
    api.createBooking.mockResolvedValue(ordered());
    const mem = mk();
    await toConfirm(mem);
    const r = await say(mem, 'Xác nhận đặt');
    expect(api.createBooking).toHaveBeenCalledTimes(1);
    expect(api.createBooking.mock.calls[0][0]).toMatchObject({
      hotelId: 'h1', rooms: [{ roomTypeId: 'r1', qty: 1 }], guests: 2, children: 0, checkIn: '2026-11-20', checkOut: '2026-11-21', paymentMethod: 'AT_HOTEL',
      guest: { fullName: 'Nguyễn Văn An', phone: '0912345678' },
    });
    expect(api.createBooking.mock.calls[0][0].idempotencyKey).toMatch(/\S{8,}/);
    expect(r.text).toMatch(/AR-7K3M9P2Q/);
    expect(r.redirect).toBeUndefined();
    expect(api.saveLastBooking).toHaveBeenCalledWith('AR-7K3M9P2Q', '0912345678');
    expect(mem.flow).toBeNull();
    expect(mem.lastOrder).toEqual({ code: 'AR-7K3M9P2Q', phone: '0912345678' });
  });
  it('bấm xác nhận hai lần cùng lúc chỉ tạo MỘT đơn', async () => {
    let done; api.createBooking.mockImplementation(() => new Promise((res) => { done = () => res(ordered()); }));
    const mem = mk();
    await toConfirm(mem);
    const first = say(mem, 'Xác nhận đặt');
    await Promise.resolve();
    const second = await say(mem, 'Xác nhận đặt');
    expect(second.text).toMatch(/đang được xử lý/);
    done(); await first;
    expect(api.createBooking).toHaveBeenCalledTimes(1);
  });
  it('lỗi mạng: thử lại dùng CÙNG idempotencyKey (không tạo hai đơn)', async () => {
    api.createBooking.mockRejectedValueOnce(new Error('mất mạng')).mockResolvedValueOnce(ordered());
    const mem = mk();
    await toConfirm(mem);
    const r1 = await say(mem, 'Xác nhận đặt');
    expect(r1.text).toMatch(/chưa chắc đơn đã được tạo/);
    expect(mem.flow).toBe('book');
    await say(mem, 'Xác nhận đặt');
    const [k1, k2] = api.createBooking.mock.calls.map((c) => c[0].idempotencyKey);
    expect(k1).toBe(k2);
    expect(mem.flow).toBeNull();
  });
  it('hết phòng ngay lúc đặt: báo rõ, chưa có đơn, đóng luồng', async () => {
    api.createBooking.mockRejectedValue(Object.assign(new Error('sold'), { status: 409, code: 'SOLD_OUT' }));
    const mem = mk();
    await toConfirm(mem);
    const r = await say(mem, 'Xác nhận đặt');
    expect(r.text).toMatch(/vừa hết/);
    expect(r.redirect).toBeUndefined();
    expect(mem.flow).toBeNull();
  });
  it('lỗi nghiệp vụ theo trường (vượt sức chứa): giải thích và mở trang khách sạn', async () => {
    api.createBooking.mockRejectedValue(Object.assign(new Error('x'), { code: 'GUESTS_EXCEED_CAPACITY' }));
    const mem = mk();
    await toConfirm(mem);
    const r = await say(mem, 'Xác nhận đặt');
    expect(r.text).toMatch(/Quá sức chứa/);
    expect(r.actions[0].act.type).toBe('openProperty');
  });
  it('"Sửa thông tin" nhập lại từ đầu, "Dừng" bỏ hẳn; cả hai đều chưa tạo đơn', async () => {
    const mem = mk();
    await toConfirm(mem);
    expect((await say(mem, 'Sửa thông tin')).slot).toBe('name');
    await say(mem, 'Lê Văn C'); await say(mem, '0911111111'); await say(mem, 'Bỏ qua');
    const r = await say(mem, 'Dừng');
    expect(r.text).toMatch(/chưa tạo đơn nào/);
    expect(mem.flow).toBeNull();
    expect(api.createBooking).not.toHaveBeenCalled();
  });
});

describe('trả online (SePay)', () => {
  beforeEach(() => api.listPaymentMethods.mockResolvedValue(BOTH));
  it('đơn tạo xong mới trả redirect sang trang thanh toán, kèm nút dự phòng', async () => {
    api.createBooking.mockResolvedValue(ordered({ status: 'PENDING_PAYMENT', payment: { method: 'SEPAY' }, paymentLink: { payUrl: 'https://pay.sepay.vn/checkout/abc' } }));
    const mem = mk();
    await toConfirm(mem, {}, 'Thanh toán online qua SePay');
    expect(api.createBooking).not.toHaveBeenCalled();
    const r = await say(mem, 'Xác nhận đặt');
    expect(api.createBooking.mock.calls[0][0].paymentMethod).toBe('SEPAY');
    expect(r.redirect).toBe('https://pay.sepay.vn/checkout/abc');
    expect(r.actions[0]).toEqual({ label: 'Thanh toán ngay', act: { type: 'pay', url: 'https://pay.sepay.vn/checkout/abc' } });
    expect(r.text).toMatch(/740\.000/);
  });
  it('link thanh toán lạ (javascript:) không bao giờ được chuyển trang', async () => {
    api.createBooking.mockResolvedValue(ordered({ payment: { method: 'SEPAY' }, paymentLink: { payUrl: 'javascript:alert(1)' } }));
    const mem = mk();
    await toConfirm(mem, {}, 'Thanh toán online qua SePay');
    const r = await say(mem, 'Xác nhận đặt');
    expect(r.redirect).toBeUndefined();
    expect(JSON.stringify(r.actions)).not.toMatch(/javascript:/);
    expect(r.text).toMatch(/AR-7K3M9P2Q/);
  });
  it('đơn đã tạo nhưng chưa có link: dặn mở trang theo dõi, không chuyển trang', async () => {
    api.createBooking.mockResolvedValue(ordered({ payment: { method: 'SEPAY' }, paymentLink: { error: 'PAYMENT_UNAVAILABLE' } }));
    const mem = mk();
    await toConfirm(mem, {}, 'Thanh toán online qua SePay');
    const r = await say(mem, 'Xác nhận đặt');
    expect(r.redirect).toBeUndefined();
    expect(r.text).toMatch(/chưa lấy được link thanh toán/);
  });
  it('cổng online bị tắt đúng lúc đặt: tự chuyển sang thanh toán tại khách sạn và tóm tắt lại', async () => {
    api.createBooking.mockRejectedValue(Object.assign(new Error('off'), { code: 'SEPAY_DISABLED' }));
    const mem = mk();
    await toConfirm(mem, {}, 'Thanh toán online qua SePay');
    const r = await say(mem, 'Xác nhận đặt');
    expect(r.text).toMatch(/tạm tắt/);
    expect(r.text).toMatch(/Thanh toán: Tại khách sạn/);
    expect(mem.bk.pay).toBe('AT_HOTEL');
  });
});

describe('chọn nơi nghỉ từ kết quả tìm (qua reply)', () => {
  const two = [hotel, { ...hotel, id: 'h2', name: 'Sân Bay Palace', room: { id: 'r2', name: 'Deluxe' } }];
  const run = (mem, text) => reply(text, { airport: 'HAN', mem });
  it('"Đặt <tên>" (nút trên thẻ) vào luồng đặt đúng nơi nghỉ', async () => {
    const mem = mk({ found: two });
    expect((await run(mem, 'Đặt Sân Bay Palace')).text).toMatch(/Sân Bay Palace/);
    expect(mem.bk.hotel.id).toBe('h2');
  });
  it('chỉ có một kết quả: "đặt luôn" là đặt nơi đó; nhiều kết quả: hỏi chọn nơi nào', async () => {
    const one = mk();
    expect((await run(one, 'đặt luôn')).text).toMatch(/Kênh Xanh Inn/);
    const many = mk({ found: two });
    const r = await run(many, 'đặt phòng');
    expect(r.text).toMatch(/nơi nào/);
    expect(r.chips).toEqual(['Đặt Kênh Xanh Inn', 'Đặt Sân Bay Palace']);
    expect(many.flow).toBeUndefined();
  });
  it('chọn theo số thứ tự', async () => {
    const mem = mk({ found: two });
    await run(mem, 'đặt cái số 2');
    expect(mem.bk.hotel.id).toBe('h2');
  });
  it('"đặt phòng gần Cam Ranh dưới 700k" là tìm MỚI, không bị hiểu là chọn nơi cũ', async () => {
    const mem = mk();
    const r = await run(mem, 'đặt phòng gần Nội Bài dưới 700k');
    expect(mem.bk).toBeUndefined();
    expect(r.text).not.toMatch(/Mình đặt giúp bạn/);
  });
  it('"đặt xe" vẫn là luồng xe đưa đón, không phải đặt phòng', async () => {
    const mem = mk();
    await run(mem, 'đặt xe đưa đón');
    expect(mem.bk).toBeUndefined();
  });
});

describe('phòng theo giờ: số giờ, giờ vào (khung trống thật), tóm tắt và tạo đơn', () => {
  const CFG = { minHours: 2, maxHours: 6, firstHourVnd: 100000, nextHourVnd: 50000 };
  const hh = { id: 'h1', name: 'Kênh Xanh Inn', freeCancel: true, room: { id: 'r1', name: 'Standard', hourly: CFG } };
  const SLOTS = { slots: [
    { startsAt: '2026-11-20T01:00:00.000Z', time: '08:00', available: true },
    { startsAt: '2026-11-20T07:00:00.000Z', time: '14:00', available: true },
    { startsAt: '2026-11-20T07:30:00.000Z', time: '14:30', available: false, reason: 'FULL' },
    { startsAt: '2026-11-20T08:00:00.000Z', time: '15:00', available: true },
  ] };
  const hmem = (o = {}) => ({ search: search({ flags: ['hourly'] }), found: [hh], ...o });
  const toStart = async (mem, ctx = {}) => { await beginBook(mem, ctx, hh); return say(mem, '2 giờ'); };
  const toConfirmH = async (mem) => { await toStart(mem); await say(mem, '14:00'); await say(mem, 'Nguyễn Văn An'); await say(mem, '0912345678'); return say(mem, 'Bỏ qua'); };
  beforeEach(() => { api.getHourlySlots.mockResolvedValue(SLOTS); }); // không trả về mock: vitest coi giá trị trả về của beforeEach là hàm dọn dẹp và gọi nó sau test

  it('hỏi số giờ trước (nút kèm giá), chưa hỏi tên/SĐT', async () => {
    const mem = hmem();
    const r = await beginBook(mem, {}, hh);
    expect(r.text).toMatch(/Bạn muốn thuê mấy giờ\? \(từ 2 đến 6 giờ; giờ đầu 100\.000đ, mỗi giờ tiếp theo 50\.000đ\)/);
    expect(r.chips).toEqual([
      { label: '2 giờ (150.000đ)', text: '2 giờ' }, { label: '3 giờ (200.000đ)', text: '3 giờ' }, { label: '4 giờ (250.000đ)', text: '4 giờ' }, { label: '6 giờ (350.000đ)', text: '6 giờ' },
    ]);
    expect(mem.step).toBe('hours');
    expect(r.slot).toBeUndefined(); // không nhờ AI diễn đạt: câu có giờ/giá phải đúng từng chữ
  });
  it('số giờ ngoài khoảng cho phép thì hỏi lại, nói rõ khoảng', async () => {
    const mem = hmem();
    await beginBook(mem, {}, hh);
    const r = await say(mem, '9');
    expect(r.text).toMatch(/Số giờ cần từ 2 đến 6/);
    expect(mem.step).toBe('hours');
    expect(api.getHourlySlots).not.toHaveBeenCalled();
  });
  it('chọn số giờ: lấy khung trống thật cho đúng ngày/số giờ/số phòng, nút là các khung CÒN trống', async () => {
    const mem = hmem();
    const r = await toStart(mem);
    expect(api.getHourlySlots).toHaveBeenCalledWith('h1', { roomTypeId: 'r1', date: '2026-11-20', hours: 2, qty: 1 });
    expect(r.text).toMatch(/Còn trống từ 08:00 đến 15:00/);
    expect(r.chips).toEqual([{ label: '08:00', text: '08:00' }, { label: '14:00', text: '14:00' }, { label: '15:00', text: '15:00' }, 'Đổi số giờ']); // 14:30 đã kín nên không có nút
    expect(mem.step).toBe('start');
  });
  it('chọn giờ vào còn trống: sang hỏi tên; giờ ghi dạng linh hoạt (3pm, 14h00, 下午3点, 오후 3시)', async () => {
    for (const t of ['14:00', '14h00', '2 giờ chiều', '2pm', '下午2点', '오후 2시']) {
      const mem = hmem();
      await toStart(mem);
      const r = await say(mem, t);
      expect(mem.bk.hourly.startsAt).toBe('2026-11-20T07:00:00.000Z');
      expect(r.slot).toBe('name');
    }
  });
  it('giờ đã kín: nói lý do và gợi ý các khung gần nhất còn trống, vẫn ở bước chọn giờ', async () => {
    const mem = hmem();
    await toStart(mem);
    const r = await say(mem, '14:30');
    expect(r.text).toMatch(/14:30 không còn trống \(hết phòng\)\. Gần nhất còn trống: 08:00, 14:00, 15:00/);
    expect(r.chips.map((c) => (typeof c === 'string' ? c : c.text))).toEqual(['08:00', '14:00', '15:00', 'Đổi số giờ']);
    expect(mem.step).toBe('start');
    expect(mem.bk.hourly.startsAt).toBeNull();
  });
  it('giờ không nằm trong lịch (14:15) cũng gợi ý khung gần nhất, không chọn bừa', async () => {
    const mem = hmem();
    await toStart(mem);
    const r = await say(mem, '14:15');
    expect(r.text).toMatch(/không có trong lịch/);
    expect(mem.bk.hourly.startsAt).toBeNull();
  });
  it('không đọc được giờ thì hỏi lại; "Đổi số giờ" quay về bước số giờ', async () => {
    const mem = hmem();
    await toStart(mem);
    expect((await say(mem, 'lúc nào cũng được')).text).toMatch(/chưa hiểu giờ/);
    const back = await say(mem, 'Đổi số giờ');
    expect(back.text).toMatch(/mấy giờ/);
    expect(mem.step).toBe('hours');
    expect(mem.bk.hourly.hours).toBeNull();
  });
  it('hết khung trống trong ngày: nói rõ, gợi ý bớt số giờ hoặc tìm lại', async () => {
    api.getHourlySlots.mockResolvedValue({ slots: SLOTS.slots.map((x) => ({ ...x, available: false, reason: 'FULL' })) });
    const mem = hmem();
    const r = await toStart(mem);
    expect(r.text).toMatch(/không còn khung giờ trống cho 2 giờ/);
    expect(r.chips.map((c) => (typeof c === 'string' ? c : c.text))).toEqual(['Đổi số giờ', 'Tìm lại từ đầu']);
  });
  it('API khung giờ lỗi: báo lỗi, chưa có đơn, mở trang khách sạn', async () => {
    api.getHourlySlots.mockImplementation(async () => { throw new Error('mạng lỗi'); });
    const mem = hmem();
    await beginBook(mem, {}, hh);
    const r = await say(mem, '2 giờ');
    expect(api.getHourlySlots).toHaveBeenCalledTimes(1);
    expect(r.text).toMatch(/Chưa có đơn nào được tạo/);
    expect(r.actions[0].act.type).toBe('openProperty');
    expect(mem.flow).toBeNull();
  });
  it('tóm tắt ghi khoảng giờ (không phải nhận/trả phòng, số đêm), báo giá theo dòng GIỜ; chỉ tạo đơn khi xác nhận', async () => {
    const mem = hmem();
    const r = await toConfirmH(mem);
    expect(r.text).toMatch(/• Thời gian: ngày 20\/11\/2026, 14:00 → 16:00 \(2 giờ\)/);
    expect(r.text).not.toMatch(/Nhận phòng|đêm\)/);
    expect(api.quoteBooking).toHaveBeenCalledWith({ hotelId: 'h1', rooms: [{ roomTypeId: 'r1', qty: 1, kind: 'HOURLY', startsAt: '2026-11-20T07:00:00.000Z', hours: 2 }], checkIn: '2026-11-20', checkOut: '2026-11-21' });
    expect(api.createBooking).not.toHaveBeenCalled();
    api.createBooking.mockResolvedValue(ordered());
    await say(mem, 'Xác nhận đặt');
    expect(api.createBooking.mock.calls[0][0]).toMatchObject({ hotelId: 'h1', rooms: [{ roomTypeId: 'r1', qty: 1, kind: 'HOURLY', startsAt: '2026-11-20T07:00:00.000Z', hours: 2 }], guest: { fullName: 'Nguyễn Văn An', phone: '0912345678' } });
  });
  it('giờ ra qua nửa đêm có ghi "hôm sau"', async () => {
    api.getHourlySlots.mockResolvedValue({ slots: [{ startsAt: '2026-11-20T16:00:00.000Z', time: '23:00', available: true }] }); // 23:00 VN
    const mem = hmem();
    await toStart(mem);
    await say(mem, '23:00'); await say(mem, 'Nguyễn Văn An'); await say(mem, '0912345678');
    const r = await say(mem, 'Bỏ qua');
    expect(r.text).toMatch(/23:00 → 01:00 \(hôm sau\) \(2 giờ\)/);
  });
  it('chỉ có một lựa chọn số giờ (min = max): tự chọn, hỏi giờ vào luôn', async () => {
    const one = { ...hh, room: { ...hh.room, hourly: { ...CFG, minHours: 3, maxHours: 3 } } };
    const mem = { search: search({ flags: ['hourly'] }), found: [one] };
    const r = await beginBook(mem, {}, one);
    expect(api.getHourlySlots.mock.calls[0][1].hours).toBe(3);
    expect(r.text).toMatch(/bắt đầu lúc mấy giờ/);
  });
  it('khách sạn không có loại phòng theo giờ: không mở luồng, mở trang khách sạn', async () => {
    const none = { ...hh, room: { id: 'r1', name: 'Standard' } };
    const r = await beginBook({ search: search({ flags: ['hourly'] }), found: [none] }, {}, none);
    expect(r.actions[0].act).toEqual({ type: 'openProperty', id: 'h1' });
  });
  it('tiếng Anh: câu, nút và tóm tắt đúng ngôn ngữ; nút gửi giá trị tiếng Việt chuẩn', async () => {
    const mem = hmem({ lang: 'en' });
    const r = await beginBook(mem, {}, hh);
    expect(r.text).toMatch(/How many hours would you like\? \(2 to 6 hours; first hour 100\.000đ, each additional hour 50\.000đ\)/);
    expect(r.chips[0]).toEqual({ label: '2 hours (150.000đ)', text: '2 giờ' });
    const s = await say(mem, '2');
    expect(s.text).toMatch(/What time would you like to start on 20\/11\/2026\? Free from 08:00 to 15:00/);
    await say(mem, '14:00'); await say(mem, 'John Smith'); await say(mem, '0912345678');
    const sum = await say(mem, 'skip');
    expect(sum.text).toMatch(/• Time: 20\/11\/2026, 14:00 → 16:00 \(2 hour\(s\)\)/);
  });
});

describe('parseHM', () => {
  it.each([['14:30', '14:30'], ['14h30', '14:30'], ['3pm', '15:00'], ['3 giờ chiều', '15:00'], ['下午3点', '15:00'], ['오후 3시', '15:00'], ['9', '09:00'], ['12am', '00:00'], ['9 sáng', '09:00'], ['25:00', null], ['abc', null]])('%s -> %s', (t, hm) => expect(parseHM(t)).toBe(hm));
});
