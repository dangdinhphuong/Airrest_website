import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: CRUD loại phòng', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let owner1 = '';
  let owner2 = '';
  let readOnly1 = '';
  let admin = '';
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const body = (o: Record<string, unknown> = {}) => ({ code: 'DLX', name: 'Deluxe', capacity: 2, beds: 1, areaM2: 25, totalRooms: 5, baseNightVnd: 700000, ...o });
  const create = (token: string, o: Record<string, unknown> = {}, q = '') => request(app).post(`/v1/hotel/room-types${q}`).set(auth(token)).send(body(o));
  const bookRoom = (hotelId: string, roomTypeId: string, off: number, qty = 1) =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `rt-${++n}-${Date.now()}`)
      .send({ hotelId, roomTypeId, qty, from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'H1' });
    H2 = await mkHotel({ code: 'H2' });
    const full = [PERM.BOOKING_READ, PERM.ROOM_MANAGE];
    owner1 = (await mkStaff(H1, full)).token;
    owner2 = (await mkStaff(H2, full)).token;
    readOnly1 = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
    admin = (await mkAdmin([PERM.HOTEL_SCOPE_ALL, PERM.ROOM_MANAGE, PERM.BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());

  it('tạo loại phòng: 201, có audit', async () => {
    const res = await create(owner1);
    expect(res.status).toBe(201);
    expect(res.body.roomType).toMatchObject({ code: 'DLX', totalRooms: 5, pricing: { baseNightVnd: 700000 }, active: true, hotelId: H1 });
    expect(await count('audit_logs', "action = 'ROOM_TYPE.CREATE'")).toBe(1);
  });

  it('trùng code trong cùng khách sạn -> 409; khách sạn khác dùng lại -> 201', async () => {
    const dup = await create(owner1);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ROOM_CODE_TAKEN');
    expect((await create(owner2)).status).toBe(201);
  });

  it('validation: code thường / totalRooms âm / giá 0 / capacity 11 -> 422', async () => {
    for (const bad of [{ code: 'dlx' }, { totalRooms: -1 }, { baseNightVnd: 0 }, { capacity: 11 }]) {
      const res = await create(owner1, { code: 'ZZ1', ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('chỉ-đọc: POST 403, GET 200', async () => {
    expect((await create(readOnly1, { code: 'RO1' })).status).toBe(403);
    const list = await request(app).get('/v1/hotel/room-types').set(auth(readOnly1));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
  });

  it('cách ly khách sạn: nhân viên H2 sửa/xóa loại phòng của H1 -> 404; ?hotelId bị bỏ qua với token khách sạn', async () => {
    const rt = (await one<{ id: string }>("SELECT id FROM room_types WHERE hotel_id = $1 AND code = 'DLX'", [H1]))!.id;
    expect((await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(owner2)).send({ name: 'Hack' })).status).toBe(404);
    expect((await request(app).delete(`/v1/hotel/room-types/${rt}`).set(auth(owner2))).status).toBe(404);
    const res = await create(owner1, { code: 'ISO' }, `?hotelId=${H2}`);
    expect(res.status).toBe(201);
    expect(res.body.roomType.hotelId).toBe(H1);
  });

  it('Admin: thiếu hotelId -> 422 HOTEL_ID_REQUIRED; có hotelId -> đúng khách sạn đó', async () => {
    const no = await create(admin, { code: 'ADM' });
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe('HOTEL_ID_REQUIRED');
    const ok = await create(admin, { code: 'ADM' }, `?hotelId=${H2}`);
    expect(ok.status).toBe(201);
    expect(ok.body.roomType.hotelId).toBe(H2);
  });

  it('không hạ totalRooms dưới số đang đặt/giữ; hold hết hạn không tính; ngừng dùng bị chặn khi còn đơn', async () => {
    const H = await mkHotel({ code: 'H3' });
    const t = (await mkStaff(H, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    const rt = (await create(t, { code: 'PK', totalRooms: 3 })).body.roomType.id as string;
    const booked = await bookRoom(H, rt, 5, 2);
    expect(booked.status).toBe(201);
    const low = await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(t)).send({ totalRooms: 1 });
    expect(low.status).toBe(409);
    expect(low.body.error.code).toBe('ROOM_TOTAL_BELOW_RESERVED');
    expect(low.body.error.details.peak).toBe(2);
    expect((await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(t)).send({ totalRooms: 2 })).status).toBe(200);
    const del = await request(app).delete(`/v1/hotel/room-types/${rt}`).set(auth(t));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('ROOM_TYPE_IN_USE');
    expect((await one<any>('SELECT active FROM room_types WHERE id = $1', [rt]))!.active).toBe(true);
    // hold hết hạn thì không tính vào đỉnh
    await db.query("UPDATE room_reservations SET state = 'HOLD', hold_expires_at = now() - interval '1 minute' WHERE room_type_id = $1", [rt]);
    expect((await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(t)).send({ totalRooms: 1 })).status).toBe(200);
  });

  it('đổi giá không đổi đơn cũ; đơn mới theo giá mới', async () => {
    const H = await mkHotel({ code: 'H4' });
    const t = (await mkStaff(H, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    const rt = (await create(t, { code: 'PR', totalRooms: 5, baseNightVnd: 500000 })).body.roomType.id as string;
    const old = await bookRoom(H, rt, 10);
    await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(t)).send({ baseNightVnd: 900000 });
    const neu = await bookRoom(H, rt, 12);
    expect(old.body.booking.pricing.roomVnd).toBe(500000);
    expect(neu.body.booking.pricing.roomVnd).toBe(900000);
    expect((await one<any>('SELECT area_m2 FROM room_types WHERE id = $1', [rt]))!.areaM2).toBe(25); // patch không ghi đè trường khác
  });

  it('ngừng dùng: active=false + retiredAt; ẩn khỏi danh sách mặc định; không đặt được; lần 2 -> 409', async () => {
    const H = await mkHotel({ code: 'H5' });
    const t = (await mkStaff(H, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    const rt = (await create(t, { code: 'RT' })).body.roomType.id as string;
    const del = await request(app).delete(`/v1/hotel/room-types/${rt}`).set(auth(t));
    expect(del.status).toBe(200);
    expect(del.body.roomType).toMatchObject({ active: false });
    expect(del.body.roomType.retiredAt).toBeTruthy();
    expect((await request(app).get('/v1/hotel/room-types').set(auth(t))).body.items).toHaveLength(0);
    expect((await request(app).get('/v1/hotel/room-types?includeRetired=true').set(auth(t))).body.items).toHaveLength(1);
    expect((await bookRoom(H, rt, 3)).status).toBe(404);
    expect((await request(app).delete(`/v1/hotel/room-types/${rt}`).set(auth(t))).body.error.code).toBe('ROOM_TYPE_RETIRED');
  });

  it('tạm ngừng bán (active=false) không hủy đơn đã xác nhận, nhưng chặn đơn mới', async () => {
    const H = await mkHotel({ code: 'H6' });
    const t = (await mkStaff(H, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    const rt = (await create(t, { code: 'PA' })).body.roomType.id as string;
    const b = await bookRoom(H, rt, 4);
    await request(app).patch(`/v1/hotel/room-types/${rt}`).set(auth(t)).send({ active: false });
    expect((await one<any>('SELECT status FROM bookings WHERE code = $1', [b.body.booking.code]))!.status).toBe('CONFIRMED');
    expect((await bookRoom(H, rt, 6)).status).toBe(404);
  });
});
