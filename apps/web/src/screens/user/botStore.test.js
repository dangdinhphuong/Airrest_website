// Giữ cuộc chat qua lần tải lại trang: lưu/khôi phục, quá hạn, dữ liệu nhạy cảm, bước xác nhận đặt tiền. Dùng storage giả, không đụng sessionStorage thật.
// Chạy: npx vitest run apps/web/src/screens/user/botStore.test.js
import { describe, expect, it } from 'vitest';
import { CHAT_KEY, CHAT_TTL_MS, clearChat, loadChat, saveChat } from './botStore';

const store = (init = {}) => { const m = { ...init }; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, raw: m }; };
const NOW = 1_800_000_000_000;
const msgs = (n = 2) => Array.from({ length: n }, (_, i) => ({ id: i, from: i % 2 ? 'user' : 'bot', text: `tin ${i}` }));

describe('lưu và khôi phục', () => {
  it('khứ hồi giữ nguyên tin nhắn, thẻ khách sạn, nút bấm và trạng thái luồng', () => {
    const st = store();
    const messages = [...msgs(2), { id: 2, from: 'bot', text: 'kết quả', hotels: [{ id: 'h1', name: 'Kênh Xanh Inn', room: { id: 'r1', price: 740000 }, chatBook: { label: 'Book X', text: 'Đặt X' } }], chips: [{ label: 'Skip', text: 'Bỏ qua' }], actions: [{ label: 'Xem', act: { type: 'stays' } }] }];
    const mem = { lang: 'en', hist: [{ role: 'user', text: 'xin chào' }], flow: 'search', step: 'dates', s: { airport: 'HAN', flags: [], skip: {} }, found: [{ id: 'h1' }], search: { dates: { checkIn: '2026-11-20', checkOut: '2026-11-21' } }, fails: 1 };
    expect(saveChat(st, messages, mem, NOW)).toBe(true);
    const r = loadChat(st, NOW + 1000);
    expect(r.messages).toEqual(messages);
    expect(r.mem).toEqual(mem);
  });
  it('không lưu redirect (không chuyển sang trang thanh toán lần nữa), tệp đính kèm và cờ nội bộ say/slot/known', () => {
    const st = store();
    saveChat(st, [{ id: 0, from: 'bot', text: 'Đơn đã tạo', redirect: 'https://pay.sepay.vn/x', attach: { code: 'SP-1', phone: '0912345678' }, say: 'ask', slot: 'name', known: 'x' }], {}, NOW);
    const m = loadChat(st, NOW).messages[0];
    expect(m).toEqual({ id: 0, from: 'bot', text: 'Đơn đã tạo' });
    expect(st.raw[CHAT_KEY]).not.toMatch(/pay\.sepay\.vn|SP-1/);
  });
  it('không lưu kết quả tra booking đầy đủ (mem.auth.full) và không để cờ busy bị kẹt', () => {
    const st = store();
    saveChat(st, msgs(), { auth: { ref: 'AR-7K3M9P2Q', phone: '0912345678', digits: '0912345678', full: { booking: { code: 'AR-7K3M9P2Q', guest: { fullName: 'Nguyễn Văn An' } } } }, flow: 'book', step: 'phone', bk: { hotel: { id: 'h1' }, busy: true, methods: [{ id: 'SEPAY' }], key: 'k-1' } }, NOW);
    expect(st.raw[CHAT_KEY]).not.toMatch(/Nguyễn Văn An/);
    const { mem } = loadChat(st, NOW);
    expect(mem.auth.full).toBeNull();
    expect(mem.auth.ref).toBe('AR-7K3M9P2Q');
    expect(mem.bk).toMatchObject({ busy: false, methods: null, key: 'k-1' }); // giữ idempotencyKey: xác nhận lại sau khi tải trang vẫn không tạo hai đơn
    expect(mem.flow).toBe('book');
  });
  it('trường lạ trong mem không được lưu', () => {
    const st = store();
    saveChat(st, msgs(), { lang: 'vi', secretToken: 'abc', fn: () => 1 }, NOW);
    expect(loadChat(st, NOW).mem).toEqual({ lang: 'vi' });
  });
  it('chỉ giữ 30 tin gần nhất', () => {
    const st = store();
    saveChat(st, msgs(80), {}, NOW);
    const { messages } = loadChat(st, NOW);
    expect(messages).toHaveLength(30);
    expect(messages.at(-1).id).toBe(79);
  });
});

