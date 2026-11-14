import { z } from 'zod';
import { env } from '../../config/env';
import { db, json } from '../../database/pg';
import { logger } from '../../lib/logger';
import { getTransport, type MailTransport } from './transport';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
/** Chuẩn hóa email; sai định dạng thì ném lỗi rõ ràng. */
export function normalizeEmail(raw: string): string {
  const r = emailSchema.safeParse(raw);
  if (!r.success) throw new Error(`Địa chỉ email không hợp lệ: "${String(raw).slice(0, 80)}"`);
  return r.data;
}

export interface EnqueueInput {
  to: string; toName?: string; template: string; payload?: Record<string, unknown>;
  subject: string; text: string; html?: string; dedupeKey?: string; bookingId?: string;
}

/** Ghi thư vào outbox. Trả { enqueued:false } nếu dedupeKey đã có (đã enqueue trước đó). Email sai -> ném lỗi, không ghi gì. */
export async function enqueueEmail(i: EnqueueInput): Promise<{ id?: string; enqueued: boolean }> {
  const to = normalizeEmail(i.to);
  const r = await db.query<{ id: string }>(
    `INSERT INTO email_outbox (to_email, to_name, template, payload, subject, body_text, body_html, dedupe_key, booking_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [to, i.toName ?? null, i.template, json(i.payload ?? {}), i.subject, i.text, i.html ?? null, i.dedupeKey ?? null, i.bookingId ?? null],
  );
  return r.rows[0] ? { id: r.rows[0].id, enqueued: true } : { enqueued: false };
}

const LEASE_SEC = 300; // worker chết giữa chừng: sau ngần này giây thư SENDING được nhặt lại
const backoffSec = (attempts: number) => Math.min(30 * 2 ** (attempts - 1), 3600); // 30s, 60s, 120s ... tối đa 1 giờ

/**
 * Lấy tối đa `batchSize` thư đến hạn rồi gửi. Nhận thư bằng một UPDATE ... FOR UPDATE SKIP LOCKED (tăng attempts + gia hạn thuê),
 * nên nhiều instance cùng chạy không gửi trùng một thư. Trả số thư gửi được / lỗi.
 */
export async function processOutbox(batchSize = 10, transport: MailTransport = getTransport(), maxAttempts = env.EMAIL_MAX_ATTEMPTS): Promise<{ sent: number; failed: number }> {
  if (transport.disabled) return { sent: 0, failed: 0 }; // không nhận thư => không mất thư, không đánh dấu SENT, không tăng attempts
  const claimed = (
    await db.query<any>(
      `UPDATE email_outbox SET status = 'SENDING', attempts = attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
       WHERE id IN (SELECT id FROM email_outbox WHERE status IN ('PENDING','FAILED','SENDING') AND next_attempt_at <= now()
                    ORDER BY next_attempt_at, seq LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING id, to_email, to_name, subject, body_text, body_html, attempts`,
      [batchSize, LEASE_SEC],
    )
  ).rows;
  let sent = 0;
  let failed = 0;
  for (const m of claimed) {
    try {
      await transport.send({ to: m.toEmail, toName: m.toName, subject: m.subject, text: m.bodyText, html: m.bodyHtml });
      await db.query("UPDATE email_outbox SET status = 'SENT', sent_at = now(), last_error = NULL WHERE id = $1", [m.id]);
      sent++;
    } catch (err) {
      failed++;
      const dead = m.attempts >= maxAttempts;
      await db.query(
        `UPDATE email_outbox SET status = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4) WHERE id = $1`,
        [m.id, dead ? 'DEAD' : 'FAILED', String((err as Error)?.message ?? err).slice(0, 500), backoffSec(m.attempts)],
      );
      logger.warn({ emailId: m.id, attempts: m.attempts, dead }, 'Gửi email lỗi');
    }
  }
  return { sent, failed };
}

/** Chạy processOutbox mỗi 10 giây. Trả hàm dừng. Đăng ký trong server.ts. */
export function startEmailWorker(): () => void {
  let running = false; // không chồng lượt trong cùng tiến trình
  const t = setInterval(() => {
    if (running) return;
    running = true;
    void processOutbox().catch((err) => logger.error({ err }, 'Worker email lỗi')).finally(() => { running = false; });
  }, 10_000);
  t.unref();
  return () => clearInterval(t);
}
