import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { db } from '../database/pg';
import { signAccountToken } from '../lib/jwt';
import { notify } from '../services/notifications';
import { closeDb, freshDb, mkAccount, mkHotel, mkRoomType } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const ALL = Object.values(PERM).filter((p) => !p.startsWith('admin:') && p !== PERM.HOTEL_SCOPE_ALL);

// Kiểm tra cách ly: nhân viên chỉ làm việc & thấy dữ liệu của khách sạn mình được gán.
run('tích hợp: cách ly dữ liệu theo khách sạn của nhân viên', () => {
  const app = createApp();
  let A = '', B = '', C = '', rtB = '', bookingB = '', bookingA = '', staffB = '', roleB = '', vehB = '';
  let s1 = '', s1Id = '', multiId = '', multiRoleC = '';
  const get = (t: string, path: string) => request(app).get(path).set(bearer(t));
  const role = async (hotelId: string) => {
    const id = randomUUID();
    await db.query("INSERT INTO roles (id, key, name, scope, hotel_id, permissions) VALUES ($1,$2,$3,'HOTEL',$4,$5::text[])", [id, `custom_${id.slice(0, 8)}`, `VT ${id.slice(0, 4)}`, hotelId, ALL]);
    return id;
  };
  const book = async (hotelId: string, roomTypeId: string, phone: string) => {
    const res = await request(app).post('/v1/bookings').set('Idempotency-Key', `iso-${phone}-key`).send({ hotelId, roomTypeId, from: new Date(Date.now() + 2 * 86400_000).toISOString(), to: new Date(Date.now() + 3 * 86400_000).toISOString(), guest: { fullName: 'Khách ' + phone, phone } });
    expect(res.status).toBe(201);
    return (await db.query<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [res.body.booking.code])).rows[0]!;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    [A, B, C] = [await mkHotel({ code: 'IS-A' }), await mkHotel({ code: 'IS-B' }), await mkHotel({ code: 'IS-C' })];
    const rtA = await mkRoomType(A, 3);
    rtB = await mkRoomType(B, 3, 700_000, { name: 'Phòng của B' });
    bookingA = (await book(A, rtA, '0911000001')).id;
    const bb = await book(B, rtB, '0911000002');
    bookingB = bb.id;
    s1Id = await mkAccount({ type: 'HOTEL', email: 's1@airrest.vn', hotelId: A, roleIds: [await role(A)] });
    s1 = signAccountToken({ sub: s1Id, accountType: 'HOTEL' });
    roleB = await role(B);
    staffB = await mkAccount({ type: 'HOTEL', email: 'staffb@airrest.vn', hotelId: B, roleIds: [roleB] });
    vehB = (await db.query<{ id: string }>("INSERT INTO vehicles (hotel_id, plate, seats, model, active) VALUES ($1,'29A-00001',4,'Xe B',true) RETURNING id", [B])).rows[0]!.id;
    await notify(B, 'BOOKING_NEW', { title: 'Thông báo của B', dedupeKey: 'b1' });
    // Nhân viên nhiều khách sạn: được gán A và C (không có B).
    const roleA2 = await role(A);
    multiRoleC = await role(C);
    multiId = await mkAccount({ type: 'HOTEL', email: 'multi@airrest.vn', hotelId: A, roleIds: [roleA2] });
    await db.query('INSERT INTO account_hotels (account_id, hotel_id, role_id) VALUES ($1,$2,$3),($1,$4,$5)', [multiId, A, roleA2, C, multiRoleC]);
  });
  afterAll(async () => closeDb());

  it('đăng nhập: token mang đúng khách sạn được gán, /me không trả khách sạn khác', async () => {
    await db.query("UPDATE accounts SET password_hash = (SELECT password_hash FROM accounts WHERE email = 's1@airrest.vn') WHERE email = 'multi@airrest.vn'"); // cùng mật khẩu để đăng nhập
    const me = (await get(s1, '/v1/auth/me')).body;
    expect(JSON.stringify(me)).not.toContain(B);
    expect(me.auth?.hotelId ?? me.hotelId).toBe(A);
  });

  it('token giả khai khách sạn B: nhân viên 1 khách sạn vẫn chỉ ở A; nhân viên nhiều khách sạn bị 401', async () => {
    const forgedSingle = signAccountToken({ sub: s1Id, accountType: 'HOTEL', hotelId: B });
    const me = (await get(forgedSingle, '/v1/auth/me')).body;
    expect(me.auth?.hotelId ?? me.hotelId).toBe(A);
    const ids = ((await get(forgedSingle, '/v1/hotel/bookings')).body.items as { id: string }[]).map((x) => x.id);
    expect(ids).toContain(bookingA); expect(ids).not.toContain(bookingB);
    const forgedMulti = signAccountToken({ sub: multiId, accountType: 'HOTEL', hotelId: B });
    expect((await get(forgedMulti, '/v1/hotel/bookings')).status).toBe(401);
    expect((await get(signAccountToken({ sub: multiId, accountType: 'HOTEL', hotelId: C }), '/v1/hotel/bookings')).status).toBe(200);
  });

  it('chuyển khách sạn: chỉ sang khách sạn được gán; khách sạn lạ -> 404, nhân viên 1 khách sạn không có gì để chuyển', async () => {
    const multi = signAccountToken({ sub: multiId, accountType: 'HOTEL' });
    expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(multi)).send({ hotelId: B })).status).toBe(404);
    expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(multi)).send({ hotelId: C })).status).toBe(200);
    expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(s1)).send({ hotelId: B })).status).toBe(404);
    expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(s1)).send({ hotelId: C })).status).toBe(404);
  });

  it('danh sách chỉ có dữ liệu khách sạn mình; truy cập theo id của khách sạn khác -> 404/403', async () => {
    const lists = ['/v1/hotel/bookings', '/v1/hotel/room-types', '/v1/hotel/rooms', '/v1/hotel/staff', '/v1/hotel/roles', '/v1/hotel/vehicles', '/v1/hotel/drivers', '/v1/hotel/shuttle/board', '/v1/hotel/payouts', '/v1/hotel/change-requests', '/v1/hotel/notifications', '/v1/hotel/notification-settings', '/v1/hotel/stats'];
    for (const p of lists) {
      const r = await get(s1, p);
      const txt = JSON.stringify(r.body);
      expect([p, r.status, [B, bookingB, rtB, staffB, roleB, vehB].filter((x) => txt.includes(x))]).toEqual([p, r.status, []]);
    }
    const blocked = [
      ['get', `/v1/hotel/bookings/${bookingB}`], ['get', `/v1/hotel/bookings/${bookingB}/events`],
      ['post', `/v1/hotel/bookings/${bookingB}/check-in`], ['post', `/v1/hotel/bookings/${bookingB}/confirm`], ['post', `/v1/hotel/bookings/${bookingB}/reject`],
      ['get', `/v1/hotel/room-types/${rtB}/inventory`], ['patch', `/v1/hotel/room-types/${rtB}`], ['delete', `/v1/hotel/room-types/${rtB}`],
      ['patch', `/v1/hotel/staff/${staffB}`], ['post', `/v1/hotel/staff/${staffB}/reset-password`],
      ['patch', `/v1/hotel/roles/${roleB}`], ['delete', `/v1/hotel/roles/${roleB}`], ['get', `/v1/hotel/roles?hotelId=${B}`],
      ['patch', `/v1/hotel/vehicles/${vehB}`], ['delete', `/v1/hotel/vehicles/${vehB}`],
    ] as const;
    for (const [m, p] of blocked) {
      const r = await request(app)[m](p).set(bearer(s1)).send({ reason: 'x', name: 'x', seats: 4 });
      expect([m, p, r.status >= 400 && r.status !== 401 && r.status < 500]).toEqual([m, p, true]);
      expect([m, p, [403, 404, 409, 422].includes(r.status)]).toEqual([m, p, true]); // 409 = thao tác bị khóa theo khách sạn trong SQL nên không khớp đơn nào (dữ liệu không đổi, kiểm ở dưới)
    }
    // sau các thao tác trái phép, dữ liệu của B không đổi
    expect((await db.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingB])).rows[0]!.status).toBe('CONFIRMED');
    expect((await db.query('SELECT 1 FROM roles WHERE id = $1', [roleB])).rowCount).toBe(1);
    expect((await db.query('SELECT 1 FROM vehicles WHERE id = $1', [vehB])).rowCount).toBe(1);
  });

  it('API quản trị: nhân viên khách sạn bị 403', async () => {
    for (const p of ['/v1/admin/hotels', '/v1/admin/bookings', '/v1/admin/accounts']) expect([p, (await get(s1, p)).status]).toEqual([p, 403]);
  });
});