describe('hết hạn, hỏng, bị chặn', () => {
  it('quá 2 giờ không hoạt động thì bỏ hết và xóa khỏi storage', () => {
    const st = store();
    saveChat(st, msgs(), { lang: 'zh' }, NOW);
    expect(loadChat(st, NOW + CHAT_TTL_MS - 1)).not.toBeNull();
    expect(loadChat(st, NOW + CHAT_TTL_MS + 1)).toBeNull();
    expect(st.raw[CHAT_KEY]).toBeUndefined();
  });
  it.each([['JSON hỏng', '{xxx'], ['sai phiên bản', JSON.stringify({ v: 2, savedAt: NOW, messages: msgs(), mem: {} })], ['không có tin nhắn', JSON.stringify({ v: 1, savedAt: NOW, messages: [], mem: {} })], ['thiếu mem', JSON.stringify({ v: 1, savedAt: NOW, messages: msgs() })]])('%s -> null và dọn sạch', (_n, raw) => {
    const st = store({ [CHAT_KEY]: raw });
    expect(loadChat(st, NOW)).toBeNull();
    expect(st.raw[CHAT_KEY]).toBeUndefined();
  });
  it('storage ném lỗi (chế độ riêng tư/bị chặn/đầy): không làm hỏng chat', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(saveChat(bad, msgs(), {}, NOW)).toBe(false);
    expect(loadChat(bad, NOW)).toBeNull();
    expect(() => clearChat(bad)).not.toThrow();
  });
  it('dữ liệu quá lớn: thu gọn còn 10 tin, vẫn quá thì không lưu', () => {
    const st = store();
    const big = 'x'.repeat(140_000); // 12 tin ~1,7 MB (quá 1,5 MB), thu còn 10 tin ~1,4 MB (vừa)
    const messages = Array.from({ length: 12 }, (_, i) => ({ id: i, from: 'bot', text: big }));
    expect(saveChat(st, messages, {}, NOW)).toBe(true);
    expect(loadChat(st, NOW).messages).toHaveLength(10);
    expect(saveChat(store(), [{ id: 0, from: 'bot', text: 'x'.repeat(1_600_000) }], {}, NOW)).toBe(false);
  });
});

describe('đang đặt phòng khi tải lại trang', () => {
  const book = (step) => ({ lang: 'vi', flow: 'book', step, bk: { hotel: { id: 'h1', name: 'Kênh Xanh Inn' }, room: { id: 'r1', name: 'Standard' }, name: 'An', phone: '0912345678', pay: 'AT_HOTEL', key: 'k-1' }, found: [{ id: 'h1', name: 'Kênh Xanh Inn' }], search: { dates: { checkIn: '2026-11-20', checkOut: '2026-11-21' }, party: { adults: 2, children: 0, rooms: 1 } } });
  it.each(['name', 'phone', 'email', 'pay'])('bước %s (chưa hiện tiền): khôi phục nguyên trạng để khách nhập tiếp', (step) => {
    const st = store();
    saveChat(st, msgs(), book(step), NOW);
    const { mem, messages } = loadChat(st, NOW);
    expect(mem.flow).toBe('book');
    expect(mem.step).toBe(step);
    expect(mem.bk.name).toBe('An');
    expect(messages).toHaveLength(2);
  });
  it.each([['vi', /chưa tạo đơn nào/], ['en', /no order has been created/], ['zh', /尚未创建任何订单/], ['ko', /아직 주문을 만들지 않았어요/]])('đang ở bước XÁC NHẬN (%s): hủy luồng, KHÔNG cho bấm xác nhận trên giá cũ, mời "Đặt" lại để tóm tắt lại', (lang, re) => {
    const st = store();
    saveChat(st, msgs(), { ...book('confirm'), lang }, NOW);
    const { mem, messages } = loadChat(st, NOW);
    expect(mem.flow).toBeNull();
    expect(mem.bk).toBeNull();
    expect(mem.found).toHaveLength(1); // vẫn đặt lại được bằng thẻ cũ
    expect(messages.at(-1)).toMatchObject({ from: 'bot', id: 2 });
    expect(messages.at(-1).text).toMatch(re);
  });
});
