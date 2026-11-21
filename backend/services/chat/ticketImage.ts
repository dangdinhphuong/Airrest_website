import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { safeTicket, type TicketFields } from './ticket';

// Đọc thẻ lên tàu TỪ ẢNH bằng model thị giác của Ollama. Ảnh chỉ tồn tại trong RAM của request: không ghi đĩa, không ghi log; xử lý xong thì ghi đè bằng 0 (xóa).
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Kiểm byte đầu tệp (không tin Content-Type): JPEG FFD8FF, PNG 89504E47, WebP "RIFF....WEBP".
export const isImage = (b: Buffer) =>
  (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b.length > 8 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
  (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP');

const SYSTEM = `Bạn đọc ảnh thẻ lên tàu / vé máy bay. Trả JSON gồm:
text: chép nguyên văn CHỈ dòng chữ in trên ảnh có số hiệu chuyến bay, ngày bay, giờ khởi hành và tên thành phố/mã sân bay. KHÔNG chép họ tên hành khách, mã đặt chỗ, số vé, số ghế.
flight: số hiệu chuyến (VN272, VJ456; bỏ dấu cách). date: YYYY-MM-DD, ngày KHỞI HÀNH. from, to: mã sân bay 3 chữ in hoa nếu ảnh có. time: HH:MM giờ khởi hành 24 giờ.
Chỉ lấy thứ NHÌN THẤY trong ảnh, KHÔNG suy đoán. Không chắc hoặc không có thì null. Không lấy giờ ra cổng/giờ lên tàu làm giờ khởi hành. Ảnh không phải thẻ lên tàu thì tất cả null.`;
const nullable = (type: string) => ({ type: [type, 'null'] });
const FORMAT = {
  type: 'object',
  properties: { text: { type: 'string' }, flight: nullable('string'), date: nullable('string'), from: nullable('string'), to: nullable('string'), time: nullable('string') },
  required: ['text', 'flight', 'date', 'from', 'to', 'time'], additionalProperties: false,
};
const outSchema = z.object({ text: z.string().catch('') }).passthrough();

export const ticketImageRequest = (b64: string) => ({
  model: env.OLLAMA_VISION_MODEL, stream: false, keep_alive: '30m', format: FORMAT,
  options: { temperature: 0, num_ctx: 4096, num_predict: 200 },
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Đọc thẻ lên tàu này.', images: [b64] }],
});

// Mỗi lượt đọc ảnh chiếm CPU nhiều: chỉ một lượt cùng lúc, lượt thừa trả null (trình duyệt quay về đọc chữ trên máy).
let busy = false;

// Không bao giờ ném lỗi: AI tắt/lỗi/quá hạn/kết quả không có căn cứ đều trả null. Mọi trường phải có trong đoạn chữ model chép lại (safeTicket).
export async function extractTicketFromImage(img: Buffer, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<TicketFields | null> {
  if (!env.AI_CHAT_ENABLED || busy) return null;
  busy = true;
  const t0 = Date.now();
  try {
    const res = await fetchImpl(`${env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(env.AI_VISION_TIMEOUT_MS),
      body: JSON.stringify(ticketImageRequest(img.toString('base64'))),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const out = JSON.parse(data.message?.content ?? '');
    const text = outSchema.parse(out).text;
    const ticket = safeTicket(text, out, now);
    logger.info({ ok: !!ticket, ms: Date.now() - t0, bytes: img.length }, 'chat.ticketImage'); // không ghi nội dung ảnh/chữ
    return ticket;
  } catch (e) {
    logger.warn({ err: (e as Error).message, ms: Date.now() - t0 }, 'chat.ticketImage failed');
    return null;
  } finally {
    img.fill(0); // xóa ảnh khỏi bộ nhớ ngay sau khi xử lý
    busy = false;
  }
}
