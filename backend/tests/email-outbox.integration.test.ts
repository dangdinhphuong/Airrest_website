import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enqueueEmail, processOutbox } from '../services/email/outbox';
import type { MailMessage, MailTransport } from '../services/email/transport';
import { closeDb, count, db, freshDb, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const mail = (o: Partial<Parameters<typeof enqueueEmail>[0]> = {}) => ({ to: 'a@example.com', template: 't', subject: 'S', text: 'T', ...o });
const okTransport = (sent: MailMessage[] = []): MailTransport => ({ send: async (m) => void sent.push(m) });
const failing: MailTransport = { send: async () => { throw new Error('smtp down'); } };
const due = () => db.query("UPDATE email_outbox SET next_attempt_at = now() - interval '1 second' WHERE status IN ('PENDING','FAILED')");

run('tích hợp: email outbox', () => {
  beforeAll(() => freshDb());
  beforeEach(() => db.query('DELETE FROM email_outbox'));
  afterAll(() => closeDb());

  it('enqueue idempotent theo dedupeKey; email sai không ghi gì', async () => {
    expect((await enqueueEmail(mail({ dedupeKey: 'k1' }))).enqueued).toBe(true);
    expect((await enqueueEmail(mail({ dedupeKey: 'k1', to: 'b@example.com' }))).enqueued).toBe(false);
    await enqueueEmail(mail());
    await enqueueEmail(mail()); // không dedupeKey: ra hai thư
    expect(await count('email_outbox')).toBe(3);
    await expect(enqueueEmail(mail({ to: 'sai-email' }))).rejects.toThrow(/không hợp lệ/);
    expect(await count('email_outbox')).toBe(3);
  });

  it('gửi thành công -> SENT, chuẩn hóa email, không gửi lại lần 2', async () => {
    await enqueueEmail(mail({ to: ' A@Example.com ', toName: 'An', html: '<p>x</p>' }));
    const sent: MailMessage[] = [];
    expect(await processOutbox(10, okTransport(sent))).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]).toMatchObject({ to: 'a@example.com', toName: 'An', subject: 'S', html: '<p>x</p>' });
    expect((await one("SELECT status, sent_at FROM email_outbox"))).toMatchObject({ status: 'SENT' });
    expect(await processOutbox(10, okTransport(sent))).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('lỗi -> FAILED + backoff tăng dần; thư chưa đến hạn không bị gửi; quá số lần -> DEAD', async () => {
    await enqueueEmail(mail());
    const backoffs: number[] = [];
    for (let i = 1; i <= 3; i++) {
      expect(await processOutbox(10, failing, 3)).toEqual({ sent: 0, failed: 1 });
      const r = (await one<any>("SELECT status, attempts, last_error, extract(epoch FROM next_attempt_at - now()) AS wait FROM email_outbox"))!;
      expect(r.attempts).toBe(i);
      expect(r.lastError).toBe('smtp down');
      if (i < 3) { expect(r.status).toBe('FAILED'); backoffs.push(r.wait); expect(await processOutbox(10, okTransport())).toEqual({ sent: 0, failed: 0 }); await due(); }
      else expect(r.status).toBe('DEAD');
    }
    expect(backoffs[1]).toBeGreaterThan(backoffs[0]!);
    await due();
    expect(await processOutbox(10, okTransport())).toEqual({ sent: 0, failed: 0 }); // DEAD không gửi lại
  });

  it('thư SENDING quá hạn thuê (worker chết) được nhặt lại', async () => {
    await enqueueEmail(mail());
    await db.query("UPDATE email_outbox SET status = 'SENDING', attempts = 1, next_attempt_at = now() - interval '1 second'");
    expect(await processOutbox(10, okTransport())).toEqual({ sent: 1, failed: 0 });
  });

  it('hai worker song song không gửi trùng', async () => {
    for (let i = 0; i < 20; i++) await enqueueEmail(mail({ subject: `S${i}` }));
    const sent: MailMessage[] = [];
    const slow: MailTransport = { send: async (m) => { await new Promise((r) => setTimeout(r, 5)); sent.push(m); } };
    const [a, b] = await Promise.all([processOutbox(20, slow), processOutbox(20, slow)]);
    expect(a.sent + b.sent).toBe(20);
    expect(new Set(sent.map((m) => m.subject)).size).toBe(20);
    expect(sent).toHaveLength(20);
    expect(await count('email_outbox', "status = 'SENT'")).toBe(20);
  });

  it('transport disabled (production thiếu SMTP_URL): không nhận thư, giữ PENDING, không tăng attempts, gửi được khi có transport thật', async () => {
    let calls = 0;
    const off: MailTransport = { disabled: true, send: async () => void calls++ };
    await enqueueEmail(mail());
    expect(await processOutbox(10, off)).toEqual({ sent: 0, failed: 0 });
    expect(calls).toBe(0);
    expect(await one("SELECT status, attempts FROM email_outbox")).toMatchObject({ status: 'PENDING', attempts: 0 });
    const sent: MailMessage[] = [];
    expect(await processOutbox(10, okTransport(sent))).toEqual({ sent: 1, failed: 0 });
  });
});
