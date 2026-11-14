import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { confirmBooking, expireOverdueBookings, lazyExpire, rejectBooking, settlePayerBooking } from '../services/bookings/decisions';
import { withTransaction } from '../database/pg';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const guest = { fullName: 'Hành Khách', phone: '0912345678' };

run('tích hợp: đơn PAYER (createPayerBooking)', () => {
  let H = '';
  let auth: any;
  const win = (off: number) => ({ from: new Date(Date.now() + off * DAY), to: new Date(Date.now() + (off + 1) * DAY) });
  const mk = (rt: string, off: number, extra: object = {}) => createPayerBooking({ hotelId: H, rooms: [{ roomTypeId: rt, qty: 1 }], ...win(off), guest, ...extra });
  const settle = (id: string, to: 'CONFIRMED' | 'REJECTED', reason?: string) => withTransaction((tx) => settlePayerBooking(tx, id, to, { type: 'SYSTEM' }, reason, new Date()));
  const reservations = (id: string) => db.query('SELECT state, hold_expires_at FROM room_reservations WHERE booking_id = $1', [id]).then((r) => r.rows);

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'PY' });
    const t = await mkStaff(H, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE]);
    auth = { sub: t.id, accountType: 'HOTEL', hotelId: H, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] };
  });
  afterAll(async () => closeDb());

  it('tạo đơn: PENDING, HOLD đúng 5 phút, không payments, phí DV 0, gắn batch/group/simulated', async () => {
    const rt = await mkRoomType(H, 3, 600_000);
    const payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('P1','P1 Co','AIRLINE') RETURNING id"))!.id;
    const st = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    const fl = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN1','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    const batchId = (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id) VALUES ($1,$2,$3) RETURNING id', [payer, st, fl]))!.id;
    const groupId = (await one<{ id: string }>("INSERT INTO delay_groups (batch_id, pnr) VALUES ($1,'ABC123') RETURNING id", [batchId]))!.id;
    const b = await mk(rt, 3, { batchId, groupId, simulated: true, contractRoomVnd: 500_000 });
    expect(b.status).toBe('PENDING');
    expect(b.payment).toMatchObject({ method: 'PAYER', status: 'UNPAID', paidVnd: 0 });
    expect(b.pricing).toMatchObject({ serviceFeeVnd: 0, roomVnd: 500_000, totalVnd: 500_000 });
    const row = (await one<any>('SELECT * FROM bookings WHERE id = $1', [b.id]))!;
    expect([row.batchId, row.groupId, row.simulated]).toEqual([batchId, groupId, true]);
    const [r] = await reservations(b.id);
    expect(r.state).toBe('HOLD');
    expect(r.holdExpiresAt.getTime()).toBe(new Date(row.expiresAt).getTime());
    expect(Math.abs(row.expiresAt.getTime() - Date.now() - 5 * 60_000)).toBeLessThan(10_000);
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(0);
  });

  it('hết hạn: job cũ KHÔNG đụng đơn PAYER (job delay_room_offers xử lý); hết hạn qua expireOne -> EXPIRED, nhả HOLD, không hoàn tiền; giá hiện hành khi không có giá hợp đồng', async () => {
    const rt = await mkRoomType(H, 1, 700_000);
    const b = await mk(rt, 5, { holdMinutes: 2 });
    expect(b.pricing.totalVnd).toBe(700_000);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [b.id]);
    expect(await expireOverdueBookings()).toEqual({ expired: 0 });
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [b.id]))!.status).toBe('PENDING');
    await lazyExpire(b.id);
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [b.id]))!.status).toBe('EXPIRED');
    expect((await reservations(b.id))[0].state).toBe('RELEASED');
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    expect((await mk(rt, 5)).status).toBe('PENDING'); // phòng cuối được nhả
  });

  it('route cũ confirm/reject chặn đơn PAYER (409 USE_DELAY_OFFER_API), đơn vẫn PENDING', async () => {
    const rt = await mkRoomType(H, 1);
    const a = await mk(rt, 30);
    await expect(confirmBooking(auth, a.id)).rejects.toMatchObject({ status: 409, code: 'USE_DELAY_OFFER_API' });
    await expect(rejectBooking(auth, a.id, { reason: 'x' })).rejects.toMatchObject({ status: 409, code: 'USE_DELAY_OFFER_API' });
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [a.id]))!.status).toBe('PENDING');
  });

  it('settlePayerBooking: confirm -> CONFIRMED; reject -> REJECTED, nhả phòng, không hoàn tiền', async () => {
    const rt = await mkRoomType(H, 1);
    const a = await mk(rt, 8);
    expect((await settle(a.id, 'CONFIRMED'))?.status).toBe('CONFIRMED');
    expect((await reservations(a.id))[0]).toMatchObject({ state: 'CONFIRMED' });
    await expect(mk(rt, 8)).rejects.toMatchObject({ code: 'SOLD_OUT' }); // tồn bị trừ
    const rt2 = await mkRoomType(H, 1);
    const b = await mk(rt2, 8);
    expect((await settle(b.id, 'REJECTED', 'Hết phòng'))?.status).toBe('REJECTED');
    expect((await reservations(b.id))[0].state).toBe('RELEASED');
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
  });

  it('tranh phòng cuối: 2 đơn song song -> một đơn SOLD_OUT', async () => {
    const rt = await mkRoomType(H, 1);
    const r = await Promise.allSettled([mk(rt, 12), mk(rt, 12)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'SOLD_OUT' });
  });

  it('PAYER không tạo được qua POST /v1/bookings (422)', async () => {
    const rt = await mkRoomType(H, 1);
    const res = await request(createApp()).post('/v1/bookings').set('Idempotency-Key', `py-${Date.now()}`).send({ hotelId: H, rooms: [{ roomTypeId: rt, qty: 1 }], paymentMethod: 'PAYER', ...Object.fromEntries(Object.entries(win(20)).map(([k, v]) => [k, v.toISOString()])), guest });
    expect(res.status).toBe(422);
  });
});
