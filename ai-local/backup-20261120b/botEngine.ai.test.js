// Nhánh AI của trợ lý chat (data/user.js được giả, không gọi mạng). Chạy: npx vitest run apps/web/src/screens/user/botEngine.ai.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const understandText = vi.fn();
vi.mock('../../data/user', () => ({
  airportName: (c) => c, getAirports: () => [{ iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội' }], listAirports: async () => [],
  lookupBookingFull: vi.fn(), lookupFlight: vi.fn(), understandText: (...a) => understandText(...a),
}));
import { reply } from './botEngine';

const run = (text) => reply(text, { airport: 'HAN', mem: {} });
beforeEach(() => understandText.mockReset());

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
