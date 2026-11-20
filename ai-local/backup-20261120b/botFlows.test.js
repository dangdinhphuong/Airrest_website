// Kiểm tra hội thoại nhiều lượt của trợ lý chat (API được giả lập).
// Chạy: npx vitest run apps/web/src/screens/user/botFlows.test.js (từ thư mục gốc monorepo)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listHotels: vi.fn(), lookupBookingFull: vi.fn(), quoteCancel: vi.fn(), createChangeRequest: vi.fn(),
  quoteShuttle: vi.fn(), createShuttle: vi.fn(), createTicket: vi.fn(), lookupTicket: vi.fn(), lookupFlight: vi.fn(),
}));
vi.mock('../../data/user', async (orig) => ({
  ...(await orig()),
  ...api,
  listAirports: async () => [],
  getAirports: () => [{ iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }, { iata: 'SGN', name: 'Tân Sơn Nhất', city: 'TP.HCM' }],
  airportName: (c) => ({ HAN: 'Nội Bài', SGN: 'Tân Sơn Nhất' })[c] ?? c,
}));

vi.useFakeTimers({ toFake: ['Date'] }); // lib/time chốt 'hôm nay' lúc nạp module
vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
const { reply, norm } = await import('./botEngine');
const { parseDates, parseParty, parseTime } = await import('./botFlows');

const TODAY = '2026-11-14';
const room = (price) => ({ price, availableRooms: 3, maxOccupancy: 4, name: 'Std' });
const hotel = (id, price) => ({ id, name: `KS ${id}`, distanceKm: 3, travelMinutes: 10, rooms: [room(price)], shuttleAvailable: true, room: room(price) });
const booking = (o = {}) => ({ booking: { code: 'AR-7K3M9P2Q', status: 'CONFIRMED', hotel: { name: 'KS A' }, stay: { type: 'NIGHT', from: '2026-11-20', to: '2026-11-21' }, lines: [], ...o }, shuttles: [] });
const say = (mem, text) => reply(text, { airport: 'HAN', mem });

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); });

describe('parse thuần', () => {
  it('parseDates', () => {
    expect(parseDates(norm('20/11 - 22/11'), TODAY)).toEqual({ checkIn: '2026-11-20', checkOut: '2026-11-22' });
    expect(parseDates(norm('ngày mai 2 đêm'), TODAY)).toEqual({ checkIn: '2026-11-15', checkOut: '2026-11-17' });
    expect(parseDates(norm('hôm nay'), TODAY)).toEqual({ checkIn: TODAY, checkOut: '2026-11-15' });
    expect(parseDates(norm('01/01'), TODAY)).toEqual({ checkIn: '2027-01-01', checkOut: '2027-01-02' }); // đã qua -> năm sau
    expect(parseDates(norm('31/02'), TODAY)).toBeNull();
    expect(parseDates(norm('dưới 700k'), TODAY)).toBeNull();
  });
  it('parseParty', () => {
    expect(parseParty(norm('2 người lớn 1 trẻ em 2 phòng'))).toEqual({ adults: 2, children: 1, rooms: 2 });
    expect(parseParty(norm('4 người'))).toEqual({ adults: 4, children: 0, rooms: 1 });
    expect(parseParty(norm('3 khách 1 trẻ em'))).toEqual({ adults: 2, children: 1, rooms: 1 });
    expect(parseParty(norm('ngày mai'))).toBeNull();
  });
  it('parseTime', () => {
    expect(parseTime('14h30 ngay mai')).toBe('14:30');
    expect(parseTime('9:05')).toBe('09:05');
    expect(parseTime('25h')).toBeNull();
    expect(parseTime('20/11')).toBeNull();
  });
});

