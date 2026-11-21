import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { isBlocked, mask } from './understand';

// Đọc giúp chữ OCR của thẻ lên tàu khi bộ regex ở trình duyệt (lib/ticketText.js) không rút ra được số hiệu + ngày bay.
// Chỉ nhận CHỮ (trình duyệt đã bỏ tên và mã đặt chỗ), không nhận ảnh. Model 3B hay bịa nên mọi trường phải CÓ CĂN CỨ trong chính chữ OCR.
export const ticketBodySchema = z.object({ text: z.string().trim().min(8).max(1500) });
export type TicketFields = { flight: string; date: string; from?: string; to?: string; time?: string };

const SYSTEM = `Bạn rút thông tin từ chữ OCR (có thể sai chữ, lẫn lộn) của thẻ lên tàu / vé máy bay.
Trả JSON: flight (số hiệu chuyến như VN7132, QH1234; bỏ dấu cách), date (YYYY-MM-DD, ngày KHỞI HÀNH), from và to (mã sân bay 3 chữ in hoa), time (HH:MM giờ khởi hành 24 giờ).
Chỉ lấy thứ có trong văn bản, KHÔNG suy đoán. Không chắc hoặc không có thì để null. Không lấy giờ ra cổng/giờ lên tàu làm giờ khởi hành. Năm 2 chữ số (15) là 20xx.`;
const SHOTS: [string, object][] = [
  ['BOARDING PASS Ho Chi Minh(SGN) Da Nang(DAD) 16 AUG 15 VN 7132 Departure 20:05 Gate 12 Boarding 19:35', { flight: 'VN7132', date: '2015-08-16', from: 'SGN', to: 'DAD', time: '20:05' }],
  ['Flight VJ 456  Date: 05/12/2026  HAN > SGN  Dep 6:40 AM', { flight: 'VJ456', date: '2026-12-05', from: 'HAN', to: 'SGN', time: '06:40' }],
  ['Thank you for flying with us. Seat 14A. Have a nice trip.', { flight: null, date: null, from: null, to: null, time: null }],
];
const nullable = (type: string) => ({ type: [type, 'null'] });
const FORMAT = {
  type: 'object',
  properties: { flight: nullable('string'), date: nullable('string'), from: nullable('string'), to: nullable('string'), time: nullable('string') },
  required: ['flight', 'date', 'from', 'to', 'time'], additionalProperties: false,
};
const outSchema = z.object({
  flight: z.string().nullable().catch(null), date: z.string().nullable().catch(null), from: z.string().nullable().catch(null),
  to: z.string().nullable().catch(null), time: z.string().nullable().catch(null),
});

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_MS = 86_400_000;
const num = (n: number) => `(?<!\\d)0?${n}(?!\\d)`;
const validDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);

// Mỗi trường phải thật sự xuất hiện trong chữ OCR (model bịa thì bỏ). Thiếu số hiệu hoặc ngày thì coi như không đọc được (null).
export function safeTicket(src: string, out: unknown, now = new Date()): TicketFields | null {
  const p = outSchema.safeParse(out);
  if (!p.success) return null;
  const up = src.toUpperCase();
  const compact = up.replace(/\s+/g, '');
  const flight = p.data.flight?.toUpperCase().replace(/\s+/g, '') ?? '';
  if (!/^[A-Z0-9]{2}\d{1,4}$/.test(flight) || !compact.includes(flight)) return null;

  const date = p.data.date ?? '';
  if (!validDate(date)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const hasMonth = new RegExp(num(m)).test(up) || up.includes(MONTHS[m - 1]!) || new RegExp(`THÁNG\\s*0?${m}(?!\\d)`).test(up);
  if (!new RegExp(num(d)).test(up) || !hasMonth) return null;
  const yearInText = up.includes(String(y)) || new RegExp(`(?<!\\d)${String(y).slice(2)}(?!\\d)`).test(up);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!yearInText && (t < now.getTime() - 2 * DAY_MS || t > now.getTime() + 370 * DAY_MS)) return null; // năm không có trong chữ: chỉ nhận ngày sắp tới

  const res: TicketFields = { flight, date };
  const code = (v: string | null) => (v && /^[A-Z]{3}$/.test(v.toUpperCase()) && new RegExp(`(?<![A-Z])${v.toUpperCase()}(?![A-Z])`).test(up) ? v.toUpperCase() : null);
  const from = code(p.data.from); const to = code(p.data.to);
  if (from && to && from !== to) { res.from = from; res.to = to; }
  const tm = /^(\d{2}):(\d{2})$/.exec(p.data.time ?? '');
  if (tm && Number(tm[1]) < 24 && Number(tm[2]) < 60 && new RegExp(`(?<!\\d)${tm[2]}(?!\\d)`).test(up) && (new RegExp(num(Number(tm[1]))).test(up) || new RegExp(num(Number(tm[1]) % 12)).test(up))) res.time = `${tm[1]}:${tm[2]}`;
  return res;
}

const MAX_PENDING = 2;
let pending = 0;

// Không bao giờ ném lỗi: AI tắt/lỗi/quá hạn/kết quả không có căn cứ đều trả null (trình duyệt báo không đọc được và mời nhập tay).
export async function extractTicket(text: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<TicketFields | null> {
  if (!env.AI_CHAT_ENABLED || pending >= MAX_PENDING) return null;
  const src = mask(text);
  if (isBlocked(src)) return null;
  pending += 1;
  const t0 = Date.now();
  try {
    const res = await fetchImpl(`${env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(env.AI_CHAT_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OLLAMA_MODEL, stream: false, keep_alive: '30m', format: FORMAT,
        options: { temperature: 0, num_ctx: 2048, num_predict: 120 },
        messages: [{ role: 'system', content: SYSTEM }, ...SHOTS.flatMap(([a, b]) => [{ role: 'user', content: a }, { role: 'assistant', content: JSON.stringify(b) }]), { role: 'user', content: src }],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const out = safeTicket(src, JSON.parse(data.message?.content ?? ''), now);
    logger.info({ ok: !!out, ms: Date.now() - t0 }, 'chat.ticket'); // không ghi nội dung chữ OCR
    return out;
  } catch (e) {
    logger.warn({ err: (e as Error).message, ms: Date.now() - t0 }, 'chat.ticket failed');
    return null;
  } finally {
    pending -= 1;
  }
}
