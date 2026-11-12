import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flightDateSchema } from '@airrest/validation';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { viErrorMap } from '../lib/zodErrorMap';
import { z } from 'zod';
import { closeDb, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { createBookingVia, guestIp, setStay, setStatus } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('không DB: ngày + thông báo tiếng Việt', () => {
  it('flightDateSchema: ngày sai không ném RangeError', () => {
    for (const bad of ['abc', '2026-02-31', '2026-13-01', '0000-00-00', '2026-1-1']) expect(flightDateSchema.safeParse(bad).success, bad).toBe(false);
    expect(flightDateSchema.safeParse('2026-02-28').success).toBe(true);
  });
  it('errorMap tiếng Việt', () => {
    const r = (s: z.ZodTypeAny, v: unknown) => s.safeParse(v, { errorMap: viErrorMap }).error?.issues[0]?.message;
    expect(r(z.string().email(), 'x')).toBe('Email không hợp lệ');
    expect(r(z.string(), undefined)).toBe('Bắt buộc nhập');
    expect(r(z.string().min(2), 'a')).toBe('Phải có ít nhất 2 ký tự');
    expect(r(z.number().min(0), -1)).toBe('Giá trị phải lớn hơn hoặc bằng 0');
  });
});

run('tích hợp: sửa lỗi backend đợt tester', () => {
  const app = createApp();
  let hotelId = '';
  let rt = '';
  let admin = '';
  let front = '';
  let other = '';
  let ip = 0;

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel({ code: 'BF1' });
    rt = await mkRoomType(hotelId, 5);
    admin = (await mkAdmin([PERM.FLIGHT_MANAGE, PERM.ADMIN_HOTEL_MANAGE, PERM.ADMIN_CONFIG_READ])).token;
    front = (await mkStaff(hotelId, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE])).token;
    other = (await mkStaff(await mkHotel({ code: 'BF2' }), [PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE])).token;
  });
  afterAll(async () => closeDb());

  it('ngày sai -> 422 (không 500), tiếng Việt', async () => {
    for (const p of ['/v1/admin/flights?date=abc', '/v1/admin/flights?date=2026-02-31']) {
      const r = await request(app).get(p).set(auth(admin));
      expect(r.status, p).toBe(422);
    }
    const r = await request(app).get('/v1/flights/VN218?date=abc').set(guestIp(++ip));
    expect(r.status).toBe(422);
    expect(r.body.error.details[0].message).toBe('Ngày phải dạng YYYY-MM-DD');
  });

  it('lỗi zod trả tiếng Việt', async () => {
    const r = await request(app).post('/v1/auth/login').set(guestIp(++ip)).send({ email: 'x' });
    expect(r.status).toBe(422);
    const msgs = r.body.error.details.map((d: any) => d.message).join('|');
    expect(msgs).not.toMatch(/Invalid|Required|String must/);
  });

  it('khách sạn: mã sân bay lạ -> 422', async () => {
    const r = await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth(admin)).send({ airports: [{ iata: 'ZZZ', km: 3, minutes: 5 }] });
    expect(r.status).toBe(422);
    const ok = await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth(admin)).send({ airports: [{ iata: 'han', km: 3, minutes: 5 }] });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/v1/hotels?airport=ZZZ')).body.items).toEqual([]);
  });

  it('PUT configs: 403 trước 422', async () => {
    const r = await request(app).put('/v1/admin/configs/booking.hold').set(auth(admin)).send({});
    expect(r.status).toBe(403);
  });

  it('chuyến bay: tạo, trùng 409, sân bay lạ 422, xóa 204, đã có lịch sử 409', async () => {
    const body = { code: 'vj999', origin: 'HAN', dest: 'SGN', scheduledDepartureAt: '2026-12-01T03:00:00Z', reason: 'thử nghiệm' };
    const c = await request(app).post('/v1/admin/flights').set(auth(admin)).send(body);
    expect(c.status).toBe(201);
    expect(c.body.flight).toMatchObject({ code: 'VJ999', status: 'ONTIME' });
    expect((await request(app).post('/v1/admin/flights').set(auth(admin)).send(body)).status).toBe(409);
    expect((await request(app).post('/v1/admin/flights').set(auth(admin)).send({ ...body, code: 'VJ998', origin: 'ZZZ' })).status).toBe(422);
    const id = c.body.flight.id;
    const p = await request(app).patch(`/v1/admin/flights/${id}`).set(auth(admin)).send({ status: 'CANCELLED', reason: 'hủy thử' });
    expect(p.status).toBe(200);
    const d1 = await request(app).delete(`/v1/admin/flights/${id}`).set(auth(admin));
    expect(d1.status).toBe(409);
    expect(d1.body.error.code).toBe('FLIGHT_IN_USE');
    const c2 = await request(app).post('/v1/admin/flights').set(auth(admin)).send({ ...body, code: 'VJ997' });
    expect((await request(app).delete(`/v1/admin/flights/${c2.body.flight.id}`).set(auth(admin))).status).toBe(204);
    expect((await request(app).delete(`/v1/admin/flights/${c2.body.flight.id}`).set(auth(admin))).status).toBe(404);
  });

  it('check-out / no-show', async () => {
    const a = await createBookingVia(app, { hotelId, roomTypeId: rt, offDays: 3 });
    const post = (act: string, id: string, t = front) => request(app).post(`/v1/hotel/bookings/${id}/${act}`).set(auth(t));
    expect((await post('check-out', a.id)).status).toBe(409); // chưa check-in
    await setStatus(a.id, 'CONFIRMED');
    expect((await post('no-show', a.id)).body.error.code).toBe('NO_SHOW_NOT_DUE');
    await setStatus(a.id, 'CHECKED_IN');
    expect((await post('check-out', a.id, other)).status).toBe(404);
    const out = await post('check-out', a.id);
    expect(out.status).toBe(200);
    expect(out.body.booking.status).toBe('CHECKED_OUT');
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [a.id]))!.state).toBe('COMPLETED');
    expect((await post('check-out', a.id)).body.error.code).toBe('INVALID_STATE');
    expect(Number((await one<any>("SELECT count(*) n FROM audit_logs WHERE action = 'BOOKING.CHECKOUT'"))!.n)).toBe(1);

    const b = await createBookingVia(app, { hotelId, roomTypeId: rt, offDays: 3 });
    await setStatus(b.id, 'CONFIRMED');
    await setStay(b.id, new Date(Date.now() - 3600_000));
    expect((await post('no-show', b.id, other)).status).toBe(404);
    const ns = await post('no-show', b.id);
    expect(ns.status).toBe(200);
    expect(ns.body.booking.status).toBe('NO_SHOW');
    expect((await post('no-show', b.id)).body.error.code).toBe('INVALID_STATE');
    const thin = (await mkStaff(hotelId, [PERM.BOOKING_READ])).token;
    expect((await post('no-show', b.id, thin)).status).toBe(403);
  });

  it('hồ sơ khách sạn + ảnh', async () => {
    const g = await request(app).get('/v1/hotel/profile').set(auth(front));
    expect(g.status).toBe(200);
    expect(g.body.profile.id).toBe(hotelId);
    expect(JSON.stringify(g.body)).not.toMatch(/payout/i);
    const key = 'hotels/2026/123e4567-e89b-12d3-a456-426614174000.jpg';
    const p = await request(app).patch('/v1/hotel/profile').set(auth(front)).send({ description: 'Mô tả mới', phone: '0241234567', receptionCloseHour: 23, cancellationTemplate: 'STANDARD', amenities: ['WIFI'], images: [key] });
    expect(p.status).toBe(200);
    expect(p.body.profile).toMatchObject({ description: 'Mô tả mới', contact: { phone: '0241234567' }, policy: { cancellationTemplate: 'STANDARD', receptionCloseHour: 23 } });
    expect(p.body.profile.images[0].key).toBe(key);
    expect((await request(app).patch('/v1/hotel/profile').set(auth(front)).send({ status: 'ACTIVE' })).status).toBe(422);
    expect((await request(app).patch('/v1/hotel/profile').set(auth(front)).send({ images: ['evil/../x.jpg'] })).status).toBe(422);
    expect((await request(app).patch('/v1/hotel/profile').set(auth(front)).send({})).status).toBe(422);
    const pub = await request(app).get(`/v1/hotels/${hotelId}`);
    expect(pub.body.hotel.images.map((i: any) => i.key)).toEqual([key]);
    const empty = await request(app).get(`/v1/hotels/${await mkHotel({ code: 'BF3' })}`);
    expect(empty.body.hotel.images).toEqual([]);
    const thin = (await mkStaff(hotelId, [PERM.BOOKING_READ])).token;
    expect((await request(app).get('/v1/hotel/profile').set(auth(thin))).status).toBe(403);
    const up = await request(app).post('/v1/hotel/media/upload-url').set(auth(front)).send({ contentType: 'image/png', size: 1000 });
    expect(up.status).toBe(201);
    expect(up.body.key).toMatch(/^hotels\//);
    void db;
  });

  it('rate limit 429 có requestId', async () => {
    let last: any;
    for (let i = 0; i < 12; i++) last = await request(app).post('/v1/auth/login').set(guestIp(250)).send({ email: 'a@b.vn', password: 'x' });
    expect(last.status).toBe(429);
    expect(last.body.error.requestId).toBeTruthy();
  });
});