describe('luồng tìm / đặt phòng', () => {
  it('hỏi lần lượt sân bay → ngày → khách → giá → km → tiện ích rồi trả thẻ có nút đặt', async () => {
    api.listHotels.mockResolvedValue(Object.assign([hotel('h1', 600000)], { total: 1 }));
    const mem = {};
    expect((await say(mem, 'tôi muốn đặt phòng')).text).toMatch(/sân bay nào/);
    expect((await say(mem, 'Nội Bài')).text).toMatch(/ngày nào/);
    expect((await say(mem, '20/11 - 22/11')).text).toMatch(/mấy người/);
    expect((await say(mem, '2 người 1 phòng')).text).toMatch(/Ngân sách/);
    expect((await say(mem, 'dưới 700k')).text).toMatch(/km/);
    expect((await say(mem, '5')).text).toMatch(/thêm gì/);
    expect((await say(mem, 'xe đưa đón')).chips).toContain('Tìm ngay');
    const r = await say(mem, 'tìm ngay');
    expect(r.hotels).toHaveLength(1);
    expect(r.hotels[0].act).toMatchObject({ type: 'book', hotelId: 'h1', airport: 'HAN', dates: { checkIn: '2026-11-20', checkOut: '2026-11-22' } });
    const p = api.listHotels.mock.calls[0][2];
    expect(p).toMatchObject({ maxPrice: 700000, maxKm: 5, shuttle: true, guests: 2, rooms: 1 });
    expect(mem.flow).toBeNull();
  });
  it('câu đầu đã đủ điều kiện thì tìm ngay, không hỏi', async () => {
    api.listHotels.mockResolvedValue(Object.assign([hotel('h1', 500000)], { total: 1 }));
    const r = await say({}, 'tìm phòng gần Nội Bài dưới 700k có xe đưa đón');
    expect(r.hotels).toHaveLength(1);
  });
  it('câu có giá/km nhưng KHÔNG nói sân bay thì hỏi sân bay, không tự lấy sân bay mặc định của app', async () => {
    api.listHotels.mockClear();
    api.listHotels.mockResolvedValue(Object.assign([hotel('h1', 500000)], { total: 1 }));
    const mem = {};
    const r = await say(mem, 'tìm phòng dưới 5 triệu trong 3 km');
    expect(r.text).toMatch(/sân bay nào/);
    expect(api.listHotels).not.toHaveBeenCalled();
    expect((await say(mem, 'Nội Bài')).hotels).toHaveLength(1);
    expect(api.listHotels.mock.calls[0][0]).toBe('HAN');
  });
  it('không có kết quả thì gợi ý nới điều kiện và bỏ giới hạn giá được', async () => {
    api.listHotels.mockResolvedValueOnce(Object.assign([], { total: 0 })).mockResolvedValueOnce(Object.assign([hotel('h2', 900000)], { total: 1 }));
    const mem = {};
    const r = await say(mem, 'tìm phòng gần Nội Bài dưới 300k');
    expect(r.chips).toContain('Bỏ giới hạn giá');
    const r2 = await say(mem, 'Bỏ giới hạn giá');
    expect(r2.hotels).toHaveLength(1);
    expect(api.listHotels.mock.calls[1][2].maxPrice).toBeUndefined();
  });
  it('chuyến bay chậm chuyển sang tìm nơi nghỉ với sân bay của chuyến', async () => {
    api.lookupFlight.mockResolvedValue({ code: 'VN218', origin: 'SGN', dest: 'HAN', status: 'delayed', delayMinutes: 120, schedTime: '10:00', newTime: '12:00' });
    const mem = {};
    const r = await say(mem, 'VN218 sao rồi');
    expect(r.text).toMatch(/chậm/);
    expect(r.text).toMatch(/ngày nào/);
    expect(mem.s.airport).toBe('SGN');
  });
});

