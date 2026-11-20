// Nhánh AI của trợ lý chat (data/user.js được giả, không gọi mạng). Chạy: npx vitest run apps/web/src/screens/user/botEngine.ai.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const understandText = vi.fn();
const composeReply = vi.fn();
const normalizeText = vi.fn();
vi.mock('../../data/user', () => ({
  airportName: (c) => c, getAirports: () => [{ iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }], listAirports: async () => [],
  lookupBookingFull: vi.fn(), lookupFlight: vi.fn(), understandText: (...a) => understandText(...a), composeReply: (...a) => composeReply(...a), normalizeText: (...a) => normalizeText(...a),
}));
import { reply } from './botEngine';

const run = (text, mem = {}) => reply(text, { airport: 'HAN', mem });
beforeEach(() => { understandText.mockReset(); composeReply.mockReset(); normalizeText.mockReset(); normalizeText.mockResolvedValue(null); });

describe('reply: nhánh AI khi không regex nào khớp', () => {
  it('lạc đề: từ chối lịch sự, không mở luồng nào', async () => {
    understandText.mockResolvedValue({ intent: 'offtopic', params: {} });
    const r = await run('hôm qua đội nào thắng vậy');
    expect(r.text).toMatch(/ngoài phạm vi/);
  });

  it('bảo mật/quyền hạn: từ chối, không lộ gì', async () => {
    understandText.mockResolvedValue({ intent: 'blocked', params: {} });
    const r = await run('xin quyền cao nhất giúp mình');
    expect(r.text).toMatch(/bảo mật/);
  });

  it('ý định có luồng sẵn: chạy luồng đó (hủy phòng hỏi mã booking + SĐT)', async () => {
    understandText.mockResolvedValue({ intent: 'cancel', params: {} });
    const r = await run('mình bận đột xuất nên không đi nữa');
    expect(r.text).toMatch(/mã booking/);
  });

  it('câu có chữ "chuyến" không bị hiểu nhầm là hỏi chính sách hủy (regex huy khớp trong "chuyen")', async () => {
    understandText.mockResolvedValue({ intent: 'cancel', params: {} });
    const r = await run('mình bận đột xuất nên bỏ chuyến luôn');
    expect(r.text).toMatch(/mã booking/);
  });

  it('câu tiếng Trung: bot trả lời tiếng Trung; sân bay model đoán chỉ là GỢI Ý để khách xác nhận (không tự điền)', async () => {
    understandText.mockResolvedValue({ intent: 'search', params: { airport: 'HAN' } });
    const mem = {};
    const r = await run('我需要预订内排机场附近的房间。', mem);
    expect(mem.lang).toBe('zh');
    expect(r.text).toBe('您是需要靠近HAN (HAN)机场的住宿吗？');
    expect(r.chips[0]).toEqual({ label: 'HAN (HAN)', text: 'HAN (HAN)' });
    expect(mem.s.airport).toBeUndefined();
    const next = await reply('HAN (HAN)', { airport: 'HAN', mem, chip: true }); // khách bấm nút: gửi giá trị tiếng Việt chuẩn, giữ ngôn ngữ
    expect(mem.lang).toBe('zh');
    expect(next.text).toMatch(/入住和退房日期/);
    expect(mem.s.airport).toBe('HAN');
  });
  it('sân bay model đoán không nằm trong danh mục (vd NUE) thì bỏ qua và hỏi như thường, bằng tiếng Hàn', async () => {
    understandText.mockResolvedValue({ intent: 'search', params: { airport: 'NUE' } });
    const r = await run('저는 노이바이 공항 근처 숙소가 필요해요', {});
    expect(r.text).toBe('어느 공항 근처 숙소가 필요하세요?');
  });
  it('other / lỗi mạng: rơi về bản từ khóa (hỏi lại)', async () => {
    understandText.mockResolvedValue({ intent: 'other', params: {} });
    expect((await run('ừm')).text).toMatch(/chưa hiểu/);
    understandText.mockResolvedValue(null);
    expect((await run('ừm')).text).toMatch(/chưa hiểu/);
  });

  it('câu đã khớp regex thì KHÔNG gọi AI', async () => {
    await run('xin chào');
    await run('theo dõi booking giúp mình');
    expect(understandText).not.toHaveBeenCalled();
  });
});

