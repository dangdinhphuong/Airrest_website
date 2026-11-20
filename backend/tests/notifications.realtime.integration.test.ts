import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { startBookingsStream } from '../api/realtime/bookingFeed';
import { initSocket } from '../api/realtime/socket';
import { PERM } from '../config/permissions';
import { db } from '../database/pg';
import { signAccountToken } from '../lib/jwt';
import { closeDb, freshDb, mkAccount, mkHotel, mkRoomType } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: khách đặt phòng -> khách sạn nhận realtime + thông báo', () => {
  const app = createApp();
  let server: Server, url = '', stop: () => Promise<void>, hotelId = '', roomTypeId = '', token = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel({ code: 'RT1', name: 'KS Realtime' }); // đơn tự xác nhận (không duyệt tay)
    roomTypeId = await mkRoomType(hotelId, 3);
    const roleId = randomUUID();
    await db.query("INSERT INTO roles (id, key, name, scope, hotel_id, permissions) VALUES ($1,$2,'Lễ tân thử','HOTEL',$3,$4::text[])", [roleId, `custom_${roleId.slice(0, 8)}`, hotelId, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN]]);
    const id = await mkAccount({ type: 'HOTEL', email: 'rt@airrest.vn', hotelId, roleIds: [roleId] });
    token = signAccountToken({ sub: id, accountType: 'HOTEL' });
    server = createServer(app);
    initSocket(server);
    stop = startBookingsStream();
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await stop?.(); await new Promise((r) => server?.close(r)); await closeDb(); });

  it('đặt đơn -> socket nhận order:new + notify:new; REST trả thông báo "Có đơn mới" cho đúng người', async () => {
    const sock = ioClient(url, { auth: { token }, transports: ['websocket'] });
    const got: string[] = [];
    sock.onAny((name) => got.push(name));
    await new Promise<void>((r, j) => { sock.on('connect', () => r()); sock.on('connect_error', j); });
    const day = 86400_000;
    const res = await request(app).post('/api/v1/bookings').set('Idempotency-Key', 'rt-key-0001').send({ hotelId, roomTypeId, from: new Date(Date.now() + 2 * day).toISOString(), to: new Date(Date.now() + 3 * day).toISOString(), guest: { fullName: 'Khách Realtime', phone: '0912345670' } });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 600));
    sock.close();
    expect(got).toContain('order:new');
    expect(got).toContain('notify:new');
    const list = (await request(app).get('/api/v1/hotel/notifications').set({ Authorization: `Bearer ${token}` })).body as { items: { type: string; title: string }[]; unread: number };
    expect(list.items.map((i) => i.type)).toContain('BOOKING_NEW');
    expect(list.items[0]!.title).toContain(res.body.booking.code);
    expect(list.unread).toBeGreaterThanOrEqual(1);
  });
});