describe('luồng hủy / đổi ngày', () => {
  it('tra booking đúng 1 lần, báo phí, chỉ gửi yêu cầu sau khi xác nhận', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    api.quoteCancel.mockResolvedValue({ tier: 'FREE', keepVnd: 0, refundVnd: 500000, shuttleKeepVnd: 0 });
    api.createChangeRequest.mockResolvedValue({ id: 'r1' });
    const mem = {};
    expect((await say(mem, 'tôi muốn hủy phòng')).text).toMatch(/mã booking/);
    expect((await say(mem, 'AR-7K3M9P2Q 0912345678')).chips).toContain('Hủy đặt phòng');
    expect((await say(mem, 'Hủy đặt phòng')).text).toMatch(/Lý do/);
    const q = await say(mem, 'Thay đổi kế hoạch');
    expect(q.text).toMatch(/hoàn lại 500\.000đ/);
    expect(api.createChangeRequest).not.toHaveBeenCalled();
    const done = await say(mem, 'Xác nhận hủy');
    expect(done.text).toMatch(/chưa phải đã hủy/);
    expect(api.createChangeRequest).toHaveBeenCalledTimes(1);
    expect(api.createChangeRequest.mock.calls[0][0]).toMatchObject({ type: 'CANCEL', code: 'AR-7K3M9P2Q', reasonCode: 'CHANGE_OF_PLAN' });
    expect(api.lookupBookingFull).toHaveBeenCalledTimes(1);
  });
  it('lý do khác bắt buộc có ghi chú; đơn đã hủy thì từ chối', async () => {
    api.lookupBookingFull.mockResolvedValue(booking({ status: 'CANCELLED' }));
    const mem = {};
    await say(mem, 'muốn hủy phòng');
    const r = await say(mem, 'AR-7K3M9P2Q 0912345678');
    expect(r.text).toMatch(/không còn hủy/);
    expect(mem.flow).toBeNull();
    api.lookupBookingFull.mockResolvedValue(booking());
    const mem2 = {};
    await say(mem2, 'muốn hủy phòng'); await say(mem2, 'AR-7K3M9P2Q 0912345678'); await say(mem2, 'Hủy đặt phòng');
    expect((await say(mem2, 'Lý do khác')).text).toMatch(/bắt buộc/);
  });
  it('đổi ngày: hỏi ngày mới rồi gửi newFrom/newTo; đơn theo giờ không đổi ngày', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    api.createChangeRequest.mockResolvedValue({});
    const mem = {};
    await say(mem, 'cho mình đổi ngày'); await say(mem, 'AR-7K3M9P2Q 0912345678'); await say(mem, 'Đổi ngày'); await say(mem, 'Sức khỏe');
    expect((await say(mem, '25/11 - 27/11')).chips).toContain('Gửi yêu cầu đổi ngày');
    await say(mem, 'Gửi yêu cầu đổi ngày');
    const body = api.createChangeRequest.mock.calls[0][0];
    expect(body.type).toBe('CHANGE');
    expect(body.newFrom.toISOString()).toBe('2026-11-25T07:00:00.000Z');
    api.lookupBookingFull.mockResolvedValue(booking({ lines: [{ kind: 'HOURLY' }] }));
    const mem2 = {};
    await say(mem2, 'đổi ngày'); const r = await say(mem2, 'AR-7K3M9P2Q 0912345678');
    expect(r.chips).toEqual(['Hủy đặt phòng']);
  });
  it('REQUEST_ALREADY_PENDING báo rõ, không gửi trùng', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    api.quoteCancel.mockResolvedValue({ tier: 'LATE', keepVnd: 1, refundVnd: 1, shuttleKeepVnd: 0 });
    api.createChangeRequest.mockRejectedValue(Object.assign(new Error('x'), { code: 'REQUEST_ALREADY_PENDING' }));
    const mem = {};
    await say(mem, 'muốn hủy phòng'); await say(mem, 'AR-7K3M9P2Q 0912345678'); await say(mem, 'Hủy đặt phòng'); await say(mem, 'Thay đổi kế hoạch');
    expect((await say(mem, 'Xác nhận hủy')).text).toMatch(/đang chờ khách sạn duyệt/);
  });
  it('khách dừng giữa chừng thì không gửi gì', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    const mem = {};
    await say(mem, 'muốn hủy phòng'); await say(mem, 'AR-7K3M9P2Q 0912345678');
    await say(mem, 'thôi');
    expect(mem.flow).toBeNull();
    expect(api.createChangeRequest).not.toHaveBeenCalled();
  });
});

