import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export interface MailMessage { to: string; toName?: string; subject: string; text: string; html?: string }
/** disabled=true: không thể gửi thật (production thiếu SMTP_URL) -> processOutbox không nhận thư, thư giữ nguyên PENDING. */
export interface MailTransport { send(m: MailMessage): Promise<void>; disabled?: boolean }

/** Che email để ghi log: "nguyenvan@gmail.com" -> "n***@gmail.com". */
export const maskEmail = (e: string) => e.replace(/^(.).*@/, '$1***@');

const logTransport: MailTransport = {
  async send(m) {
    logger.info({ to: maskEmail(m.to), subject: m.subject }, 'Email (chưa cấu hình SMTP_URL, chỉ ghi log, không gửi)');
  },
};

let cached: MailTransport | undefined;
export function getTransport(): MailTransport {
  if (cached) return cached;
  if (!env.SMTP_URL) {
    if (env.NODE_ENV !== 'production') return (cached = logTransport);
    logger.warn('SMTP_URL chưa đặt ở production: email KHÔNG được gửi, thư giữ PENDING trong outbox đến khi cấu hình SMTP_URL'); // getTransport cache => cảnh báo một lần
    return (cached = { disabled: true, async send() { throw new Error('SMTP_URL chưa cấu hình'); } });
  }
  const t = nodemailer.createTransport(env.SMTP_URL);
  return (cached = {
    async send(m) {
      await t.sendMail({ from: env.EMAIL_FROM, to: m.toName ? { name: m.toName, address: m.to } : m.to, subject: m.subject, text: m.text, html: m.html });
    },
  });
}
