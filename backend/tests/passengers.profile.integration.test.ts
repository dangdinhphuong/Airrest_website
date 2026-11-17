import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { closeDb, count, db, freshDb, mkAdmin, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const ip = (n: number) => ({ 'X-Forwarded-For': `10.78.0.${n}` }); // mỗi n một bucket rate limit riêng
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PHONE = '0912345678';

run('tích hợp: hồ sơ khách, cấu hình và ticket của tôi', () => {
  const app = createApp();
  let n = 0;
  let key = 0;
  const signup = async (username: string) => (await request(app).post('/v1/auth/passenger/register').set(ip(++n)).send({ email: `${username}@example.com`, username, password: 'MatKhau123', fullName: `Tên ${username}` })).body as { token: string; user: { id: string } };
  const patch = (token: string | undefined, body: object) => request(app).patch('/v1/me/profile').set(token ? bearer(token) : {}).send(body);
  const ticket = (token: string | undefined, subject = 'Cần hỗ trợ') =>
    request(app).post('/v1/support').set({ ...(token ? bearer(token) : {}), ...ip(++n), 'Idempotency-Key': `pf-${++key}-${Date.now()}` }).send({ phone: PHONE, subject, message: 'Nội dung hỗ trợ' });
  const mine = (token: string, q = '') => request(app).get(`/v1/me/tickets${q}`).set(bearer(token));

  beforeAll(async () => { await freshDb({ roles: true }); });
  afterAll(async () => closeDb());

  it('đăng ký trả preferences rỗng; sửa họ tên: /auth/me và đăng nhập lại thấy tên mới', async () => {
    const a = await signup('lan.anh');
    const me0 = await request(app).get('/v1/auth/me').set(bearer(a.token));
    expect(me0.body.user.preferences).toEqual({});
    const r = await patch(a.token, { fullName: '  Lan Anh Nguyễn ' });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ fullName: 'Lan Anh Nguyễn', username: 'lan.anh' });
    const login = await request(app).post('/v1/auth/passenger/login').set(ip(++n)).send({ username: 'lan.anh', password: 'MatKhau123' });
    expect(login.body.user.fullName).toBe('Lan Anh Nguyễn');
    expect(await count('audit_logs', "action = 'PASSENGER.UPDATE_PROFILE'")).toBeGreaterThanOrEqual(1);
  });

  it('cấu hình: lưu chuẩn hóa (mã sân bay in hoa), sửa họ tên không làm mất cấu hình, gửi {} thì xóa sạch', async () => {
    const a = await signup('minh.tri');
    const r = await patch(a.token, { preferences: { airport: 'sgn', adults: 2, children: 1, rooms: 1, paymentMethod: 'SEPAY' } });
    expect(r.status).toBe(200);
    expect(r.body.user.preferences).toEqual({ airport: 'SGN', adults: 2, children: 1, rooms: 1, paymentMethod: 'SEPAY' });
    await patch(a.token, { fullName: 'Trí Minh' });
    expect((await request(app).get('/v1/auth/me').set(bearer(a.token))).body.user.preferences.airport).toBe('SGN');
    expect((await patch(a.token, { preferences: {} })).body.user.preferences).toEqual({});
  });

  it('dữ liệu sai bị từ chối 422: sân bay lạ, số phòng/khách vượt, trường lạ (không nhận SĐT/email), body rỗng, họ tên rỗng', async () => {
    const a = await signup('bao.ngoc');
    for (const body of [
      { preferences: { airport: 'XXX' } },
      { preferences: { rooms: 9 } },
      { preferences: { adults: 30, children: 5 } },
      { preferences: { paymentMethod: 'BITCOIN' } },
      { preferences: { phone: '0912345678' } },
      { preferences: { email: 'a@b.vn' } },
      {},
      { fullName: '   ' },
    ]) expect((await patch(a.token, body)).status, JSON.stringify(body)).toBe(422);
    expect((await one<any>('SELECT preferences FROM accounts WHERE id = $1', [a.user.id]))!.preferences).toEqual({});
  });

  it('không có token: 401; tài khoản nhân sự không dùng được endpoint của khách: 403', async () => {
    expect((await patch(undefined, { fullName: 'X' })).status).toBe(401);
    expect((await request(app).get('/v1/me/tickets')).status).toBe(401);
    const { token } = await mkAdmin([]);
    expect((await patch(token, { fullName: 'X' })).status).toBe(403);
    expect((await mine(token)).status).toBe(403);
  });

  it('ticket gửi khi đăng nhập hiện ở "ticket của tôi" (kèm SĐT đã nhập); ticket khách vãng lai và của người khác thì không', async () => {
    const a = await signup('thu.ha');
    const b = await signup('quoc.viet');
    const t1 = (await ticket(a.token, 'Vấn đề A1')).body.ticket.code as string;
    const guest = (await ticket(undefined, 'Khách vãng lai')).body.ticket.code as string;
    await ticket(b.token, 'Của người khác');
    const t2 = (await ticket(a.token, 'Vấn đề A2')).body.ticket.code as string;
    const res = await mine(a.token);
    expect(res.status).toBe(200);
    expect(res.body.items.map((x: { code: string }) => x.code)).toEqual([t2, t1]); // mới nhất trước
    expect(res.body.items[0]).toMatchObject({ subject: 'Vấn đề A2', status: 'OPEN', phone: expect.stringMatching(/912345678$/) });
    expect(JSON.stringify(res.body)).not.toContain(guest);
    expect(res.body.nextCursor).toBeNull();
    expect((await one<any>('SELECT account_id FROM support_tickets WHERE code = $1', [guest]))!.accountId).toBeFalsy();
  });

  it('phân trang ticket theo cursor, không lặp, không sót', async () => {
    const a = await signup('hoai.nam');
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) codes.unshift((await ticket(a.token, `Ticket ${i}`)).body.ticket.code);
    const p1 = await mine(a.token, '?limit=2');
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).not.toBeNull();
    const p2 = await mine(a.token, `?limit=2&cursor=${p1.body.nextCursor}`);
    expect([...p1.body.items, ...p2.body.items].map((x: { code: string }) => x.code)).toEqual(codes);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('tra ticket bằng mã + SĐT vẫn dùng được cho ticket đã gắn tài khoản; xóa tài khoản không xóa ticket', async () => {
    const a = await signup('kim.chi');
    const code = (await ticket(a.token, 'Gắn tài khoản')).body.ticket.code as string;
    const look = await request(app).post('/v1/support/lookup').set(ip(++n)).send({ code, phone: PHONE });
    expect(look.status).toBe(200);
    await db.query('DELETE FROM accounts WHERE id = $1', [a.user.id]);
    expect(await count('support_tickets', 'code = $1', [code])).toBe(1);
  });
});