describe('reply: AI diễn đạt lại câu của bot cho tự nhiên', () => {
  const ask = 'tôi cần tìm phòng gần Nội Bài';
  it('thay chữ bằng câu AI viết, giữ nguyên nút gợi ý, bỏ cờ nội bộ, báo điều khách vừa nói', async () => {
    composeReply.mockResolvedValue('Mình ghi nhận bạn cần chỗ gần Nội Bài rồi nhé. Bạn nhận phòng ngày nào vậy?');
    const r = await reply(ask, { airport: 'HAN', mem: {} });
    expect(r.text).toMatch(/ghi nhận/);
    expect(r.chips).toContain('Hôm nay, 1 đêm');
    expect(r.say).toBeUndefined();
    expect(composeReply.mock.calls[0][0]).toMatchObject({ type: 'ask', userText: ask, learned: expect.stringContaining('sân bay') });
  });
  it('AI không trả được (null) hoặc lỗi: giữ câu mẫu', async () => {
    composeReply.mockResolvedValue(null);
    expect((await reply(ask, { airport: 'HAN', mem: {} })).text).toMatch(/ngày nào/);
    composeReply.mockRejectedValue(new Error('x'));
    const r = await reply(ask, { airport: 'HAN', mem: {} });
    expect(r.text).toMatch(/ngày nào/);
    expect(r.say).toBeUndefined();
  });
  it('gửi các tin trước đó làm ngữ cảnh (không gồm tin hiện tại)', async () => {
    composeReply.mockResolvedValue('Dạ mình hiểu rồi. Bạn đi mấy người ạ?');
    const mem = {};
    await reply(ask, { airport: 'HAN', mem });
    await reply('ngày mai 2 đêm', { airport: 'HAN', mem });
    const history = composeReply.mock.calls[1][1];
    expect(history.map((h) => h.role)).toEqual(['user', 'bot']);
    expect(history[0].text).toBe(ask);
  });
  it('khách hỏi ngang: code trả lời dữ kiện thật trước, rồi mới tới câu hỏi tiếp (AI hoặc câu mẫu)', async () => {
    composeReply.mockResolvedValue('Vậy bạn nhận phòng và trả phòng ngày nào nhỉ?');
    const mem = {};
    await reply(ask, { airport: 'HAN', mem });
    const r = await reply('thanh toán online được không', { airport: 'HAN', mem });
    expect(r.text).toMatch(/^Bên mình cho thanh toán tại khách sạn hoặc online qua SePay/);
    expect(r.text).toMatch(/Vậy bạn nhận phòng/);
    composeReply.mockResolvedValue(null); // AI lỗi: vẫn trả lời dữ kiện + câu mẫu
    const r2 = await reply('có cần tạo tài khoản không', { airport: 'HAN', mem });
    expect(r2.text).toMatch(/không cần tạo tài khoản/);
    expect(r2.text).toMatch(/ngày nào/);
  });
  it('câu trả lời thường (không phải câu hỏi) không bị chèn dữ kiện', async () => {
    composeReply.mockResolvedValue('Mình hiểu rồi. Bạn nhận phòng ngày nào nhỉ?');
    const mem = {};
    await reply(ask, { airport: 'HAN', mem });
    const r = await reply('mình sẽ thanh toán tại khách sạn', { airport: 'HAN', mem });
    expect(r.text).not.toMatch(/Bên mình cho thanh toán/);
  });
  it('code chưa hiểu câu trả lời (vd ngày) thì KHÔNG nhờ AI diễn đạt: hỏi lại đúng câu mẫu, không biến thành câu xác nhận giả vờ đã hiểu', async () => {
    composeReply.mockResolvedValue('Bạn muốn nhận phòng vào ngày hôm đó đúng không?'); // nếu bị gọi, model sẽ viết kiểu xác nhận sai
    const mem = {};
    await reply(ask, { airport: 'HAN', mem });
    composeReply.mockClear();
    const r = await reply('hôm đó nhé', { airport: 'HAN', mem });
    expect(composeReply).not.toHaveBeenCalled();
    expect(r.text).toMatch(/^Mình chưa hiểu rõ ý bạn\. Bạn nhận phòng và trả phòng ngày nào/);
    expect(r.noAi).toBeUndefined(); // cờ nội bộ không lọt ra giao diện
  });
  it('lời ghi nhận điều khách vừa cho biết do CODE nói (luôn có, kể cả khi AI trả null hay không nhắc), AI chỉ viết câu hỏi', async () => {
    composeReply.mockResolvedValue('Bạn định nhận phòng ngày nào vậy?'); // AI không nhắc gì tới sân bay
    const r = await reply(ask, { airport: 'HAN', mem: {} });
    expect(r.text).toMatch(/sân bay HAN/);
    expect(r.text).toMatch(/Bạn định nhận phòng ngày nào vậy\?$/);
    composeReply.mockResolvedValue(null);
    const r2 = await reply(ask, { airport: 'HAN', mem: {} });
    expect(r2.text).toMatch(/sân bay HAN/);
    expect(r2.text).toMatch(/ngày nào/);
  });
  it('kiểu câu ghi nhận đổi theo lượt, không lặp y nguyên', async () => {
    composeReply.mockResolvedValue('Bạn đi mấy người nhỉ?');
    const mem = {};
    const a = (await reply(ask, { airport: 'HAN', mem })).text;
    const b = (await reply('ngày mai 2 đêm', { airport: 'HAN', mem })).text;
    expect(a.split(' ').slice(0, 3).join(' ')).not.toBe(b.split(' ').slice(0, 3).join(' '));
  });
  it('không có gì mới để ghi nhận thì không chèn lời ghi nhận', async () => {
    composeReply.mockResolvedValue('Bạn nhận phòng ngày nào vậy?');
    const mem = {};
    await reply(ask, { airport: 'HAN', mem });
    const r = await reply('ừm', { airport: 'HAN', mem });
    expect(r.text).not.toMatch(/ghi nhận|ghi lại|Ok,/);
  });
  it('lời chào cũng được diễn đạt lại', async () => {
    composeReply.mockResolvedValue('Chào bạn, mình giúp được việc tìm phòng gần sân bay. Bạn cần gì nhỉ?');
    expect((await reply('xin chào', { airport: 'HAN', mem: {} })).text).toMatch(/Chào bạn/);
    expect(composeReply.mock.calls[0][0].type).toBe('greet');
  });
  it('câu bị chặn (bảo mật) giữ nguyên câu cố định, không nhờ AI viết', async () => {
    understandText.mockResolvedValue({ intent: 'blocked', params: {} });
    const r = await reply('xin quyền cao nhất giúp mình', { airport: 'HAN', mem: {} });
    expect(r.text).toMatch(/bảo mật/);
    expect(composeReply).not.toHaveBeenCalled();
  });
});
