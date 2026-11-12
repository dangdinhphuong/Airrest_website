import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { createBookingVia } from './support/flows';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const ip = (n: number) => ({ 'X-Forwarded-For': `10.77.0.${n}` }); // mỗi n một bucket rate limit riêng
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86400_000;

run('tích hợp: tài khoản khách (PASSENGER)', () => {
  const app = createApp();
  let hotelId = '';
  let roomTypeId = '';

  const register = (body: object, n = 1) => request(app).post('/v1/auth/passenger/register').set(ip(n)).send(body);
  const login = (body: object, n = 1) => request(app).post('/v1/auth/passenger/login').set(ip(n)).send(body);
  const book = (token: string | undefined, key: string) =>
    request(app)
      .post('/v1/bookings')
      .set({ ...(token ? bearer(token) : {}), 'Idempotency-Key': key })
      .send({
        hotelId, roomTypeId, qty: 1, paymentMethod: 'AT_HOTEL', from: new Date(Date.now() + 10 * DAY).toISOString(), to: new Date(Date.now() + 11 * DAY).toISOString(),
        guest: { fullName: 'Khách A', phone: '0912345678' },
      });

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel();
    roomTypeId = await mkRoomType(hotelId, 50);
  });
  afterAll(async () => closeDb());

  it('đăng ký: 201 + token + user, đăng nhập luôn dùng được; không lộ hash; không tạo email', async () => {
    const res = await register({ username: '  Lan Anh ', password: 'MatKhau123', fullName: 'Lan Anh Nguyễn' }, 1);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ type: 'PASSENGER', username: 'Lan Anh', fullName: 'Lan Anh Nguyễn', permissions: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
    const me = await request(app).get('/v1/auth/me').set(bearer(res.body.token));
    expect(me.status).toBe(200);
    expect(me.body.auth).toMatchObject({ kind: 'ACCOUNT', accountType: 'PASSENGER', permissions: [] });
    expect(me.body.user).toMatchObject({ type: 'PASSENGER', fullName: 'Lan Anh Nguyễn', username: 'Lan Anh', permissions: [] });
    const row = await one<{ email: unknown; username: string }>("SELECT email, username FROM accounts WHERE type = 'PASSENGER'");
    expect(row!.email).toBeUndefined();
    expect(await count('audit_logs', "action = 'PASSENGER.REGISTER'")).toBe(1);
  });

  it('họ tên bỏ trống -> lấy tên đăng nhập; validate username/mật khẩu theo luật FE', async () => {
    const ok = await register({ username: 'Binh', password: 'MatKhau123' }, 2);
    expect(ok.status).toBe(201);
    expect(ok.body.user.fullName).toBe('Binh');
    for (const bad of [
      { username: 'a@b.vn', password: 'MatKhau123' }, // giống email
      { username: 'so0912345678', password: 'MatKhau123' }, // giống SĐT
      { username: 'x'.repeat(51), password: 'MatKhau123' },
      { username: '   ', password: 'MatKhau123' },
      { username: 'Cuong', password: '1234567' }, // < 8 ký tự
    ]) {
      const r = await register(bad, 2);
      expect(r.status, JSON.stringify(bad)).toBe(422);
    }
  });

  it('trùng username (không phân biệt hoa/thường) -> 409 USERNAME_TAKEN', async () => {
    const r = await register({ username: 'LAN ANH', password: 'MatKhau123' }, 3);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('đăng nhập: đúng -> token; sai mật khẩu / không tồn tại -> cùng 401 INVALID_CREDENTIALS, cùng nội dung', async () => {
    const good = await login({ username: 'lan anh', password: 'MatKhau123' }, 4);
    expect(good.status).toBe(200);
    expect(good.body.user.type).toBe('PASSENGER');
    const wrongPw = await login({ username: 'Lan Anh', password: 'SaiMatKhau1' }, 4);
    const ghost = await login({ username: 'khong-ton-tai', password: 'SaiMatKhau1' }, 4);
    expect(wrongPw.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrongPw.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(ghost.body.error.message).toBe(wrongPw.body.error.message);
  });

  it('đăng nhập nhân sự không bị ảnh hưởng; khách không đăng nhập được bằng /auth/login', async () => {
    const staff = await mkAdmin([PERM.AUDIT_READ], 'nv@airrest.vn');
    expect(staff.id).toBeTruthy();
    expect((await request(app).post('/v1/auth/login').send({ email: 'nv@airrest.vn', password: 'Pass12345678!' })).status).toBe(200);
    expect((await request(app).post('/v1/auth/login').send({ email: 'lananh@x.vn', password: 'MatKhau123' })).status).toBe(401);
  });

  it('rate limit: quá 10 lần/phút -> 429', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await login({ username: 'nobody', password: 'x' }, 50)).status;
    expect(last).toBe(429);
  });

  it('đổi mật khẩu: sai hiện tại -> 400; trùng cũ -> 422; ngắn -> 422; đúng -> 204 và đăng nhập bằng mật khẩu mới', async () => {
    const t = (await login({ username: 'Lan Anh', password: 'MatKhau123' }, 5)).body.token as string;
    const patch = (b: object) => request(app).patch('/v1/me/password').set({ ...bearer(t), ...ip(5) }).send(b);
    expect((await patch({ currentPassword: 'Sai12345678', newPassword: 'MatKhauMoi99' })).body.error.code).toBe('WRONG_CURRENT_PASSWORD');
    expect((await patch({ currentPassword: 'MatKhau123', newPassword: 'MatKhau123' })).status).toBe(422);
    expect((await patch({ currentPassword: 'MatKhau123', newPassword: 'ngan' })).status).toBe(422);
    expect((await patch({ currentPassword: 'MatKhau123', newPassword: 'MatKhauMoi99' })).status).toBe(204);
    expect((await login({ username: 'Lan Anh', password: 'MatKhau123' }, 5)).status).toBe(401);
    expect((await login({ username: 'Lan Anh', password: 'MatKhauMoi99' }, 5)).status).toBe(200);
    expect(JSON.stringify(await one("SELECT * FROM audit_logs WHERE action = 'PASSENGER.CHANGE_PASSWORD'"))).not.toContain('MatKhau');
    expect((await request(app).patch('/v1/me/password').send({ currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
  });

  it('đặt phòng: có token khách -> gắn account_id; vãng lai vẫn đặt được + tra cứu mã+SĐT; token sai coi như vãng lai', async () => {
    const t = (await login({ username: 'Lan Anh', password: 'MatKhauMoi99' }, 6)).body.token as string;
    const mine = await book(t, 'pax-key-0001');
    expect(mine.status).toBe(201);
    const row = await one<{ accountId: string }>('SELECT account_id FROM bookings WHERE code = $1', [mine.body.booking.code]);
    const acc = await one<{ id: string }>("SELECT id FROM accounts WHERE username = 'Lan Anh'");
    expect(row!.accountId).toBe(acc!.id);
    expect(JSON.stringify(mine.body)).not.toContain('accountId');

    const guest = await book(undefined, 'pax-key-0002');
    expect(guest.status).toBe(201);
    expect((await one<{ accountId?: string }>('SELECT account_id FROM bookings WHERE code = $1', [guest.body.booking.code]))!.accountId).toBeUndefined();
    expect((await request(app).post('/v1/bookings/lookup').set(ip(7)).send({ code: guest.body.booking.code, phone: '0912345678' })).status).toBe(200);

    const junk = await book('khong.phai.token', 'pax-key-0003');
    expect(junk.status).toBe(201);
    expect((await one<{ accountId?: string }>('SELECT account_id FROM bookings WHERE code = $1', [junk.body.booking.code]))!.accountId).toBeUndefined();
  });

  it('GET /me/bookings: chỉ đơn của mình, phân trang cursor, không lộ người khác', async () => {
    const t1 = (await login({ username: 'Lan Anh', password: 'MatKhauMoi99' }, 8)).body.token as string;
    const t2 = (await login({ username: 'Binh', password: 'MatKhau123' }, 8)).body.token as string;
    expect((await book(t1, 'pax-key-0004')).status).toBe(201);
    expect((await book(t2, 'pax-key-0005')).status).toBe(201);

    const p1 = await request(app).get('/v1/me/bookings?limit=1').set(bearer(t1));
    expect(p1.status).toBe(200);
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await request(app).get(`/v1/me/bookings?limit=5&cursor=${p1.body.nextCursor}`).set(bearer(t1));
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    const all = await request(app).get('/v1/me/bookings').set(bearer(t1));
    expect(all.body.items).toHaveLength(2); // 2 đơn của Lan Anh (đơn 0001 + 0004), không có đơn của Binh / vãng lai
    expect(all.body.items[0]).toMatchObject({ code: expect.any(String), status: 'CONFIRMED', guest: { phone: '+84912345678' } });
    expect(JSON.stringify(all.body)).not.toMatch(/hotelId|accountId|statusHistory/);
    const b = await request(app).get('/v1/me/bookings').set(bearer(t2));
    expect(b.body.items).toHaveLength(1);
    expect(all.body.items.map((i: { code: string }) => i.code)).not.toContain(b.body.items[0].code);
    expect((await request(app).get('/v1/me/bookings')).status).toBe(401);
  });

  it('token khách bị chặn ở /v1/hotel/* và /v1/admin/*, token nhân sự không dùng được /v1/me', async () => {
    const t = (await login({ username: 'Binh', password: 'MatKhau123' }, 9)).body.token as string;
    for (const path of ['/v1/admin/accounts', '/v1/admin/roles', '/v1/admin/permissions', '/v1/admin/audit-logs', '/v1/admin/dashboard', '/v1/admin/hotels', '/v1/admin/bookings', '/v1/hotel/bookings', '/v1/hotel/room-types', '/v1/hotel/profile', '/v1/hotel/stats', '/v1/hotel/shuttle-requests', '/v1/hotel/change-requests']) {
      const r = await request(app).get(path).set(bearer(t));
      expect(r.status, path).toBe(403);
    }
    expect((await request(app).post('/v1/admin/accounts').set(bearer(t)).send({})).status).toBe(403);
    const staff = await mkStaff(hotelId, [PERM.BOOKING_READ]);
    expect((await request(app).get('/v1/me/bookings').set(bearer(staff.token))).status).toBe(403);
  });

  it('tài khoản khách bị khóa: token cũ -> 401 ACCOUNT_INACTIVE, đăng nhập -> 401 INVALID_CREDENTIALS', async () => {
    const reg = await register({ username: 'Khoa', password: 'MatKhau123' }, 10);
    await db.query("UPDATE accounts SET status = 'LOCKED' WHERE username = 'Khoa'");
    const me = await request(app).get('/v1/me/bookings').set(bearer(reg.body.token));
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect((await login({ username: 'Khoa', password: 'MatKhau123' }, 10)).body.error.code).toBe('INVALID_CREDENTIALS');
    // đặt phòng bằng token của tài khoản khóa: coi như vãng lai, không gắn account
    const b = await book(reg.body.token, 'pax-key-0006');
    expect(b.status).toBe(201);
    expect((await one<{ accountId?: string }>('SELECT account_id FROM bookings WHERE code = $1', [b.body.booking.code]))!.accountId).toBeUndefined();
  });

  it('admin liệt kê tài khoản không lẫn PASSENGER', async () => {
    const a = await mkAdmin([PERM.ADMIN_ACCOUNT_MANAGE]);
    const list = await request(app).get('/v1/admin/accounts?limit=100').set(bearer(a.token));
    expect(list.status).toBe(200);
    expect(list.body.items.every((i: { type: string }) => i.type === 'ADMIN')).toBe(true);
  });

  it('createBookingVia (khách vãng lai, helper cũ) vẫn chạy', async () => {
    const r = await createBookingVia(app, { hotelId, roomTypeId });
    expect(r.code).toBeTruthy();
  });
});
