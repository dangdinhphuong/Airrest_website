import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: admin xem booking + chi tiết', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let admin = '';
  let staff1 = '';
  let rejectedId = '';
  const codes: string[] = [];
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'L1', manual: true });
    H2 = await mkHotel({ code: 'L2', manual: true });
    const rt1 = await mkRoomType(H1, 50);
    const rt2 = await mkRoomType(H2, 50);
    admin = (await mkAdmin([PERM.ADMIN_BOOKING_READ])).token;
    staff1 = (await mkStaff(H1, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    let n = 0;
    for (let i = 0; i < 25; i++) {
      const [hotel, rt] = i % 2 ? [H2, rt2] : [H1, rt1];
      const res = await request(app)
        .post('/v1/bookings')
        .set('Idempotency-Key', `ad-${++n}-${Date.now()}`)
        .send({ hotelId: hotel, roomTypeId: rt, from: new Date(Date.now() + (3 + i) * DAY).toISOString(), to: new Date(Date.now() + (4 + i) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });
      codes.push(res.body.booking.code);
    }
    // đơn đầu tiên (H1) bị từ chối để có lịch sử + decision
    rejectedId = (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [codes[0]]))!.id;
    await request(app).post(`/v1/hotel/bookings/${rejectedId}/reject`).set(auth(staff1)).send({ reason: 'Hết phòng' });
  });
  afterAll(async () => closeDb());

  it('phân trang keyset: đi hết 25 đơn, không trùng không sót, seq giảm dần, nextCursor cuối là null', async () => {
    const seen: number[] = [];
    let cursor: number | null = null;
    for (let page = 0; page < 5; page++) {
      const res: any = await request(app).get(`/v1/admin/bookings?limit=10${cursor === null ? '' : `&cursor=${cursor}`}`).set(auth(admin));
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((b: any) => b.seq));
      cursor = res.body.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect([...seen].sort((a, b) => b - a)).toEqual(seen);
    expect(cursor).toBeNull();
  });

  it('lọc theo status / hotelId / tiền tố code / khoảng ngày nhận phòng, kết hợp được', async () => {
    const get = (qs: string) => request(app).get(`/v1/admin/bookings?${qs}`).set(auth(admin));
    expect((await get('status=REJECTED')).body.items).toHaveLength(1);
    const h2 = await get(`hotelId=${H2}&limit=100`);
    expect(h2.body.items).toHaveLength(12);
    expect(h2.body.items.every((b: any) => b.hotelId === H2)).toBe(true);
    expect((await get(`code=${codes[1]!.slice(0, 5)}&limit=100`)).body.items.some((b: any) => b.code === codes[1])).toBe(true);
    const from = new Date(Date.now() + 3 * DAY - 3600_000).toISOString();
    const to = new Date(Date.now() + 6 * DAY).toISOString();
    expect((await get(`from=${from}&to=${to}&limit=100`)).body.items).toHaveLength(4); // ngày +3,+4,+5,+6
    expect((await get(`status=PENDING&hotelId=${H1}&limit=100`)).body.items).toHaveLength(12);
    const pct = await get('code=%25%25'); // '%%' không được khớp bừa mọi mã
    expect(pct.status === 422 || pct.body.items.length === 0).toBe(true);
  });

  it('tham số sai -> 422: to <= from, limit 101, cursor -1, status lạ', async () => {
    const get = (qs: string) => request(app).get(`/v1/admin/bookings?${qs}`).set(auth(admin));
    const a = new Date(Date.now() + DAY).toISOString();
    const b = new Date(Date.now()).toISOString();
    for (const qs of [`from=${a}&to=${b}`, 'limit=101', 'cursor=-1', 'status=FOO']) expect((await get(qs)).status, qs).toBe(422);
  });

  it('quyền: không token 401; KS 403; admin thiếu quyền 403; KS không lọc được sang khách sạn khác', async () => {
    expect((await request(app).get('/v1/admin/bookings')).status).toBe(401);
    expect((await request(app).get('/v1/admin/bookings').set(auth(staff1))).status).toBe(403);
    const sup = (await mkAdmin([PERM.BOOKING_READ])).token;
    expect((await request(app).get('/v1/admin/bookings').set(auth(sup))).status).toBe(403);
    const mine = await request(app).get(`/v1/hotel/bookings?hotelId=${H2}&limit=100`).set(auth(staff1));
    expect(mine.status).toBe(200);
    expect(mine.body.items.every((b: any) => b.hotelId === H1)).toBe(true);
  });

  it('chi tiết: admin thấy statusHistory + decision; KS khác 404; id sai 422; danh sách không kèm statusHistory', async () => {
    const d = await request(app).get(`/v1/admin/bookings/${rejectedId}`).set(auth(admin));
    expect(d.status).toBe(200);
    expect(d.body.booking.statusHistory.map((h: any) => h.to)).toEqual(['PENDING', 'REJECTED']);
    expect(d.body.decision).toMatchObject({ decision: 'REJECTED', reason: 'Hết phòng' });
    const other = (await mkStaff(H2, [PERM.BOOKING_READ])).token;
    expect((await request(app).get(`/v1/hotel/bookings/${rejectedId}`).set(auth(other))).status).toBe(404);
    expect((await request(app).get(`/v1/hotel/bookings/${rejectedId}`).set(auth(staff1))).status).toBe(200);
    expect((await request(app).get('/v1/admin/bookings/not-a-uuid').set(auth(admin))).status).toBe(422);
    const list = await request(app).get('/v1/admin/bookings?limit=1').set(auth(admin));
    expect(list.body.items[0]).not.toHaveProperty('statusHistory');
  });
});
