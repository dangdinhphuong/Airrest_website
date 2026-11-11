import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('migration 004: booking_decisions + mặc định duyệt tay', () => {
  const app = createApp();
  let H = '';
  let RT = '';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let n = 0;
  const book = (off: number) =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `dm-${++n}-${Date.now()}`)
      .send({ hotelId: H, roomTypeId: RT, from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });
  const insertBookingRow = async () => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO bookings (id, code, status, hotel_id, guest, hotel_snapshot, stay, stay_from, lines, pricing, payment_method, shuttle, status_history, flags)
       VALUES ($1,$2,'PENDING',$3,'{}','{}','{}',now(),'[]','{}','AT_HOTEL','{}','[]','{}')`,
      [id, `AR-${id.slice(0, 8).toUpperCase()}`, H],
    );
    return id;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'D1', manual: true });
    RT = await mkRoomType(H, 5);
  });
  afterAll(async () => closeDb());

  it('booking_decisions: REJECTED cần lý do >= 3 ký tự, decision lạ bị chặn, trùng booking_id bị chặn', async () => {
    const id = await insertBookingRow();
    const ins = (decision: string, reason: string | null, bid = id) =>
      db.query("INSERT INTO booking_decisions (booking_id, decision, reason, decided_by) VALUES ($1,$2,$3,'{}'::jsonb)", [bid, decision, reason]);
    await expect(ins('REJECTED', null)).rejects.toMatchObject({ code: '23514' });
    await expect(ins('REJECTED', 'ab')).rejects.toMatchObject({ code: '23514' });
    await expect(ins('X', null)).rejects.toMatchObject({ code: '23514' });
    await expect(ins('REJECTED', 'hết phòng')).resolves.toBeTruthy();
    await expect(ins('CONFIRMED', null)).rejects.toMatchObject({ code: '23505' });
  });

  it('khách sạn tạo qua POST /v1/admin/hotels có approval.manual true', async () => {
    const admin = (await mkAdmin([PERM.ADMIN_HOTEL_MANAGE, PERM.ADMIN_HOTEL_READ])).token;
    const res = await request(app)
      .post('/v1/admin/hotels')
      .set(auth(admin))
      .send({
        code: 'NEW-01', name: 'KS Mới', address: { line: '1 Nội Bài', city: 'Hà Nội' }, location: { lng: 105.8, lat: 21.2 }, airports: [{ iata: 'han', km: 6, minutes: 12 }],
        amenities: ['WIFI'], contact: { phone: '0243123456' }, policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 },
        owner: { email: 'chu@ksmoi.vn', fullName: 'Chủ KS', password: 'OwnerPass12345!' },
      });
    expect(res.status).toBe(201);
    expect(res.body.hotel.approval).toEqual({ manual: true });
  });

  it('đơn chờ duyệt dùng approvalExpireMin (mặc định 20 phút, đổi cấu hình thì theo cấu hình)', async () => {
    const minutes = async (code: string) => {
      const r = (await one<any>('SELECT expires_at, created_at FROM bookings WHERE code = $1', [code]))!;
      return (r.expiresAt.getTime() - r.createdAt.getTime()) / 60_000;
    };
    const a = await book(1);
    expect(Math.round(await minutes(a.body.booking.code))).toBe(20);
    const sys = (await mkAdmin([PERM.ADMIN_CONFIG_READ, PERM.ADMIN_CONFIG_WRITE])).token;
    const cur = (await request(app).get('/v1/admin/configs').set(auth(sys))).body;
    const hold = (cur.items ?? cur.configs ?? []).find((c: any) => c.key === 'booking.hold')?.value;
    expect(hold).toBeTruthy();
    const put = await request(app).put('/v1/admin/configs/booking.hold').set(auth(sys)).send({ value: { ...hold, approvalExpireMin: 30 }, reason: 'Thử' });
    expect(put.status).toBe(201);
    const b = await book(3);
    expect(Math.round(await minutes(b.body.booking.code))).toBe(30);
  });

  it('status REJECTED / EXPIRED / PENDING_PAYMENT hợp lệ ở GET /v1/hotel/bookings', async () => {
    const t = (await mkStaff(H, [PERM.BOOKING_READ])).token;
    for (const status of ['REJECTED', 'EXPIRED', 'PENDING_PAYMENT']) {
      expect((await request(app).get(`/v1/hotel/bookings?status=${status}`).set(auth(t))).status, status).toBe(200);
    }
  });

  it('câu UPDATE thêm booking:decide cho role lễ tân cũ, chạy lần 2 không nhân đôi', async () => {
    const roleId = randomUUID();
    await db.query("INSERT INTO roles (id, key, name, scope, hotel_id, permissions) VALUES ($1,'old','Cũ','HOTEL',$2,ARRAY['booking:read','booking:checkin'])", [roleId, H]);
    const sql = await readFile(join(__dirname, '../database/migrations/004_booking_decisions.sql'), 'utf8');
    const update = sql.slice(sql.indexOf('UPDATE roles'));
    await db.query(update);
    await db.query(update);
    const r = (await one<{ permissions: string[] }>('SELECT permissions FROM roles WHERE id = $1', [roleId]))!;
    expect(r.permissions.filter((p) => p === 'booking:decide')).toHaveLength(1);
  });
});
