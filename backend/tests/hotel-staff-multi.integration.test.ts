import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { closeDb, db, freshDb, mkAccount, mkHotel, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: nhân viên làm nhiều khách sạn (account_hotels)', () => {
  const app = createApp();
  const h = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PW = 'Mat-khau-tam-2026';
  let A: string, B: string, C: string, ownerId: string, roleA: string, roleB: string;
  const tokenFor = (sub: string, hotelId?: string) => signAccountToken({ sub, accountType: 'HOTEL', ...(hotelId && { hotelId }) });
  const mkRole = async (hotelId: string, perms: string[]) => {
    const r = await one<{ id: string }>("INSERT INTO roles (key, name, scope, hotel_id, permissions, system) VALUES ($1,$2,'HOTEL',$3,$4::text[],false) RETURNING id", [`custom_${Math.random().toString(36).slice(2, 10)}`, `Vai trò ${perms.length}`, hotelId, perms]);
    return r!.id;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    A = await mkHotel({ code: 'AAA' });
    B = await mkHotel({ code: 'BBB' });
    C = await mkHotel({ code: 'CCC' });
    ownerId = await mkAccount({ type: 'HOTEL', email: 'owner@x.vn', hotelId: A, roleIds: [await systemRoleId('hotel_owner')] });
    await db.query('UPDATE accounts SET is_owner = true WHERE id = $1', [ownerId]);
    const ownerRole = await systemRoleId('hotel_owner');
    for (const hid of [A, B]) await db.query('INSERT INTO account_hotels (account_id, hotel_id, role_id) VALUES ($1,$2,$3)', [ownerId, hid, ownerRole]);
    roleA = await mkRole(A, [PERM.BOOKING_READ]);
    roleB = await mkRole(B, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN]);
  });
  afterAll(closeDb);

  it('GET /hotel/roles?hotelId: xem vai trò khách sạn khác trong phạm vi; ngoài phạm vi -> 404', async () => {
    const ok = await request(app).get(`/v1/hotel/roles?hotelId=${B}`).set(h(tokenFor(ownerId, A)));
    expect(ok.status).toBe(200);
    expect(ok.body.items.some((r: { id: string }) => r.id === roleB)).toBe(true);
    expect(ok.body.items.some((r: { id: string }) => r.id === roleA)).toBe(false);
    expect((await request(app).get(`/v1/hotel/roles?hotelId=${C}`).set(h(tokenFor(ownerId, A)))).status).toBe(404);
  });

  let staffId: string;
  it('tạo nhân viên ở 2 khách sạn, mỗi nơi một vai trò; khách sạn ngoài phạm vi -> 404', async () => {
    const res = await request(app).post('/v1/hotel/staff').set(h(tokenFor(ownerId, A))).send({ email: 'nv@x.vn', fullName: 'Nhân Viên', password: PW, hotels: [{ hotelId: A, roleId: roleA }, { hotelId: B, roleId: roleB }] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    staffId = res.body.staff.id;
    expect(res.body.staff.hotels.map((x: { hotelId: string }) => x.hotelId).sort()).toEqual([A, B].sort());
    expect(await one('SELECT 1 FROM account_hotels WHERE account_id = $1 AND hotel_id = $2 AND role_id = $3', [staffId, B, roleB])).toBeTruthy();
    const out = await request(app).post('/v1/hotel/staff').set(h(tokenFor(ownerId, A))).send({ email: 'nv2@x.vn', fullName: 'Nhân Viên 2', password: PW, hotels: [{ hotelId: C, roleId: roleA }] });
    expect(out.status).toBe(404);
  });

  it('đăng nhập trả danh sách khách sạn; quyền theo vai trò của từng khách sạn; chuyển khách sạn', async () => {
    const login = await request(app).post('/v1/auth/login').send({ email: 'nv@x.vn', password: PW });
    expect(login.status).toBe(200);
    expect(login.body.hotels).toHaveLength(2);
    const me = await request(app).get('/v1/auth/me').set(h(login.body.token));
    expect(me.body.hotels).toHaveLength(2);
    const inA = await request(app).get('/v1/auth/me').set(h(tokenFor(staffId, A)));
    const inB = await request(app).get('/v1/auth/me').set(h(tokenFor(staffId, B)));
    expect(inA.body.auth.permissions).toEqual([PERM.BOOKING_READ]);
    expect([...inB.body.auth.permissions].sort()).toEqual([PERM.BOOKING_CHECKIN, PERM.BOOKING_READ].sort());
    const sw = await request(app).post('/v1/auth/switch-hotel').set(h(tokenFor(staffId, A))).send({ hotelId: B });
    expect(sw.status).toBe(200);
    expect(sw.body.hotel.id).toBe(B);
    expect((await request(app).post('/v1/auth/switch-hotel').set(h(tokenFor(staffId, A))).send({ hotelId: C })).status).toBe(404);
    expect((await request(app).get('/v1/auth/me').set(h(tokenFor(staffId, C)))).status).toBe(401); // token trỏ khách sạn không được gán
  });

  it('danh sách nhân viên của từng khách sạn có nhân viên này; gỡ khỏi A thì không còn ở A nhưng còn ở B', async () => {
    const inList = async (hid: string) => (await request(app).get('/v1/hotel/staff').set(h(tokenFor(ownerId, hid)))).body.items.some((s: { id: string }) => s.id === staffId);
    expect(await inList(A)).toBe(true);
    expect(await inList(B)).toBe(true);
    const patch = await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(tokenFor(ownerId, A))).send({ hotels: [{ hotelId: B, roleId: roleB }] });
    expect(patch.status).toBe(200);
    expect(await inList(A)).toBe(false);
    expect(await inList(B)).toBe(true);
    expect((await request(app).get('/v1/auth/me').set(h(tokenFor(staffId, A)))).status).toBe(401);
    const acc = await one<{ hotelId: string }>('SELECT hotel_id FROM accounts WHERE id = $1', [staffId]);
    expect(acc!.hotelId).toBe(B); // cột mặc định đồng bộ theo liên kết còn lại
  });
});
