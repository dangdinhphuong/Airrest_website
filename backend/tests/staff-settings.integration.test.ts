import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { closeDb, count, freshDb, mkAccount, mkAdmin, mkHotel, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const ip = (n: number) => ({ 'X-Forwarded-For': `10.91.0.${n}` }); // mỗi n một bucket rate limit riêng
const NEW = 'MatKhauMoi-2026!';

run('tích hợp: nhân sự tự đổi mật khẩu + hồ sơ', () => {
  const app = createApp();
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let hotel: string;
  const staffToken = (id: string, type: 'HOTEL' | 'ADMIN' = 'HOTEL') => signAccountToken({ sub: id, accountType: type });
  const patchPw = (t: string, b: object, n = 1) => request(app).patch('/v1/auth/password').set({ ...bearer(t), ...ip(n) }).send(b);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel();
  });
  afterAll(closeDb);

  it('đổi mật khẩu: sai hiện tại 400, mới = cũ 422, ngắn 422, không token 401', async () => {
    const id = await mkAccount({ type: 'HOTEL', email: 'a@x.vn', hotelId: hotel, roleIds: [await systemRoleId('hotel_owner')] });
    const t = staffToken(id);
    expect((await patchPw(t, { currentPassword: 'Sai-mat-khau-1', newPassword: NEW }, 2)).body.error.code).toBe('WRONG_CURRENT_PASSWORD');
    expect((await patchPw(t, { currentPassword: 'Pass12345678!', newPassword: 'Pass12345678!' }, 2)).body.error.code).toBe('SAME_PASSWORD');
    expect((await patchPw(t, { currentPassword: 'Pass12345678!', newPassword: 'ngan' }, 2)).status).toBe(422);
    expect((await request(app).patch('/v1/auth/password').set(ip(2)).send({ currentPassword: 'x', newPassword: NEW })).status).toBe(401);
  });

  it('đổi đúng -> 204, đăng nhập bằng mật khẩu mới, cũ không còn; audit không chứa mật khẩu', async () => {
    const id = await mkAccount({ type: 'ADMIN', email: 'ad@x.vn', roleIds: [await systemRoleId('SYSADMIN')], adminRole: 'SYSADMIN' });
    expect((await patchPw(staffToken(id, 'ADMIN'), { currentPassword: 'Pass12345678!', newPassword: NEW }, 3)).status).toBe(204);
    expect((await request(app).post('/v1/auth/login').set(ip(30)).send({ email: 'ad@x.vn', password: NEW })).status).toBe(200);
    expect((await request(app).post('/v1/auth/login').set(ip(30)).send({ email: 'ad@x.vn', password: 'Pass12345678!' })).status).toBe(401);
    const a = await one<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCOUNT.CHANGE_PASSWORD' AND entity_id = $1 AND (before::text LIKE '%Mat%' OR after::text LIKE '%Mat%' OR after::text LIKE '%Pass1%')", [id]);
    expect(a!.n).toBe(0);
    expect(await count('audit_logs', "action = 'ACCOUNT.CHANGE_PASSWORD' AND entity_id = $1", [id])).toBe(1);
  });

  it('hành khách bị chặn ở endpoint nhân sự (403)', async () => {
    const reg = await request(app).post('/v1/auth/passenger/register').set(ip(4)).send({ email: 'khach01@example.com', username: 'khach01', password: 'MatKhauKhach1', fullName: 'Khách' });
    const t = (reg.body.token ?? (await request(app).post('/v1/auth/passenger/login').set(ip(4)).send({ username: 'khach01', password: 'MatKhauKhach1' })).body.token) as string;
    expect(t).toBeTruthy();
    expect((await patchPw(t, { currentPassword: 'MatKhauKhach1', newPassword: NEW }, 4)).status).toBe(403);
    expect((await request(app).patch('/v1/auth/profile').set(bearer(t)).send({ fullName: 'Khách A' })).status).toBe(403);
  });

  it('rate limit: quá 10 lần/phút -> 429', async () => {
    const id = await mkAccount({ type: 'HOTEL', email: 'rl@x.vn', hotelId: hotel, roleIds: [await systemRoleId('hotel_owner')] });
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await patchPw(staffToken(id), { currentPassword: 'Sai-mat-khau-1', newPassword: NEW }, 50)).status;
    expect(last).toBe(429);
  });

  it('hồ sơ: sửa tên + SĐT, GET /auth/me có phone, email không đổi được, SĐT sai 422, phone null xóa', async () => {
    const id = await mkAccount({ type: 'HOTEL', email: 'hs@x.vn', hotelId: hotel, roleIds: [await systemRoleId('hotel_owner')] });
    const t = staffToken(id);
    const p = (b: object) => request(app).patch('/v1/auth/profile').set(bearer(t)).send(b);
    const ok = await p({ fullName: 'Nguyễn Văn B', phone: '0901 234 567', email: 'hack@x.vn' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ fullName: 'Nguyễn Văn B', phone: '0901 234 567', email: 'hs@x.vn' });
    expect((await one<{ email: string }>('SELECT email FROM accounts WHERE id = $1', [id]))!.email).toBe('hs@x.vn');
    expect((await request(app).get('/v1/auth/me').set(bearer(t))).body.user.phone).toBe('0901 234 567');
    expect((await p({ phone: 'abc' })).status).toBe(422);
    expect((await p({})).status).toBe(422);
    expect((await p({ phone: null })).body.user.phone).toBeNull();
  });

  it('mọi loại nhân sự (admin) dùng được; không cần quyền riêng', async () => {
    const a = await mkAdmin([PERM.AUDIT_READ]);
    expect((await patchPw(a.token, { currentPassword: 'Pass12345678!', newPassword: NEW }, 6)).status).toBe(204);
  });
});
