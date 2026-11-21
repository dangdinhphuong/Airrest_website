import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { LOG_LEVEL: 'silent', AI_CHAT_ENABLED: true, OLLAMA_URL: 'http://ollama.test', OLLAMA_VISION_MODEL: 'v', AI_VISION_TIMEOUT_MS: 5000 } }));
import { extractTicketFromImage, isImage } from '../services/chat/ticketImage';

const now = new Date('2026-11-21T00:00:00Z');
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const ok = (o: unknown) => vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify(o) } }), { status: 200 })) as unknown as typeof fetch;
const good = { text: 'VN 272 N 24APR 19:50 HO CHI MINH CITY HANOI', flight: 'VN272', date: '2027-04-24', from: null, to: null, time: '19:50' };

describe('isImage: kiểm byte đầu tệp', () => {
  it('nhận JPEG/PNG/WebP, từ chối còn lại', () => {
    expect(isImage(jpeg())).toBe(true);
    expect(isImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe(true);
    expect(isImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe(false); // thiếu dữ liệu sau tiêu đề
    expect(isImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe(true);
    expect(isImage(Buffer.from('<script>alert(1)</script>'))).toBe(false);
  });
});

describe('extractTicketFromImage', () => {
  it('đọc đúng, gửi ảnh dạng base64 tới model thị giác rồi xóa ảnh khỏi bộ nhớ', async () => {
    const img = jpeg(); const f = ok(good);
    const r = await extractTicketFromImage(img, f, now);
    expect(r).toEqual({ flight: 'VN272', date: '2027-04-24', time: '19:50' });
    const sent = JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(sent.model).toBe('v');
    expect(sent.messages[1].images).toHaveLength(1);
    expect(img.every((b) => b === 0)).toBe(true); // đã ghi đè bằng 0
  });
  it('số hiệu không có trong chữ model chép lại thì null (chống bịa)', async () => {
    expect(await extractTicketFromImage(jpeg(), ok({ ...good, flight: 'VN999' }), now)).toBeNull();
  });
  it('Ollama lỗi thì null và vẫn xóa ảnh', async () => {
    const img = jpeg();
    expect(await extractTicketFromImage(img, vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch, now)).toBeNull();
    expect(img.every((b) => b === 0)).toBe(true);
  });
});
