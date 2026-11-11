import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { signGuestToken } from '../lib/jwt';
import { bookingEvents } from '../services/events';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const PHONE = '0912345678';

run('tích hợp: xác nhận / từ chối booking', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let RT1 = ''; // total 1
  let RT3 = ''; // total 3
  let staff1 = '';
  let staff2 = '';
  let readOnly = '';
  let admin = '';
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const book = (hotel = H1, rt = RT3, off = 10, method: 'AT_HOTEL' | 'VNPAY' = 'AT_HOTEL') =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `dc-${++n}-${Date.now()}`)
      .send({ hotelId: hotel, roomTypeId: rt, paymentMethod: method, from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: PHONE } });
  const idOf = async (code: string) => (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id;
  const confirm = (id: string, t = staff1) => request(app).post(`/v1/hotel/bookings/${id}/confirm`).set(auth(t));
  const reject = (id: string, reason: unknown = 'Hết phòng', t = staff1) => request(app).post(`/v1/hotel/bookings/${id}/reject`).set(auth(t)).send({ reason });
  const lookup = (code: string) => request(app).post('/v1/bookings/lookup').send({ code, phone: PHONE });

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'D1', manual: true });
    H2 = await mkHotel({ code: 'D2', manual: true });
    RT1 = await mkRoomType(H1, 1);
    RT3 = await mkRoomType(H1, 3);
    const decide = [PERM.BOOKING_READ, PERM.BOOKING_DECIDE];
    staff1 = (await mkStaff(H1, decide)).token;
    staff2 = (await mkStaff(H2, decide)).token;
    readOnly = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
    admin = (await mkAdmin([PERM.BOOKING_DECIDE, PERM.HOTEL_SCOPE_ALL, PERM.BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());
  afterEach(() => bookingEvents.removeAllListeners('change'));

  it('KS duyệt tay: đơn PENDING + HOLD; confirm -> CONFIRMED, phòng CONFIRMED, audit, decision, khách thấy, phát sự kiện', async () => {
    const b = await book();
    expect(b.body.booking.status).toBe('PENDING');
    const id = await idOf(b.body.booking.code);
    const events: any[] = [];
    bookingEvents.on('change', (c) => events.push(c));
    const res = await confirm(id);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('CONFIRMED');
    const row = (await one<any>('SELECT * FROM bookings WHERE id = $1', [id]))!;
    expect(row.expiresAt).toBeUndefined();
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [id]))!.state).toBe('CONFIRMED');
    expect(await count('audit_logs', "action = 'BOOKING.CONFIRM' AND booking_id = $1", [id])).toBe(1);
    expect((await one<any>('SELECT decision FROM booking_decisions WHERE booking_id = $1', [id]))!.decision).toBe('CONFIRMED');
    const look = await lookup(b.body.booking.code);
    expect(look.body.booking.status).toBe('CONFIRMED');
    expect(look.body.booking.decision.status).toBe('CONFIRMED');
    expect(events).toContainEqual(expect.objectContaining({ status: 'CONFIRMED', isNew: false }));
  });

  it('KS tắt duyệt tay: đơn CONFIRMED ngay; confirm đơn đó -> 409 INVALID_STATE', async () => {
    const auto = await mkHotel({ code: 'AUTO', manual: false });
    const rt = await mkRoomType(auto, 2);
    const t = (await mkStaff(auto, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    const b = await book(auto, rt, 11);
    expect(b.body.booking.status).toBe('CONFIRMED');
    const res = await confirm(await idOf(b.body.booking.code), t);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('reject: lý do thiếu/ngắn -> 422; hợp lệ -> REJECTED, nhả phòng, tối đa 3 gợi ý, khách thấy lý do (không lộ decidedBy)', async () => {
    for (let i = 0; i < 4; i++) {
      const alt = await mkHotel({ code: `ALT${i}` });
      await db.query('UPDATE hotels SET airports = $2::jsonb WHERE id = $1', [alt, JSON.stringify([{ iata: 'HAN', km: 2 + i, minutes: 5 }])]);
      await mkRoomType(alt, 2);
    }
    const b = await book(H1, RT1, 12);
    const id = await idOf(b.body.booking.code);
    expect((await reject(id, null)).status).toBe(422);
    expect((await reject(id, 'ab')).status).toBe(422);
    const res = await reject(id, 'Hết phòng do sự cố');
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('REJECTED');
    expect(res.body.alternatives).toHaveLength(3);
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [id]))!.state).toBe('RELEASED');
    const look = await lookup(b.body.booking.code);
    expect(look.body.booking.decision).toMatchObject({ status: 'REJECTED', reason: 'Hết phòng do sự cố' });
    expect(look.body.booking.decision.alternatives).toHaveLength(3);
    expect(JSON.stringify(look.body)).not.toContain('decidedBy');
    expect((await book(H1, RT1, 12)).status).toBe(201); // phòng đã nhả
  });

  it('quyền: chỉ-đọc 403; KS khác 404; khách 403; không token 401; admin có scope-all xác nhận được và audit ghi ADMIN', async () => {
    const id = await idOf((await book(H1, RT3, 13)).body.booking.code);
    expect((await confirm(id, readOnly)).status).toBe(403);
    expect((await reject(id, 'Hết phòng', readOnly)).status).toBe(403);
    expect((await confirm(id, staff2)).status).toBe(404);
    expect((await request(app).post(`/v1/hotel/bookings/${id}/confirm`).set(auth(signGuestToken('AR-AAAAAAAA')))).status).toBe(403);
    expect((await request(app).post(`/v1/hotel/bookings/${id}/confirm`)).status).toBe(401);
    expect((await confirm(id, admin)).status).toBe(200);
    expect((await one<any>("SELECT actor FROM audit_logs WHERE action = 'BOOKING.CONFIRM' AND booking_id = $1", [id]))!.actor.type).toBe('ADMIN');
  });

  it('đồng thời confirm + reject, và reject lặp: đúng một bên thắng, một dòng decision', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await idOf((await book(H1, RT3, 20 + i)).body.booking.code);
      const [a, b] = await Promise.all([confirm(id), reject(id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const status = (await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status;
      expect(status).toBe(a.status === 200 ? 'CONFIRMED' : 'REJECTED');
      expect(await count('booking_decisions', 'booking_id = $1', [id])).toBe(1);
    }
    const id = await idOf((await book(H1, RT3, 30)).body.booking.code);
    expect((await reject(id)).status).toBe(200);
    const again = await reject(id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE');
  });

  it('đơn VNPay đã trả: reject tạo đúng một refund PENDING (vô hạn), đối soát không xử lý; AT_HOTEL không có refund', async () => {
    const b = await book(H1, RT3, 40, 'VNPAY');
    const id = await idOf(b.body.booking.code);
    const pay = (await one<any>('SELECT txn_ref FROM payments WHERE booking_id = $1', [id]))!;
    expect((await request(app).post('/v1/payments/vnpay/dev-simulate').send({ orderId: pay.txnRef })).status).toBe(200);
    const paid = (await one<any>('SELECT status, payment_status, paid_vnd FROM bookings WHERE id = $1', [id]))!;
    expect(paid).toMatchObject({ status: 'PENDING', paymentStatus: 'PAID' });
    const [a, c] = await Promise.all([reject(id), reject(id)]);
    expect([a.status, c.status].sort()).toEqual([200, 409]);
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: 'PENDING', amountVnd: paid.paidVnd, reasonCode: 'HOTEL_REJECTED' });
    expect(await count('refunds', "id = $1 AND due_at = 'infinity'", [refunds[0].id])).toBe(1);
    const fin = (await mkAdmin([PERM.ADMIN_PAYMENT_MANAGE])).token;
    expect((await request(app).post('/v1/admin/payments/reconcile').set(auth(fin))).status).toBe(200);
    expect((await one<any>('SELECT status FROM refunds WHERE id = $1', [refunds[0].id]))!.status).toBe('PENDING');
    const plain = await idOf((await book(H1, RT3, 41)).body.booking.code);
    await reject(plain);
    expect(await count('refunds', 'booking_id = $1', [plain])).toBe(0);
  });

  it('đơn quá hạn (job chưa chạy): confirm/reject -> 409 BOOKING_EXPIRED, đơn EXPIRED đã commit, phòng người khác không bị ảnh hưởng', async () => {
    const rt = await mkRoomType(H1, 1);
    const old = await book(H1, rt, 50);
    const id = await idOf(old.body.booking.code);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
    await db.query("UPDATE room_reservations SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = $1", [id]);
    const other = await book(H1, rt, 50); // hold quá hạn không chặn
    expect(other.status).toBe(201);
    const res = await confirm(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_EXPIRED');
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status).toBe('EXPIRED');
    expect((await one<any>("SELECT count(*)::int AS n FROM room_reservations WHERE room_type_id = $1 AND state = 'CONFIRMED'", [rt]))!.n).toBe(0);
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [await idOf(other.body.booking.code)]))!.state).toBe('HOLD');
    const id2 = await idOf((await book(H1, RT3, 51)).body.booking.code);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [id2]);
    expect((await reject(id2)).body.error.code).toBe('BOOKING_EXPIRED');
  });
});
