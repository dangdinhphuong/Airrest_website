import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { closeDb, db, freshDb, mkHotel } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const ip = (n: number) => ({ 'X-Forwarded-For': `10.78.0.${n}` });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: email đăng ký, yêu thích, thông báo, mã giảm giá của khách', () => {
  const app = createApp();
  let hotelId = '';
  let token = '';

  const register = (body: object, n: number) => request(app).post('/api/v1/auth/passenger/register').set(ip(n)).send({ password: 'MatKhau123', ...body });

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel();
  });
  afterAll(async () => closeDb());

  it('đăng ký bắt buộc email hợp lệ; email trả lại ở user và /auth/me; email trùng -> 409 EMAIL_TAKEN', async () => {
    expect((await register({ username: 'khongmail' }, 1)).status).toBe(422);
    expect((await register({ username: 'saimail', email: 'khong-phai-email' }, 1)).status).toBe(422);
    const ok = await register({ username: 'lan', email: ' Lan@Example.com ', fullName: 'Lan' }, 2);
    expect(ok.status).toBe(201);
    expect(ok.body.user.email).toBe('lan@example.com');
    token = ok.body.token;
    expect((await request(app).get('/api/v1/auth/me').set(bearer(token))).body.user.email).toBe('lan@example.com');
    const dup = await register({ username: 'lan2', email: 'LAN@example.com' }, 3);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('yêu thích: thêm (lặp vẫn 204), liệt kê, bỏ; khách sạn không có -> 404; cần đăng nhập', async () => {
    expect((await request(app).get('/api/v1/me/favorites')).status).toBe(401);
    expect((await request(app).put(`/api/v1/me/favorites/${hotelId}`).set(bearer(token))).status).toBe(204);
    expect((await request(app).put(`/api/v1/me/favorites/${hotelId}`).set(bearer(token))).status).toBe(204);
    expect((await request(app).get('/api/v1/me/favorites').set(bearer(token))).body.hotelIds).toEqual([hotelId]);
    expect((await request(app).put('/api/v1/me/favorites/00000000-0000-4000-8000-000000000000').set(bearer(token))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/me/favorites/${hotelId}`).set(bearer(token))).status).toBe(204);
    expect((await request(app).get('/api/v1/me/favorites').set(bearer(token))).body.hotelIds).toEqual([]);
  });

  it('thông báo: rỗng khi chưa có đơn; đánh dấu đã đọc không lỗi', async () => {
    const r = await request(app).get('/api/v1/me/notifications').set(bearer(token));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], unread: 0 });
    expect((await request(app).post('/api/v1/me/notifications/read').set(bearer(token))).status).toBe(204);
  });

  it('mã giảm giá: chỉ trả mã bật và chưa hết hạn', async () => {
    await db.query(
      `INSERT INTO vouchers (code, title, discount_type, value, expires_at, active) VALUES
       ('CON10', 'Giảm 10%', 'PERCENT', 10, now() + interval '5 day', true),
       ('HETHAN', 'Đã hết hạn', 'AMOUNT', 50000, now() - interval '1 day', true),
       ('TAT', 'Đang tắt', 'AMOUNT', 50000, null, false)`,
    );
    const r = await request(app).get('/api/v1/me/vouchers').set(bearer(token));
    expect(r.status).toBe(200);
    expect(r.body.items.map((v: { code: string }) => v.code)).toEqual(['CON10']);
  });
});
