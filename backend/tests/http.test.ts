import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { signGuestToken } from '../lib/jwt';

// Các test này không cần DB: chỉ đi qua middleware (xác thực, quyền, validate, lỗi).
const app = createApp();

describe('middleware HTTP', () => {
  it('GET /health -> 200 và có x-request-id', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('route không tồn tại -> 404 dạng lỗi chuẩn', async () => {
    const res = await request(app).get('/khong-co');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('route cần đăng nhập, không token -> 401', async () => {
    const res = await request(app).get('/v1/hotel/bookings');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('token sai -> 401 INVALID_TOKEN', async () => {
    const res = await request(app).get('/v1/hotel/bookings').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('token khách vãng lai không dùng được cổng khách sạn -> 403', async () => {
    const res = await request(app).get('/v1/hotel/bookings').set('Authorization', `Bearer ${signGuestToken('AR-ABCDEFGH')}`);
    expect(res.status).toBe(403);
  });

  it('validate: body tra cứu sai -> 422 kèm chi tiết', async () => {
    const res = await request(app).post('/v1/bookings/lookup').send({ code: 'x', phone: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('tạo đơn thiếu Idempotency-Key -> 400 (sau khi body hợp lệ)', async () => {
    const res = await request(app)
      .post('/v1/bookings')
      .send({
        hotelId: '65000000-0000-4000-8000-000000000001',
        roomTypeId: '65000000-0000-4000-8000-000000000002',
        from: new Date(Date.now() + 86400_000).toISOString(),
        to: new Date(Date.now() + 2 * 86400_000).toISOString(),
        guest: { fullName: 'Nguyễn Văn A', phone: '0912345678' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('JSON hỏng -> 400 INVALID_JSON', async () => {
    const res = await request(app).post('/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('Swagger', () => {
  it('phục vụ OpenAPI và trang /docs', async () => {
    const spec = await request(createApp()).get('/openapi.json').expect(200);
    expect(spec.body.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.body.paths)).toContain('/v1/bookings');
    await request(createApp()).get('/docs/').expect(200);
  });
});
