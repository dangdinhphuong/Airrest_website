import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { sweepPendingAttachments } from '../services/support/support.service';
import { closeDb, count, db, freshDb, mkAdmin, one } from './support/db';
import { guestIp } from './support/flows';

// Storage giả: ghi nhớ object "đã tải lên" để headMedia trả đúng kích thước/loại thật (R2 không ép trong URL ký).
const store = vi.hoisted(() => ({ objects: new Map<string, { size: number; contentType: string }>(), deleted: [] as string[], n: 0 }));
vi.mock('../lib/storage', async (orig) => ({
  ...(await orig<typeof import('../lib/storage')>()),
  presignSupportUpload: async (type: string) => ({ key: `support/test/${++store.n}.${type.split('/')[1]}`, uploadUrl: 'https://r2.test/put', method: 'PUT' as const, headers: { 'Content-Type': type }, expiresIn: 300 }),
  headMedia: async (key: string) => store.objects.get(key) ?? null,
  deleteMedia: async (key: string) => { store.deleted.push(key); store.objects.delete(key); },
  presignDownload: async (key: string) => `https://r2.test/get/${key}`,
}));

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const PHONE = '0912345678';
const MB = 1024 * 1024;

run('tích hợp: tệp đính kèm hỗ trợ', () => {
  const app = createApp();
  let ip = 0;
  let n = 0;
  const g = () => guestIp(++ip + 120);
  const mkTicket = async () => (await request(app).post('/v1/support').set(g()).set('Idempotency-Key', `at-${++n}-${Date.now()}`).send({ phone: PHONE, subject: 'Có bằng chứng', message: 'Tôi gửi kèm ảnh' })).body.ticket.code as string;
  const upload = (body: Record<string, unknown>) => request(app).post('/v1/support/attachments/upload-url').set(g()).set('Idempotency-Key', `up-${++n}-${Date.now()}`).send({ phone: PHONE, ...body });
  const confirm = (code: string, attachmentId: string, phone = PHONE) => request(app).post('/v1/support/attachments/confirm').set(g()).send({ code, phone, attachmentId });
  const put = (body: { key?: string; size: number; type: string }, id: string) => { // mô phỏng trình duyệt PUT lên R2: object mang tên khóa của dòng DB
    return one<{ storageKey: string }>('SELECT storage_key FROM support_attachments WHERE id = $1', [id]).then((r) => store.objects.set(r!.storageKey, { size: body.size, contentType: body.type }));
  };
  const addOk = async (code: string, type = 'image/jpeg', size = 1 * MB) => {
    const u = await upload({ code, contentType: type, size });
    expect(u.status).toBe(201);
    await put({ size, type }, u.body.attachmentId);
    const c = await confirm(code, u.body.attachmentId);
    expect(c.status).toBe(200);
    return u.body.attachmentId as string;
  };

  beforeAll(async () => { await freshDb({ roles: true }); });
  beforeEach(() => { store.objects.clear(); store.deleted.length = 0; });
  afterAll(async () => closeDb());

  it('luồng đầy đủ: xin URL → tải lên → xác nhận → READY, tra cứu ticket thấy tệp kèm URL tải', async () => {
    const code = await mkTicket();
    const id = await addOk(code, 'image/png', 2 * MB);
    const row = (await one<any>('SELECT * FROM support_attachments WHERE id = $1', [id]))!;
    expect(row.status).toBe('READY');
    expect(Number(row.sizeBytes)).toBe(2 * MB);
    const look = await request(app).post('/v1/support/lookup').set(g()).send({ code, phone: PHONE });
    expect(look.body.ticket.attachments).toHaveLength(1);
    expect(look.body.ticket.attachments[0]).toMatchObject({ id, contentType: 'image/png', sizeBytes: 2 * MB });
    expect(look.body.ticket.attachments[0].url).toMatch(/^https:\/\/r2\.test\/get\//);
    expect(await count('audit_logs', "action = 'SUPPORT.ATTACHMENT_ADD'")).toBeGreaterThanOrEqual(1);
  });

  it('chưa tải lên mà xác nhận: 409; xác nhận lại sau khi đã tải: 200 và xác nhận lần 2 vẫn 200 (idempotent)', async () => {
    const code = await mkTicket();
    const u = await upload({ code, contentType: 'image/webp', size: MB });
    expect((await confirm(code, u.body.attachmentId)).status).toBe(409);
    await put({ size: MB, type: 'image/webp' }, u.body.attachmentId);
    expect((await confirm(code, u.body.attachmentId)).status).toBe(200);
    expect((await confirm(code, u.body.attachmentId)).status).toBe(200);
  });

  it('tệp thật vượt dung lượng hoặc sai loại bị từ chối 422, object và dòng DB bị xóa', async () => {
    const code = await mkTicket();
    const big = await upload({ code, contentType: 'image/jpeg', size: MB });
    await put({ size: 9 * MB, type: 'image/jpeg' }, big.body.attachmentId); // khai 1 MB nhưng thực tế 9 MB
    const r = await confirm(code, big.body.attachmentId);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('ATTACHMENT_INVALID');
    expect(await count('support_attachments', 'id = $1', [big.body.attachmentId])).toBe(0);
    expect(store.deleted).toHaveLength(1);
    const wrong = await upload({ code, contentType: 'image/jpeg', size: MB });
    await put({ size: MB, type: 'text/html' }, wrong.body.attachmentId);
    expect((await confirm(code, wrong.body.attachmentId)).status).toBe(422);
  });

  it('khai báo sai ngay từ đầu: loại ngoài danh sách, quá dung lượng ảnh/video', async () => {
    const code = await mkTicket();
    expect((await upload({ code, contentType: 'application/pdf', size: MB })).status).toBe(422);
    expect((await upload({ code, contentType: 'image/jpeg', size: 6 * MB })).status).toBe(422);
    expect((await upload({ code, contentType: 'video/mp4', size: 31 * MB })).status).toBe(422);
    expect((await upload({ code, contentType: 'video/mp4', size: 30 * MB })).status).toBe(201);
  });

  it('hạn mức: tối đa 5 ảnh, 1 video, 6 tệp mỗi ticket', async () => {
    const code = await mkTicket();
    for (let i = 0; i < 5; i++) await addOk(code);
    const sixth = await upload({ code, contentType: 'image/jpeg', size: MB });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('ATTACHMENT_LIMIT');
    await addOk(code, 'video/mp4', 10 * MB);
    const second = await upload({ code, contentType: 'video/mp4', size: MB });
    expect(second.status).toBe(409);
  });

  it('sai mã ticket hoặc SĐT: 404, không lộ ticket tồn tại; tệp của ticket khác không xác nhận được', async () => {
    const a = await mkTicket();
    const b = await mkTicket();
    expect((await upload({ code: a, phone: '0987654321', contentType: 'image/jpeg', size: MB })).status).toBe(404);
    const u = await upload({ code: a, contentType: 'image/jpeg', size: MB });
    await put({ size: MB, type: 'image/jpeg' }, u.body.attachmentId);
    expect((await confirm(b, u.body.attachmentId)).status).toBe(404);
    expect((await confirm(a, u.body.attachmentId, '0987654321')).status).toBe(404);
  });

  it('ticket đã giải quyết không nhận thêm tệp', async () => {
    const code = await mkTicket();
    await db.query("UPDATE support_tickets SET status = 'RESOLVED' WHERE code = $1", [code]);
    expect((await upload({ code, contentType: 'image/jpeg', size: MB })).status).toBe(409);
  });

  it('admin xem được tệp đính kèm trong chi tiết ticket', async () => {
    const { token } = await mkAdmin([PERM.SUPPORT_HANDLE]);
    const code = await mkTicket();
    await addOk(code);
    const id = (await one<{ id: string }>('SELECT id FROM support_tickets WHERE code = $1', [code]))!.id;
    const res = await request(app).get(`/v1/admin/support/${id}`).set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].url).toMatch(/^https:\/\/r2\.test\/get\//);
  });

  it('job dọn: chỉ xóa PENDING quá hạn, giữ READY và PENDING còn mới', async () => {
    const code = await mkTicket();
    const keep = await addOk(code);
    const old = await upload({ code, contentType: 'image/jpeg', size: MB });
    const fresh = await upload({ code, contentType: 'image/jpeg', size: MB });
    await db.query("UPDATE support_attachments SET created_at = now() - interval '25 hours' WHERE id = $1", [old.body.attachmentId]);
    expect(await sweepPendingAttachments()).toBe(1);
    expect(await count('support_attachments', 'id = $1', [old.body.attachmentId])).toBe(0);
    expect(await count('support_attachments', 'id = ANY($1)', [[keep, fresh.body.attachmentId]])).toBe(2);
  });
});
