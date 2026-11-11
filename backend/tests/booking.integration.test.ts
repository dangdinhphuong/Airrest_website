import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { startBookingsStream } from '../api/realtime/bookingFeed';
import { initSocket } from '../api/realtime/socket';
import { signAccountToken } from '../lib/jwt';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAccount, mkHotel, mkRoomType, one } from './support/db';

// Cần Postgres: `npm run test:db` tự bật Postgres nhúng (hoặc đặt TEST_DATABASE_URL tới DB local).
const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: đặt phòng + realtime (cần Postgres)', () => {
  const app = createApp();
  let server: Server;
  let url: string;
  let stop: () => Promise<void>;
  let hotelId: string;
  let roomTypeId: string;
  const from = new Date(Date.now() + 2 * 86400_000);
  const to = new Date(Date.now() + 3 * 86400_000);
  const body = (phone = '0912345678') => ({
    hotelId,
    roomTypeId,
    from: from.toISOString(),
    to: to.toISOString(),
    guest: { fullName: 'Nguyễn Văn A', phone },
  });

  beforeAll(async () => {
    await freshDb();
    hotelId = await mkHotel({ code: 'T1', name: 'KS Test' });
    // CHỈ 1 phòng -> dùng để thử tranh chấp phòng cuối.
    roomTypeId = await mkRoomType(hotelId, 1);
    server = createServer(app);
    initSocket(server);
    stop = startBookingsStream();
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await stop?.();
    await new Promise((r) => server?.close(r));
    await closeDb();
  });

  it('hai khách đặt đồng thời phòng cuối: đúng 1 thành công, 1 SOLD_OUT', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/v1/bookings').set('Idempotency-Key', 'key-aaaaaaaa').send(body('0911111111')),
      request(app).post('/v1/bookings').set('Idempotency-Key', 'key-bbbbbbbb').send(body('0922222222')),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('SOLD_OUT');
    expect(await count('bookings')).toBe(1);
    expect(await count('room_reservations')).toBe(1);
    expect(await count('audit_logs', "action = 'BOOKING.CREATE'")).toBe(1);
  });

  it('cùng Idempotency-Key + cùng body: trả lại kết quả cũ, không tạo thêm', async () => {
    await db.query('DELETE FROM room_reservations');
    await db.query('DELETE FROM bookings');
    const first = await request(app).post('/v1/bookings').set('Idempotency-Key', 'key-same-0001').send(body());
    await new Promise((r) => setTimeout(r, 200)); // chờ lưu response
    const second = await request(app).post('/v1/bookings').set('Idempotency-Key', 'key-same-0001').send(body());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.booking.code).toBe(first.body.booking.code);
    expect(await count('bookings')).toBe(1);
  });

  it('tra cứu đúng mã + SĐT; sai SĐT -> 404; giá tính ở server (phòng 600.000 + phí 12.000)', async () => {
    const created = (await one<{ code: string }>('SELECT code FROM bookings'))!;
    const ok = await request(app).post('/v1/bookings/lookup').send({ code: created.code, phone: '0912345678' });
    expect(ok.status).toBe(200);
    expect(ok.body.booking.pricing.totalVnd).toBe(612_000);
    expect(ok.body.guestToken).toBeTruthy();
    const bad = await request(app).post('/v1/bookings/lookup').send({ code: created.code, phone: '0999999999' });
    expect(bad.status).toBe(404);
  });

  it('đăng nhập lễ tân -> check-in; token khách sạn khác không check-in được đơn này', async () => {
    const roleId = (await one<{ id: string }>(
      "INSERT INTO roles (key, name, scope, hotel_id, permissions, system) VALUES ('reception', 'LT', 'HOTEL', $1, $2, true) RETURNING id",
      [hotelId, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN]],
    ))!.id;
    await mkAccount({ type: 'HOTEL', email: 'lt@test.vn', password: 'Pass12345!', hotelId, roleIds: [roleId] });
    const login = await request(app).post('/v1/auth/login').send({ email: 'lt@test.vn', password: 'Pass12345!' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const list = await request(app).get('/v1/hotel/bookings').set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(1);

    const id = list.body.items[0].id;
    // Tài khoản lễ tân của khách sạn KHÁC (cùng quyền) -> không thấy đơn của khách sạn này.
    const otherHotel = await mkHotel({ code: 'T2' });
    const otherId = await mkAccount({ type: 'HOTEL', email: 'lt2@test.vn', hotelId: otherHotel, roleIds: [roleId] });
    const other = signAccountToken({ sub: otherId, accountType: 'HOTEL' });
    const denied = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${other}`);
    expect(denied.status).toBe(409); // không thấy đơn của khách sạn khác

    const done = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${token}`);
    expect(done.status).toBe(200);
    expect(done.body.booking.status).toBe('CHECKED_IN');
    const again = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
  });

  it('Socket.io: khách nhận booking:updated khi đơn đổi trạng thái; không token thì bị từ chối', async () => {
    const created = (await one<{ code: string }>('SELECT code FROM bookings'))!;
    const lookup = await request(app).post('/v1/bookings/lookup').send({ code: created.code, phone: '0912345678' });

    const noAuth = ioClient(url, { reconnection: false });
    await new Promise<void>((resolve) => noAuth.on('connect_error', (e) => { expect(e.message).toBe('UNAUTHENTICATED'); resolve(); }));
    noAuth.close();

    const sock = ioClient(url, { auth: { token: lookup.body.guestToken }, reconnection: false });
    await new Promise<void>((r) => sock.on('connect', () => r()));
    const rooms = await new Promise<string[]>((r) => sock.emit('rooms:list', r));
    expect(rooms).toEqual([`booking:${created.code}`]);

    const got = new Promise<{ code: string; status: string }>((r) => sock.on('booking:updated', r));
    // Check-in đơn qua API -> service phát sự kiện sau commit -> khách nhận realtime.
    const staff = signAccountToken({ sub: (await one<{ id: string }>("SELECT id FROM accounts WHERE email = 'lt@test.vn'"))!.id, accountType: 'HOTEL' });
    const bid = (await one<{ id: string }>('SELECT id FROM bookings'))!.id;
    expect((await request(app).post(`/v1/hotel/bookings/${bid}/check-in`).set('Authorization', `Bearer ${staff}`)).status).toBe(409); // đã check-in ở test trước
    await db.query("UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1", [bid]);
    expect((await request(app).post(`/v1/hotel/bookings/${bid}/check-in`).set('Authorization', `Bearer ${staff}`)).status).toBe(200);
    const ev = await got;
    expect(ev).toMatchObject({ code: created.code, status: 'CHECKED_IN' });
    expect(ev).not.toHaveProperty('guest');
    sock.close();
  });
});