describe('luồng xe đưa đón', () => {
  it('dùng lại booking đã tra, báo giá rồi mới đặt', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    api.quoteShuttle.mockResolvedValue({ priceVnd: 250000, distanceKm: 18, passengers: 2 });
    api.createShuttle.mockResolvedValue({});
    const mem = {};
    await say(mem, 'đặt xe đưa đón'); await say(mem, 'AR-7K3M9P2Q 0912345678');
    expect((await say(mem, 'Khách sạn → sân bay')).text).toMatch(/sân bay nào/);
    expect((await say(mem, 'Nội Bài')).text).toMatch(/Giờ đón/);
    const q = await say(mem, '23h59 31/12');
    expect(q.text).toMatch(/250\.000đ/);
    expect(api.createShuttle).not.toHaveBeenCalled();
    await say(mem, 'Đặt xe');
    expect(api.createShuttle).toHaveBeenCalledTimes(1);
    expect(api.createShuttle.mock.calls[0][0]).toMatchObject({ code: 'AR-7K3M9P2Q', direction: 'TO_AIRPORT', airport: 'HAN' });
    expect(api.lookupBookingFull).toHaveBeenCalledTimes(1);
  });
  it('đã tra booking ở bước trước thì không hỏi lại mã', async () => {
    api.lookupBookingFull.mockResolvedValue(booking());
    const mem = {};
    await say(mem, 'AR-7K3M9P2Q 0912345678');
    const r = await say(mem, 'đặt xe');
    expect(r.text).toMatch(/chiều nào/);
    expect(api.lookupBookingFull).toHaveBeenCalledTimes(1);
  });
});

describe('luồng khiếu nại và tra ticket', () => {
  it('thu loại, booking, mô tả, SĐT rồi chỉ gửi sau khi xác nhận', async () => {
    api.createTicket.mockResolvedValue({ code: 'SP-ABCD1234' });
    const mem = {};
    expect((await say(mem, 'tôi muốn khiếu nại')).chips).toContain('Vệ sinh');
    expect((await say(mem, 'Vệ sinh')).text).toMatch(/booking nào/);
    expect((await say(mem, 'Không liên quan booking')).text).toMatch(/mô tả/);
    expect((await say(mem, 'Phòng có gián và chăn bẩn từ lúc nhận phòng')).text).toMatch(/số điện thoại/);
    const s = await say(mem, '0912345678');
    expect(s.text).toMatch(/Vệ sinh/);
    expect(api.createTicket).not.toHaveBeenCalled();
    const r = await say(mem, 'Gửi khiếu nại');
    expect(r.text).toMatch(/SP-ABCD1234/);
    expect(r.attach).toEqual({ code: 'SP-ABCD1234', phone: '0912345678' }); // bot mở bước đính kèm ảnh/video
    expect(mem.lastTicket).toEqual({ code: 'SP-ABCD1234', phone: '0912345678' }); // nút "+" trong chat gửi thêm tệp vào ticket này
    expect(api.createTicket.mock.calls[0][0]).toMatchObject({ phone: '0912345678', bookingCode: undefined });
    expect(api.createTicket.mock.calls[0][0].subject).toMatch(/^\[Vệ sinh\]/);
  });
  it('mô tả có chữ "muốn hủy phòng" không làm đổi luồng', async () => {
    const mem = {};
    await say(mem, 'khiếu nại'); await say(mem, 'Khác'); await say(mem, 'Không liên quan booking');
    const r = await say(mem, 'tôi muốn hủy phòng nhưng khách sạn không cho hủy');
    expect(mem.flow).toBe('complaint');
    expect(r.text).toMatch(/số điện thoại/);
  });
  it('tra ticket bằng mã + SĐT', async () => {
    api.lookupTicket.mockResolvedValue({ code: 'SP-ABCD1234', status: 'IN_PROGRESS' });
    const mem = {};
    expect((await say(mem, 'SP-ABCD1234')).text).toMatch(/số điện thoại/);
    expect((await say(mem, '0912345678')).text).toMatch(/đang được xử lý/);
    expect(mem.lastTicket).toEqual({ code: 'SP-ABCD1234', phone: '0912345678' });
  });
  it('hỏi không hiểu 2 lần liên tiếp thì chuyển sang khiếu nại', async () => {
    const mem = {};
    expect((await say(mem, 'xyz abc')).text).toMatch(/chưa hiểu/);
    expect((await say(mem, 'qwe rty')).chips).toContain('Vệ sinh');
    expect(mem.flow).toBe('complaint');
  });
});
