// @vitest-environment jsdom
// Tải lại trang không mất cuộc chat: dựng ChatBot, chat, gỡ ra rồi dựng lại (giả lập F5) với cùng sessionStorage.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ reply: vi.fn() }));
vi.mock('./botEngine', () => ({ reply: (...a) => api.reply(...a) }));
vi.mock('./botFlows', () => ({ beginComplaint: vi.fn() }));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { browseAirport: 'HAN', user: null }, dispatch: vi.fn() }) }));
vi.mock('../../data/user', () => ({ ATTACH: { accept: 'image/*' }, attachFile: vi.fn(), checkAttachments: () => ({ ok: [], errors: [] }), describeApiError: (e) => e.message }));
vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn(), matchMedia: () => ({ add: vi.fn(), revert: vi.fn() }), utils: { toArray: () => [] }, from: vi.fn(), to: vi.fn() } }));
vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));
const { default: ChatBot } = await import('./ChatBot');
const { CHAT_KEY, CHAT_TTL_MS } = await import('./botStore');

const openChat = () => fireEvent.click(screen.getAllByLabelText('Mở trợ lý chat AIRREST')[0]);
const say = async (text) => { fireEvent.change(screen.getByLabelText('Nhập câu hỏi của bạn…'), { target: { value: text } }); fireEvent.click(screen.getByLabelText('Gửi')); };
const stored = () => JSON.parse(sessionStorage.getItem(CHAT_KEY));

beforeEach(() => {
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  api.reply.mockReset();
  api.reply.mockImplementation(async (text, ctx) => { ctx.mem.flow = 'search'; ctx.mem.step = 'dates'; ctx.mem.s = { airport: 'HAN', flags: [], skip: {} }; return { text: `Bot trả lời: ${text}`, chips: ['Hôm nay, 1 đêm'] }; });
});
afterEach(() => { cleanup(); });

describe('ChatBot: tải lại trang', () => {
  it('chat vài tin rồi tải lại: tin nhắn, nút gợi ý và trạng thái luồng vẫn còn; chat tiếp được', async () => {
    render(<ChatBot />);
    openChat();
    await say('tôi cần tìm phòng gần Nội Bài');
    await screen.findByText('Bot trả lời: tôi cần tìm phòng gần Nội Bài', {}, { timeout: 3000 });
    expect(stored().messages.map((m) => m.text)).toEqual([expect.stringContaining('Xin chào'), 'tôi cần tìm phòng gần Nội Bài', 'Bot trả lời: tôi cần tìm phòng gần Nội Bài']);
    expect(stored().mem).toMatchObject({ flow: 'search', step: 'dates', s: { airport: 'HAN' } });

    cleanup(); // F5: toàn bộ state React mất, chỉ còn sessionStorage
    render(<ChatBot />);
    openChat();
    expect(screen.getByText('tôi cần tìm phòng gần Nội Bài')).toBeTruthy();
    expect(screen.getByText('Bot trả lời: tôi cần tìm phòng gần Nội Bài')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hôm nay, 1 đêm' })).toBeTruthy(); // nút gợi ý của tin cuối còn bấm được

    await say('ngày mai');
    await screen.findByText('Bot trả lời: ngày mai', {}, { timeout: 3000 });
    expect(api.reply.mock.calls.at(-1)[1].mem).toMatchObject({ flow: 'search', step: 'dates', s: { airport: 'HAN' } }); // bot vẫn nhớ đang ở bước nào, đã biết sân bay nào
    expect(screen.getAllByText(/^Bot trả lời/)).toHaveLength(2);
    expect(stored().messages.at(-1).id).toBeGreaterThan(stored().messages.at(-2).id); // id tin mới không trùng id cũ sau khi khôi phục
  });

  it('chưa chat gì (chỉ mở trang): không tạo bản lưu và KHÔNG làm mới hạn 2 giờ của bản cũ', async () => {
    render(<ChatBot />);
    openChat();
    expect(sessionStorage.getItem(CHAT_KEY)).toBeNull();
    cleanup();
    const old = Date.now() - 3600_000;
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, savedAt: old, messages: [{ id: 0, from: 'bot', text: 'Tin cũ 1 giờ trước' }], mem: {} }));
    render(<ChatBot />);
    openChat();
    expect(screen.getByText('Tin cũ 1 giờ trước')).toBeTruthy();
    expect(stored().savedAt).toBe(old); // mở trang không được gia hạn
  });

  it('bản lưu quá 2 giờ: bắt đầu cuộc chat mới (lời chào), bản cũ bị xóa', async () => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, savedAt: Date.now() - CHAT_TTL_MS - 1000, messages: [{ id: 0, from: 'bot', text: 'Tin quá cũ' }], mem: {} }));
    render(<ChatBot />);
    openChat();
    expect(screen.queryByText('Tin quá cũ')).toBeNull();
    expect(screen.getByText(/Xin chào! Mình là trợ lý AIRREST/)).toBeTruthy();
    expect(sessionStorage.getItem(CHAT_KEY)).toBeNull();
  });

  it('cuộc chat tiếng Trung được khôi phục kèm giao diện tiếng Trung', async () => {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), messages: [{ id: 0, from: 'bot', text: '您好！' }, { id: 1, from: 'user', text: '我需要订房' }], mem: { lang: 'zh' } }));
    render(<ChatBot />);
    openChat();
    expect(screen.getByText('我需要订房')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入您的问题…')).toBeTruthy();
  });

  it('dữ liệu lưu bị hỏng: bỏ qua, chat bình thường với lời chào', () => {
    sessionStorage.setItem(CHAT_KEY, '{không phải json');
    render(<ChatBot />);
    openChat();
    expect(screen.getByText(/Xin chào! Mình là trợ lý AIRREST/)).toBeTruthy();
  });
});
