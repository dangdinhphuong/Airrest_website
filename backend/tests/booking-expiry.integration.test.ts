import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { expireOverdueBookings, confirmBooking } from '../services/bookings/decisions';
import { bookingEvents } from '../services/events';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const PHONE = '0912345678';

run('tích hợp: hết hạn đơn chờ xác nhận', () => {
  const app = createApp();
  let H = '';
  let n = 0;
  const book = (rt: string, off: number, method: 'AT_HOTEL' | 'VNPAY' = 'AT_HOTEL') =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `ex-${++n}-${Date.now()}`)
      .send({ hotelId: H, roomTypeId: rt, paymentMethod: method, from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: PHONE } });
  const idOf = async (code: string) => (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id;
  const overdue = (id: string) => db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'E1', manual: true });
  });
  afterAll(async () => closeDb());
  afterEach(() => bookingEvents.removeAllListeners('change'));

  it('quét: 2 đơn quá hạn -> EXPIRED + nhả phòng + decision + audit SYSTEM + sự kiện; đơn còn hạn không đổi; lần 2 idempotent', async () => {
    const rt = await mkRoomType(H, 5);
    const [a, b, c] = [await book(rt, 5), await book(rt, 6), await book(rt, 7)];
    const [ia, ib, ic] = [await idOf(a.body.booking.code), await idOf(b.body.booking.code), await idOf(c.body.booking.code)];
    await overdue(ia);
    await overdue(ib);
    const events: any[] = [];
    bookingEvents.on('change', (e) => events.push(e));
    expect(await expireOverdueBookings()).toEqual({ expired: 2 });
    for (const id of [ia, ib]) {
      expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status).toBe('EXPIRED');
      expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [id]))!.state).toBe('RELEASED');
      expect((await one<any>('SELECT decision FROM booking_decisions WHERE booking_id = $1', [id]))!.decision).toBe('EXPIRED');
      expect((await one<any>("SELECT actor FROM audit_logs WHERE action = 'BOOKING.EXPIRE' AND booking_id = $1", [id]))!.actor.type).toBe('SYSTEM');
    }
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [ic]))!.status).toBe('PENDING');
    expect(events.filter((e) => e.status === 'EXPIRED' && e.isNew === false)).toHaveLength(2);
    expect(await expireOverdueBookings()).toEqual({ expired: 0 });
  });

  it('nhả phòng thật: đơn quá hạn bị quét rồi đặt lại phòng cuối được', async () => {
    const rt = await mkRoomType(H, 1);
    const a = await book(rt, 15);
    await overdue(await idOf(a.body.booking.code));
    await expireOverdueBookings();
    expect((await book(rt, 15)).status).toBe(201);
  });

  it('không đụng CONFIRMED / CHECKED_IN / PENDING_PAYMENT có expires_at quá khứ', async () => {
    const rt = await mkRoomType(H, 5);
    const ids = [];
    for (const [i, st] of ['CONFIRMED', 'CHECKED_IN', 'PENDING_PAYMENT'].entries()) {
      const id = await idOf((await book(rt, 20 + i)).body.booking.code);
      await db.query("UPDATE bookings SET status = $2, expires_at = now() - interval '1 minute' WHERE id = $1", [id, st]);
      ids.push(id);
    }
    await expireOverdueBookings();
    const st = (await db.query<any>('SELECT status FROM bookings WHERE id = ANY($1::uuid[]) ORDER BY status', [ids])).rows.map((r) => r.status);
    expect(st).toEqual(['CHECKED_IN', 'CONFIRMED', 'PENDING_PAYMENT']);
  });

  it('đơn VNPay đã trả + quá hạn chờ duyệt: một refund PENDING HOTEL_NO_RESPONSE, quét hai lần vẫn một', async () => {
    const rt = await mkRoomType(H, 5);
    const b = await book(rt, 30, 'VNPAY');
    const id = await idOf(b.body.booking.code);
    const pay = (await one<any>('SELECT txn_ref FROM payments WHERE booking_id = $1', [id]))!;
    await request(app).post('/v1/payments/vnpay/dev-simulate').send({ orderId: pay.txnRef });
    await overdue(id);
    await expireOverdueBookings();
    await expireOverdueBookings();
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: 'PENDING', reasonCode: 'HOTEL_NO_RESPONSE' });
  });

  it('race: hai lượt quét + confirm trên cùng đơn quá hạn -> EXPIRED đúng một lần, confirm 409', async () => {
    const rt = await mkRoomType(H, 5);
    const id = await idOf((await book(rt, 40)).body.booking.code);
    await overdue(id);
    const t = await mkStaff(H, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE]);
    const auth = { kind: 'ACCOUNT' as const, sub: t.id, accountType: 'HOTEL' as const, hotelId: H, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] };
    const settled = await Promise.allSettled([expireOverdueBookings(), expireOverdueBookings(), confirmBooking(auth as any, id)]);
    expect(settled[2]!.status).toBe('rejected');
    expect(await count('audit_logs', "action = 'BOOKING.EXPIRE' AND booking_id = $1", [id])).toBe(1);
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status).toBe('EXPIRED');
  });

  it('tra cứu đơn quá hạn chưa quét: khách thấy EXPIRED ngay; reconcile báo expiredBookings', async () => {
    const rt = await mkRoomType(H, 5);
    const a = await book(rt, 50);
    await overdue(await idOf(a.body.booking.code));
    const look = await request(app).post('/v1/bookings/lookup').send({ code: a.body.booking.code, phone: PHONE });
    expect(look.body.booking.status).toBe('EXPIRED');
    expect(look.body.booking.decision.status).toBe('EXPIRED');
    const b = await book(rt, 51);
    await overdue(await idOf(b.body.booking.code));
    const fin = (await mkAdmin([PERM.ADMIN_PAYMENT_MANAGE])).token;
    const rec = await request(app).post('/v1/admin/payments/reconcile').set({ Authorization: `Bearer ${fin}` });
    expect(rec.status).toBe(200);
    expect(rec.body.expiredBookings).toBeGreaterThanOrEqual(1);
  });
});
