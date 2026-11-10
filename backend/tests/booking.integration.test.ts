import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ObjectId } from 'mongodb';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { col } from '../src/db/collections';
import { ensureIndexes } from '../src/db/indexes';
import { closeMongo, connectMongo, db } from '../src/db/mongo';
import { startBookingsStream } from '../src/realtime/changeStreams';
import { initSocket } from '../src/realtime/socket';
import { signAccountToken } from '../src/lib/jwt';
import { hashPassword } from '../src/lib/password';
import { PERM } from '../src/config/permissions';

// Cần MongoDB replica set đang chạy: `docker compose up -d` rồi `npm run test:db`.
const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: đặt phòng + realtime (cần MongoDB)', () => {
  const app = createApp();
  let server: Server;
  let url: string;
  let stop: () => Promise<void>;
  let hotelId: ObjectId;
  let roomTypeId: ObjectId;
  const from = new Date(Date.now() + 2 * 86400_000);
  const to = new Date(Date.now() + 3 * 86400_000);
  const body = (phone = '0912345678') => ({
    hotelId: hotelId.toHexString(),
    roomTypeId: roomTypeId.toHexString(),
    from: from.toISOString(),
    to: to.toISOString(),
    guest: { fullName: 'Nguyễn Văn A', phone },
  });

  beforeAll(async () => {
    await connectMongo();
    await db().dropDatabase();
    await ensureIndexes();
    const now = new Date();
    hotelId = new ObjectId();
    roomTypeId = new ObjectId();
    await col.hotels().insertOne({
      _id: hotelId, code: 'T1', name: 'KS Test', status: 'ACTIVE',
      location: { type: 'Point', coordinates: [105.8, 21.2] },
      airports: [{ iata: 'HAN', km: 5, minutes: 10 }], amenities: [],
      policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 }, approval: { manual: false },
      rating: { avg: 0, count: 0 }, createdAt: now, updatedAt: now,
    });
    // CHỈ 1 phòng -> dùng để thử tranh chấp phòng cuối.
    await col.roomTypes().insertOne({ _id: roomTypeId, hotelId, name: 'Deluxe', totalRooms: 1, pricing: { baseNightVnd: 600_000 }, active: true });
    server = createServer(app);
    initSocket(server);
    stop = startBookingsStream();
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await stop?.();
    await new Promise((r) => server?.close(r));
    await closeMongo();
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
    expect(await col.bookings().countDocuments()).toBe(1);
    expect(await col.roomReservations().countDocuments()).toBe(1);
    expect(await col.auditLogs().countDocuments({ action: 'BOOKING.CREATE' })).toBe(1);
  });

  it('cùng Idempotency-Key + cùng body: trả lại kết quả cũ, không tạo thêm', async () => {
    await db().collection('bookings').deleteMany({});
    await db().collection('room_reservations').deleteMany({});
    const first = await request(app).post('/v1/bookings').set('Idempotency-Key', 'key-same-0001').send(body());
    await new Promise((r) => setTimeout(r, 200)); // chờ lưu response
    const second = await request(app).post('/v1/bookings').set('Idempotency-Key', 'key-same-0001').send(body());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.booking.code).toBe(first.body.booking.code);
    expect(await col.bookings().countDocuments()).toBe(1);
  });

  it('tra cứu đúng mã + SĐT; sai SĐT -> 404; giá tính ở server (phòng 600.000 + phí 12.000)', async () => {
    const created = await col.bookings().findOne({});
    const ok = await request(app).post('/v1/bookings/lookup').send({ code: created!.code, phone: '0912345678' });
    expect(ok.status).toBe(200);
    expect(ok.body.booking.pricing.totalVnd).toBe(612_000);
    expect(ok.body.guestToken).toBeTruthy();
    const bad = await request(app).post('/v1/bookings/lookup').send({ code: created!.code, phone: '0999999999' });
    expect(bad.status).toBe(404);
  });

  it('đăng nhập lễ tân -> check-in; token khách sạn khác không check-in được đơn này', async () => {
    const roleId = new ObjectId();
    await col.roles().insertOne({ _id: roleId, key: 'reception', name: 'LT', scope: 'HOTEL', hotelId, permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN], system: true });
    await col.accounts().insertOne({
      _id: new ObjectId(), type: 'HOTEL', email: 'lt@test.vn', passwordHash: await hashPassword('Pass12345!'),
      fullName: 'LT', status: 'ACTIVE', hotelId, roleIds: [roleId], createdAt: new Date(), updatedAt: new Date(),
    });
    const login = await request(app).post('/v1/auth/login').send({ email: 'lt@test.vn', password: 'Pass12345!' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const list = await request(app).get('/v1/hotel/bookings').set('Authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(1);

    const id = list.body.items[0]._id;
    // Tài khoản lễ tân của khách sạn KHÁC (cùng quyền) -> không thấy đơn của khách sạn này.
    const otherHotel = new ObjectId();
    const otherId = new ObjectId();
    await col.accounts().insertOne({
      _id: otherId, type: 'HOTEL', email: 'lt2@test.vn', passwordHash: 'x', fullName: 'LT2', status: 'ACTIVE',
      hotelId: otherHotel, roleIds: [roleId], createdAt: new Date(), updatedAt: new Date(),
    });
    const other = signAccountToken({ sub: otherId.toHexString(), accountType: 'HOTEL' });
    const denied = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${other}`);
    expect(denied.status).toBe(409); // không thấy đơn của khách sạn khác

    const done = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${token}`);
    expect(done.status).toBe(200);
    expect(done.body.booking.status).toBe('CHECKED_IN');
    const again = await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
  });

  it('Socket.io: khách nhận booking:updated qua change stream; không token thì bị từ chối', async () => {
    const created = await col.bookings().findOne({});
    const lookup = await request(app).post('/v1/bookings/lookup').send({ code: created!.code, phone: '0912345678' });

    const noAuth = ioClient(url, { reconnection: false });
    await new Promise<void>((resolve) => noAuth.on('connect_error', (e) => { expect(e.message).toBe('UNAUTHENTICATED'); resolve(); }));
    noAuth.close();

    const sock = ioClient(url, { auth: { token: lookup.body.guestToken }, reconnection: false });
    await new Promise<void>((r) => sock.on('connect', () => r()));
    const rooms = await new Promise<string[]>((r) => sock.emit('rooms:list', r));
    expect(rooms).toEqual([`booking:${created!.code}`]);

    const got = new Promise<{ code: string; status: string }>((r) => sock.on('booking:updated', r));
    await new Promise((r) => setTimeout(r, 500)); // chờ change stream sẵn sàng
    await col.bookings().updateOne({ _id: created!._id }, { $set: { status: 'CHECKED_OUT', updatedAt: new Date() } });
    const ev = await got;
    expect(ev).toMatchObject({ code: created!.code, status: 'CHECKED_OUT' });
    expect(ev).not.toHaveProperty('guest');
    sock.close();
  });
});
