import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('migration 003: loại phòng + room_blocks', () => {
  let h = '';
  beforeAll(async () => {
    await freshDb({ roles: true });
    h = await mkHotel({ code: 'R1' });
  });
  afterAll(async () => closeDb());

  it('room_types có cột mới và code duy nhất theo khách sạn', async () => {
    await mkRoomType(h, 3, 600000, { code: 'DLX' });
    await expect(mkRoomType(h, 2, 500000, { code: 'DLX' })).rejects.toMatchObject({ code: '23505' });
    const h2 = await mkHotel({ code: 'R2' });
    await expect(mkRoomType(h2, 2, 500000, { code: 'DLX' })).resolves.toBeTruthy();
  });

  it('room_blocks từ chối ends_at <= starts_at và qty <= 0', async () => {
    const rt = await mkRoomType(h, 1);
    const ins = (qty: number, from: string, to: string) =>
      db.query(`INSERT INTO room_blocks (hotel_id, room_type_id, kind, qty, starts_at, ends_at, reason, created_by) VALUES ($1,$2,'LOCK',$3,$4,$5,'x','{}'::jsonb)`, [h, rt, qty, from, to]);
    await expect(ins(1, '2030-01-02', '2030-01-01')).rejects.toMatchObject({ code: '23514' });
    await expect(ins(0, '2030-01-01', '2030-01-02')).rejects.toMatchObject({ code: '23514' });
    await expect(ins(1, '2030-01-01', '2030-01-02')).resolves.toBeTruthy();
  });

  it('dòng room_types chèn thô nhận giá trị mặc định', async () => {
    await db.query(`INSERT INTO room_types (hotel_id,name,total_rooms,pricing) VALUES ($1,'X',1,'{"baseNightVnd":1}')`, [h]);
    const row = await one<any>("SELECT * FROM room_types WHERE name = 'X'");
    expect(row.capacity).toBe(2);
    expect(row.retiredAt).toBeUndefined();
  });

  it('mkStaff trả token dùng được', async () => {
    const s = await mkStaff(h, [PERM.BOOKING_READ]);
    const res = await request(createApp()).get('/v1/hotel/bookings').set('Authorization', `Bearer ${s.token}`);
    expect(res.status).toBe(200);
  });
});
