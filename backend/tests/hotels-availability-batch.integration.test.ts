import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../api/app';
import { db } from './support/db';
import { intervalsForCheck, loadActiveIntervals, loadActiveIntervalsMany } from '../services/rooms/availability';
import { closeDb, freshDb, mkHotel, mkRoomType } from './support/db';
import { createBookingVia } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: tồn phòng cho danh sách công khai (gộp truy vấn)', () => {
  const app = createApp();
  const ids: string[] = [];
  let hotelA = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelA = await mkHotel({ code: 'BA' });
    const hotelB = await mkHotel({ code: 'BB' });
    for (const [h, n] of [[hotelA, 3], [hotelA, 1], [hotelB, 2]] as const) ids.push(await mkRoomType(h, n, 500_000, { code: `RT${ids.length}` }));
    await createBookingVia(app, { hotelId: hotelA, roomTypeId: ids[0]!, qty: 2, offDays: 5 }); // CONFIRMED (tự duyệt)
    await createBookingVia(app, { hotelId: hotelA, roomTypeId: ids[1]!, qty: 1, offDays: 5 });
    await db.query(`INSERT INTO room_blocks (hotel_id, room_type_id, kind, qty, starts_at, ends_at, reason, created_by) SELECT hotel_id, id, 'MAINTENANCE', 1, now() + interval '4 day', now() + interval '8 day', 'bảo trì', '{"type":"SYSTEM"}'::jsonb FROM room_types WHERE id = $1`, [ids[2]]);
  });
  afterAll(async () => closeDb());

  it('loadActiveIntervalsMany cho đúng kết quả như loadActiveIntervals từng loại phòng (đơn + khóa)', async () => {
    const from = new Date(Date.now() + 4 * DAY);
    const to = new Date(Date.now() + 9 * DAY);
    const now = new Date();
    const many = await loadActiveIntervalsMany(db, ids, from, to, now);
    for (const id of ids) {
      const one = await loadActiveIntervals(db, id, from, to, now);
      const norm = (r: { reservations: Array<{ from: Date; to: Date; qty: number }>; blocks: Array<{ from: Date; to: Date; qty: number }> }) =>
        JSON.stringify([r.reservations.map((x) => [+x.from, +x.to, x.qty]).sort(), r.blocks.map((x) => [+x.from, +x.to, x.qty]).sort()]);
      expect(norm(many.get(id)!)).toBe(norm(one));
      expect(intervalsForCheck(many.get(id)!, now)).toHaveLength(intervalsForCheck(one, now).length);
    }
    expect(many.get(ids[0]!)!.reservations.length).toBeGreaterThan(0);
    expect(many.get(ids[2]!)!.blocks.length).toBe(1);
  });

  it('danh sách công khai trả roomsLeft đúng (trừ đơn và khóa), rỗng danh sách id không lỗi', async () => {
    const from = new Date(Date.now() + 5 * DAY).toISOString();
    const to = new Date(Date.now() + 6 * DAY).toISOString();
    const r = await request(app).get('/api/v1/hotels').query({ from, to });
    expect(r.status).toBe(200);
    const left = Object.fromEntries(r.body.items.flatMap((h: { rooms: Array<{ id: string; roomsLeft: number }> }) => h.rooms.map((x) => [x.id, x.roomsLeft])));
    expect(left[ids[0]!]).toBe(1); // 3 phòng - 2 đã đặt
    expect(left[ids[1]!]).toBe(0); // 1 phòng - 1 đã đặt
    expect(left[ids[2]!]).toBe(1); // 2 phòng - 1 khóa
    expect(await loadActiveIntervalsMany(db, [], new Date(), new Date(Date.now() + DAY), new Date())).toEqual(new Map());
  });
});
