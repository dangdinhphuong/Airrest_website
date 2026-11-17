import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceFee } from '@airrest/business-logic';
import { createApp } from '../api/app';
import { CONFIG_KEYS } from '../config/configKeys';
import { PERM } from '../config/permissions';
import { expireOverdueBookings } from '../services/bookings/decisions';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const FEE = CONFIG_KEYS['pricing.serviceFee'].default;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: đơn nhiều loại phòng (giai đoạn 1)', () => {
  const app = createApp();
  let H = '';
  let manualH = '';
  let A = ''; // Standard, 5 phòng, 500k, sức chứa 2
  let B = ''; // Deluxe, 3 phòng, 900k, sức chứa 3
  let C = ''; // Suite, 1 phòng, 1.5tr, sức chứa 4
  let M1 = '';
  let M2 = '';
  let staff = '';
  let n = 0;
  let ip = 0;
  let off = 5;
  const nextOff = () => (off += 4);
  const make = (hotelId: string, extra: Record<string, unknown>, o = off) => {
    const t = Date.now(); // một mốc cho from/to, tránh lệch ms làm tròn thành 3 đêm
    return request(app).post('/v1/bookings').set('Idempotency-Key', `mr-${++n}-${Date.now()}`).send({
      hotelId, from: new Date(t + o * DAY).toISOString(), to: new Date(t + (o + 2) * DAY).toISOString(),
      guest: { fullName: 'Khách Nhiều Phòng', phone: '0912345678' }, ...extra,
    });
  };
  const state = async (code: string) => {
    const b = (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
    const rs = (await db.query<any>('SELECT room_type_id, qty, state FROM room_reservations WHERE booking_id = $1 ORDER BY qty', [b.id])).rows;
    return { b, rs };
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'MR1' });
    manualH = await mkHotel({ code: 'MR2', manual: true });
    A = await mkRoomType(H, 5, 500_000, { name: 'Standard' });
    B = await mkRoomType(H, 3, 900_000, { name: 'Deluxe' });
    C = await mkRoomType(H, 1, 1_500_000, { name: 'Suite' });
    await db.query('UPDATE room_types SET capacity = 3 WHERE id = $1', [B]);
    await db.query('UPDATE room_types SET capacity = 4 WHERE id = $1', [C]);
    M1 = await mkRoomType(manualH, 5, 500_000, { name: 'Standard' });
    M2 = await mkRoomType(manualH, 5, 700_000, { name: 'Deluxe' });
    staff = (await mkStaff(manualH, [PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());

  it('tạo đơn 3 loại: lines tăng lineNo, tổng tiền đúng, mỗi dòng một reservation', async () => {
    const o = nextOff();
    const res = await make(H, { rooms: [{ roomTypeId: A, qty: 2 }, { roomTypeId: B, qty: 1 }, { roomTypeId: C, qty: 1 }], guests: 9 }, o);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const room = 2 * 500_000 * 2 + 900_000 * 2 + 1_500_000 * 2;
    expect(res.body.booking.pricing).toMatchObject({ roomVnd: room, serviceFeeVnd: serviceFee(room, FEE), totalVnd: room + serviceFee(room, FEE) });
    expect(res.body.booking.lines.map((l: any) => [l.lineNo, l.roomTypeId, l.roomTypeName, l.qty, l.unitPriceVnd, l.subtotalVnd])).toEqual([
      [1, A, 'Standard', 2, 500_000, 2_000_000], [2, B, 'Deluxe', 1, 900_000, 1_800_000], [3, C, 'Suite', 1, 1_500_000, 3_000_000],
    ]);
    expect(res.body.booking).toMatchObject({ roomTypeName: 'Standard +2 loại khác', qty: 4 });
    const { b, rs } = await state(res.body.booking.code);
    expect(b.lines.map((l: any) => l.reservationId).every(Boolean)).toBe(true);
    expect(rs).toHaveLength(3);
    expect(new Set(rs.map((r: any) => r.roomTypeId))).toEqual(new Set([A, B, C]));
    // tra cứu khách + danh sách khách sạn
    const lk = await request(app).post('/v1/bookings/lookup').set(guestIp(++ip)).send({ code: res.body.booking.code, phone: '0912345678' });
    expect(lk.body.booking.lines).toHaveLength(3);
    expect(lk.body.booking.qty).toBe(4);
  });

  it('input cũ roomTypeId + qty quy về một dòng; rooms lẫn roomTypeId -> 422', async () => {
    const res = await make(H, { roomTypeId: A, qty: 2, guests: 3 }, nextOff());
    expect(res.status).toBe(201);
    expect(res.body.booking.lines).toHaveLength(1);
    expect(res.body.booking).toMatchObject({ roomTypeName: 'Standard', qty: 2 });
    expect((await make(H, { rooms: [{ roomTypeId: A, qty: 1 }], roomTypeId: A }, nextOff())).status).toBe(422);
    expect((await make(H, {}, nextOff())).status).toBe(422);
    expect((await make(H, { rooms: [] }, nextOff())).status).toBe(422);
  });

  it('trùng roomTypeId / loại phòng khách sạn khác / không tồn tại -> từ chối, không ghi gì', async () => {
    const before = await count('room_reservations');
    expect((await make(H, { rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: A, qty: 1 }] }, nextOff())).status).toBe(422);
    const other = await make(H, { rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: M1, qty: 1 }] }, nextOff());
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('ROOM_TYPE_NOT_FOUND');
    await db.query('UPDATE room_types SET active = false WHERE id = $1', [M2]);
    expect((await make(manualH, { rooms: [{ roomTypeId: M1, qty: 1 }, { roomTypeId: M2, qty: 1 }] }, nextOff())).status).toBe(404);
    await db.query('UPDATE room_types SET active = true WHERE id = $1', [M2]);
    expect(await count('room_reservations')).toBe(before);
  });

  it('vượt sức chứa tổng -> 422 GUESTS_EXCEED_CAPACITY; bằng đúng sức chứa -> 201', async () => {
    const rooms = [{ roomTypeId: A, qty: 1 }, { roomTypeId: B, qty: 1 }]; // 2 + 3 = 5
    const bad = await make(H, { rooms, guests: 6 }, nextOff());
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('GUESTS_EXCEED_CAPACITY');
    expect(bad.body.error.details).toMatchObject({ maxGuests: 5, qty: 2 });
    expect((await make(H, { rooms, guests: 5, children: 2 }, nextOff())).status).toBe(201);
  });

  it('thiếu chỗ ở một dòng: từ chối cả đơn, không rò reservation/booking, details nêu dòng thiếu', async () => {
    const o = nextOff();
    expect((await make(H, { roomTypeId: C, qty: 1, guests: 1 }, o)).status).toBe(201); // Suite (1 phòng) hết trong khoảng này
    const before = { bk: await count('bookings'), rr: await count('room_reservations') };
    const res = await make(H, { rooms: [{ roomTypeId: A, qty: 2 }, { roomTypeId: C, qty: 1 }], guests: 2 }, o);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOLD_OUT');
    expect(res.body.error.details.soldOut).toEqual([{ roomTypeId: C, roomTypeName: 'Suite', qty: 1 }]);
    expect({ bk: await count('bookings'), rr: await count('room_reservations') }).toEqual(before);
    // Standard vẫn còn đủ: đặt lại không có Suite thì được
    expect((await make(H, { rooms: [{ roomTypeId: A, qty: 2 }], guests: 2 }, o)).status).toBe(201);
  });

  it('hai đơn song song cùng loại phòng cuối (đơn trộn thứ tự ngược nhau): đúng 1 thành công, không deadlock, không rò', async () => {
    const o = nextOff();
    const r = await Promise.all([
      make(H, { rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: C, qty: 1 }], guests: 2 }, o),
      make(H, { rooms: [{ roomTypeId: C, qty: 1 }, { roomTypeId: A, qty: 1 }], guests: 2 }, o),
      make(H, { rooms: [{ roomTypeId: C, qty: 1 }], guests: 1 }, o),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409, 409]);
    const ok = r.find((x) => x.status === 201)!;
    const total = (await one<any>("SELECT coalesce(sum(qty),0)::int AS n FROM room_reservations WHERE room_type_id = $1 AND starts_at = $2 AND state <> 'RELEASED'", [C, new Date(ok.body.booking.stay.from)]))!.n;
    expect(total).toBe(1);
  });

  it('xe đưa đón: phí dịch vụ tính trên (tổng phòng + xe)', async () => {
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [H]);
    const o = nextOff();
    const pt = Date.now();
    const pickupAt = new Date(pt + (o + 0.5) * DAY).toISOString();
    const res = await make(H, { rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: B, qty: 1 }], guests: 4, shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt }] } }, o);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = res.body.booking.pricing;
    expect(p.shuttleVnd).toBeGreaterThan(0);
    expect(p.roomVnd).toBe((500_000 + 900_000) * 2);
    expect(p.serviceFeeVnd).toBe(serviceFee(p.roomVnd + p.shuttleVnd, FEE));
    expect(p.totalVnd).toBe(p.roomVnd + p.shuttleVnd + p.serviceFeeVnd);
    expect(res.body.shuttles[0].passengers).toBe(4);
    const q = await request(app).post('/v1/bookings/quote').send({ hotelId: H, rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: B, qty: 1 }], from: new Date(pt + o * DAY).toISOString(), to: new Date(pt + (o + 2) * DAY).toISOString(), shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt }] } });
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    expect(q.body).toMatchObject({ roomVnd: p.roomVnd, shuttleVnd: p.shuttleVnd, totalVnd: p.totalVnd, qty: 2 });
    expect(q.body.rooms).toHaveLength(2);
  });

  it('thanh toán online (SePay giả lập) đơn nhiều dòng + xe: payment = tổng đơn, thành CONFIRMED; hủy giữ lại tiền xe', async () => {
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [H]);
    const o = nextOff();
    const pickupAt = new Date(Date.now() + (o + 0.5) * DAY).toISOString();
    const res = await make(H, { rooms: [{ roomTypeId: A, qty: 1 }, { roomTypeId: B, qty: 1 }], guests: 4, paymentMethod: 'SEPAY', shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt }] } }, o);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { code, pricing } = res.body.booking;
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    const pay = (await one<any>("SELECT txn_ref, amount_vnd FROM payments WHERE booking_id = (SELECT id FROM bookings WHERE code = $1)", [code]))!;
    expect(Number(pay.amountVnd)).toBe(pricing.totalVnd);
    const sim = await request(app).post('/v1/payments/sepay/dev-simulate').send({ orderId: pay.txnRef });
    expect(sim.body.reply.status).toBe(200);
    const { b, rs } = await state(code);
    expect(b.status).toBe('CONFIRMED');
    expect(Number(b.paidVnd)).toBe(pricing.totalVnd);
    expect(rs.map((r: any) => r.state)).toEqual(['CONFIRMED', 'CONFIRMED']);
    const q = await request(app).post('/v1/change-requests/quote').set(guestIp(++ip)).send({ code, phone: '0912345678' });
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    expect(q.body.quote.shuttleKeepVnd).toBe(pricing.shuttleVnd);
    expect(q.body.quote.keepVnd).toBeGreaterThanOrEqual(pricing.shuttleVnd);
    expect(q.body.quote.refundVnd + q.body.quote.keepVnd).toBe(pricing.totalVnd);
  });

  it('khách sạn duyệt tay: reject nhả MỌI reservation; expire nhả MỌI reservation', async () => {
    const hold = async (o: number) => {
      const res = await make(manualH, { rooms: [{ roomTypeId: M1, qty: 2 }, { roomTypeId: M2, qty: 1 }], guests: 3 }, o);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body.booking.code as string;
    };
    const c1 = await hold(nextOff());
    expect((await state(c1)).rs.map((r: any) => r.state)).toEqual(['HOLD', 'HOLD']);
    const id1 = (await state(c1)).b.id;
    const rj = await request(app).post(`/v1/hotel/bookings/${id1}/reject`).set(auth(staff)).send({ reason: 'Hết phòng' });
    expect(rj.status, JSON.stringify(rj.body)).toBe(200);
    expect((await state(c1)).rs.map((r: any) => r.state)).toEqual(['RELEASED', 'RELEASED']);
    const hb = await request(app).get(`/v1/hotel/bookings/${id1}`).set(auth(staff));
    expect(hb.body.booking.lines).toHaveLength(2);
    expect(hb.body.booking).toMatchObject({ roomTypeName: 'Standard +1 loại khác', qty: 3 });

    const c2 = await hold(nextOff());
    const { b } = await state(c2);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [b.id]);
    await expireOverdueBookings();
    const s2 = await state(c2);
    expect(s2.b.status).toBe('EXPIRED');
    expect(s2.rs.map((r: any) => r.state)).toEqual(['RELEASED', 'RELEASED']);
  });

  it('khách hủy (duyệt yêu cầu) nhả mọi dòng; đổi ngày kiểm tồn mọi dòng rồi dời mọi reservation và tính lại từng dòng', async () => {
    const mk = async (o: number) => (await make(manualH, { rooms: [{ roomTypeId: M1, qty: 2 }, { roomTypeId: M2, qty: 1 }], guests: 3 }, o)).body.booking.code as string;
    const ask = async (code: string, body: object) => {
      const r = await request(app).post('/v1/change-requests').set(guestIp(++ip)).set('Idempotency-Key', `cr-${++n}-${Date.now()}`).send({ code, phone: '0912345678', reasonCode: 'CHANGE_OF_PLAN', ...body });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.request.id as string;
    };
    const approve = (id: string) => request(app).post(`/v1/hotel/change-requests/${id}/approve`).set(auth(staff)).send({});
    // xác nhận đơn để có thể hủy/đổi
    const confirm = async (code: string) => { const { b } = await state(code); await request(app).post(`/v1/hotel/bookings/${b.id}/confirm`).set(auth(staff)).send({}); };

    const c1 = await mk(nextOff());
    await confirm(c1);
    expect((await approve(await ask(c1, { type: 'CANCEL' }))).status).toBe(200);
    const s1 = await state(c1);
    expect(s1.b.status).toBe('CANCELLED');
    expect(s1.rs.map((r: any) => r.state)).toEqual(['RELEASED', 'RELEASED']);

    // đổi ngày: ngày mới thiếu Deluxe (M2 chỉ có 5 phòng, ta khóa hết) -> từ chối, không dời gì
    const c2 = await mk(nextOff());
    await confirm(c2);
    const newOff = nextOff() + 20;
    const newFrom = new Date(Date.now() + newOff * DAY);
    await db.query("INSERT INTO room_blocks (room_type_id, hotel_id, kind, qty, starts_at, ends_at, reason, created_by) VALUES ($1,$2,'LOCK',5,$3,$4,'test','{}'::jsonb)", [M2, manualH, newFrom, new Date(newFrom.getTime() + 3 * DAY)]);
    const reqId = await ask(c2, { type: 'CHANGE', newFrom: newFrom.toISOString(), newTo: new Date(newFrom.getTime() + 3 * DAY).toISOString() });
    const bad = await approve(reqId);
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('SOLD_OUT');
    expect(bad.body.error.message).toContain('Deluxe'); // nêu đúng dòng thiếu + đơn giữ nguyên
    expect(bad.body.error.message).toContain('giữ nguyên');
    const before = await state(c2);
    expect(before.rs.every((r: any) => r.state === 'CONFIRMED')).toBe(true);
    expect(new Date((await one<any>('SELECT starts_at FROM room_reservations WHERE booking_id = $1 LIMIT 1', [before.b.id]))!.startsAt).getTime()).not.toBe(newFrom.getTime());

    await request(app).post(`/v1/hotel/change-requests/${reqId}/reject`).set(auth(staff)).send({ note: 'Không đổi được' });
    // ngày khác còn đủ: đổi thành công, tính lại từng dòng theo số đêm mới
    const ok = nextOff() + 40;
    const okFrom = new Date(Date.now() + ok * DAY);
    const reqOk = await ask(c2, { type: 'CHANGE', newFrom: okFrom.toISOString(), newTo: new Date(okFrom.getTime() + 3 * DAY).toISOString() });
    const r = await approve(reqOk);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = await state(c2);
    expect(after.b.lines.map((l: any) => l.subtotalVnd)).toEqual([2 * 500_000 * 3, 700_000 * 3]);
    expect(after.b.pricing.roomVnd).toBe(2 * 500_000 * 3 + 700_000 * 3);
    expect(after.b.pricing.totalVnd).toBe(after.b.pricing.roomVnd + serviceFee(after.b.pricing.roomVnd, FEE));
    const times = (await db.query<any>('SELECT DISTINCT starts_at FROM room_reservations WHERE booking_id = $1', [after.b.id])).rows;
    expect(times).toHaveLength(1);
    expect(new Date(times[0].startsAt).getTime()).toBe(okFrom.getTime());
  });
});
