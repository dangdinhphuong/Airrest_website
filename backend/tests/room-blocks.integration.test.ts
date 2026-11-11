import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const iso = (off: number) => new Date(Date.now() + off * DAY).toISOString();
const ymd = (off: number) => iso(off).slice(0, 10);

run('tích hợp: tồn theo ngày + khóa phòng', () => {
  const app = createApp();
  let H = '';
  let HM = ''; // khách sạn duyệt tay (đơn vào HOLD)
  let tok = '';
  let tokM = '';
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const book = (hotelId: string, roomTypeId: string, off: number, qty = 1) =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `blk-${++n}-${Date.now()}`)
      .send({ hotelId, roomTypeId, qty, from: iso(off), to: iso(off + 1), guest: { fullName: 'Khách Test', phone: '0912345678' } });
  const block = (t: string, roomTypeId: string, off: number, extra: Record<string, unknown> = {}, days = 1) =>
    request(app).post('/v1/hotel/room-blocks').set(auth(t)).send({ roomTypeId, kind: 'LOCK', from: iso(off), to: iso(off + days), reason: 'Sửa chữa', ...extra });
  const full = [PERM.BOOKING_READ, PERM.ROOM_MANAGE];

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'B1' });
    HM = await mkHotel({ code: 'B2', manual: true });
    tok = (await mkStaff(H, full)).token;
    tokM = (await mkStaff(HM, full)).token;
  });
  afterAll(async () => closeDb());

  it('tồn theo ngày: booked/blocked/sellable đúng; tham số sai -> 422; loại phòng khác khách sạn -> 404', async () => {
    const rt = await mkRoomType(H, 3);
    expect((await book(H, rt, 20)).status).toBe(201);
    expect((await block(tok, rt, 23, { qty: 1 })).status).toBe(201);
    const res = await request(app).get(`/v1/hotel/room-types/${rt}/inventory?from=${ymd(20)}&to=${ymd(24)}`).set(auth(tok));
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(5);
    const byDate = Object.fromEntries(res.body.days.map((d: any) => [d.date, d]));
    const booked = Object.values<any>(byDate).filter((d) => d.booked === 1);
    expect(booked.length).toBeGreaterThanOrEqual(1);
    expect(booked.every((d) => d.sellable === 2)).toBe(true);
    expect(Object.values<any>(byDate).some((d) => d.blocked === 1 && d.sellable === 2)).toBe(true);
    const q = (from: string, to: string) => request(app).get(`/v1/hotel/room-types/${rt}/inventory?from=${from}&to=${to}`).set(auth(tok));
    expect((await q(ymd(5), ymd(4))).status).toBe(422);
    expect((await q('2026-01-01', '2026-03-10')).status).toBe(422);
    expect((await q('2026-02-30', '2026-03-01')).status).toBe(422);
    expect((await request(app).get(`/v1/hotel/room-types/${rt}/inventory?from=${ymd(1)}&to=${ymd(2)}`).set(auth(tokM))).status).toBe(404);
  });

  it('khóa không qty = đóng bán phần còn trống; đơn cũ vẫn CONFIRMED; đặt mới 409 SOLD_OUT', async () => {
    const rt = await mkRoomType(H, 3);
    const b = await book(H, rt, 30);
    const blk = await block(tok, rt, 30, { kind: 'MAINTENANCE' });
    expect(blk.status).toBe(201);
    expect(blk.body.block.qty).toBe(2);
    const again = await book(H, rt, 30);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SOLD_OUT');
    expect((await one<any>('SELECT status FROM bookings WHERE code = $1', [b.body.booking.code]))!.status).toBe('CONFIRMED');
    const none = await block(tok, rt, 30);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NOTHING_TO_BLOCK');
  });

  it('khóa vs đơn: HOLD còn hạn chặn, HOLD hết hạn không chặn, CONFIRMED/CHECKED_IN chặn, khóa chồng khóa chặn, gỡ khóa thì đặt được, liền kề không xung đột', async () => {
    const rt = await mkRoomType(HM, 1);
    expect((await book(HM, rt, 40)).status).toBe(201); // duyệt tay -> HOLD
    const conflict = await block(tokM, rt, 40, { qty: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('BLOCK_CONFLICT');
    await db.query("UPDATE room_reservations SET hold_expires_at = now() - interval '1 minute' WHERE room_type_id = $1", [rt]);
    const ok = await block(tokM, rt, 40, { qty: 1 });
    expect(ok.status).toBe(201);
    expect((await block(tokM, rt, 40, { qty: 1 })).status).toBe(409); // khóa chồng khóa
    expect((await request(app).delete(`/v1/hotel/room-blocks/${ok.body.block.id}`).set(auth(tokM))).status).toBe(200);
    expect((await request(app).delete(`/v1/hotel/room-blocks/${ok.body.block.id}`).set(auth(tokM))).body.error.code).toBe('ROOM_BLOCK_RELEASED');
    expect((await book(HM, rt, 40)).status).toBe(201); // khóa đã gỡ không trừ tồn
    for (const state of ['CONFIRMED', 'CHECKED_IN']) {
      await db.query('UPDATE room_reservations SET state = $2, hold_expires_at = NULL WHERE room_type_id = $1', [rt, state]);
      expect((await block(tokM, rt, 40, { qty: 1 })).status, state).toBe(409);
    }
    // khoảng liền kề: khóa ngày 50 -> 51, đặt ngày 51 -> 52 đều được
    const rt2 = await mkRoomType(H, 1);
    expect((await block(tok, rt2, 50, { qty: 1 })).status).toBe(201);
    expect((await book(H, rt2, 51)).status).toBe(201);
  });

  it('đặt phòng bị khóa bảo trì -> 409 SOLD_OUT; gỡ khóa -> 201', async () => {
    const rt = await mkRoomType(H, 1);
    const b = await block(tok, rt, 60, { kind: 'MAINTENANCE', qty: 1 });
    expect((await book(H, rt, 60)).body.error.code).toBe('SOLD_OUT');
    await request(app).delete(`/v1/hotel/room-blocks/${b.body.block.id}`).set(auth(tok));
    expect((await book(H, rt, 60)).status).toBe(201);
  });

  it('đặt phòng và khóa phòng đồng thời lên phòng cuối: đúng một bên thắng', async () => {
    for (let i = 0; i < 5; i++) {
      const rt = await mkRoomType(H, 1);
      const off = 100 + i * 5;
      const [a, b] = await Promise.all([book(H, rt, off), block(tok, rt, off, { qty: 1 })]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect((await count('room_reservations', 'room_type_id = $1', [rt])) + (await count('room_blocks', 'room_type_id = $1', [rt]))).toBe(1);
    }
  });

  it('validation và quyền: qty 0, lý do ngắn, to <= from, kind sai -> 422; chỉ-đọc -> 403; H khác -> 404; audit có', async () => {
    const rt = await mkRoomType(H, 2);
    for (const bad of [{ qty: 0 }, { reason: 'x' }, { kind: 'X' }]) expect((await block(tok, rt, 70, bad)).status, JSON.stringify(bad)).toBe(422);
    const rev = await request(app).post('/v1/hotel/room-blocks').set(auth(tok)).send({ roomTypeId: rt, kind: 'LOCK', from: iso(71), to: iso(70), reason: 'Sửa chữa' });
    expect(rev.status).toBe(422);
    const ro = (await mkStaff(H, [PERM.BOOKING_READ])).token;
    expect((await block(ro, rt, 70)).status).toBe(403);
    const made = await block(tok, rt, 70, { qty: 1 });
    expect((await request(app).delete(`/v1/hotel/room-blocks/${made.body.block.id}`).set(auth(tokM))).status).toBe(404);
    await request(app).delete(`/v1/hotel/room-blocks/${made.body.block.id}`).set(auth(tok));
    expect(await count('audit_logs', "action IN ('ROOM_BLOCK.CREATE','ROOM_BLOCK.RELEASE')")).toBeGreaterThanOrEqual(2);
    const list = await request(app).get(`/v1/hotel/room-blocks?roomTypeId=${rt}&active=false`).set(auth(tok));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('stats khách sạn trừ khóa đang hiệu lực', async () => {
    const H9 = await mkHotel({ code: 'B9' });
    const rt = await mkRoomType(H9, 2);
    const t = (await mkStaff(H9, full)).token;
    const b = await request(app).post('/v1/hotel/room-blocks').set(auth(t)).send({ roomTypeId: rt, kind: 'LOCK', from: new Date(Date.now() - 3600_000).toISOString(), to: iso(1), reason: 'Đóng bán' });
    expect(b.status).toBe(201);
    const a = await mkAdmin([PERM.HOTEL_SCOPE_ALL, 'admin:hotel:read']);
    const st = await request(app).get(`/v1/admin/hotels/${H9}/stats`).set(auth(a.token));
    expect(st.status).toBe(200);
    expect(st.body.rooms.blockedNow).toBe(2);
    expect(st.body.rooms.availableNow).toBe(0);
  });
});
