import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceFee } from '@airrest/business-logic';
import { createApp } from '../api/app';
import { CONFIG_KEYS } from '../config/configKeys';
import { PERM } from '../config/permissions';
import { expireOverdueBookings } from '../services/bookings/decisions';
import { json } from '../database/pg';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const H1 = 3600_000;
const MIN = 60_000;
const FEE = CONFIG_KEYS['pricing.serviceFee'].default;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const HOURLY = { enabled: true, firstHourVnd: 120_000, nextHourVnd: 70_000, minHours: 1, maxHours: 8, cleaningMin: 30 };

run('tích hợp: đặt phòng theo giờ (giai đoạn 2)', () => {
  const app = createApp();
  let H = ''; // tự xác nhận
  let manualH = '';
  let R = ''; // 1 phòng, bật giờ
  let R3 = ''; // 3 phòng, bật giờ
  let N = ''; // Standard 5 phòng, KHÔNG bật giờ
  let O = ''; // giờ mở bán 8h-22h
  let M = ''; // duyệt tay, bật giờ
  let staff = '';
  let staffH = '';
  let HS = '';
  let RS = '';
  let n = 0;
  let ip = 0;
  let slot = 0;
  // Mỗi test dùng một ngày riêng (cách nhau 3 ngày) để không đụng nhau; mốc 10:00 giờ VN của ngày đó.
  const dayStart = (off: number) => { const d = new Date(Date.now() + off * DAY); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3)); };
  const nextDay = () => dayStart(10 + 3 * ++slot); // 10:00 VN
  const at = (day: Date, h: number, m = 0) => new Date(day.getTime() + (h - 10) * H1 + m * MIN);
  const hl = (roomTypeId: string, startsAt: Date, hours: number, qty = 1) => ({ roomTypeId, qty, kind: 'HOURLY', startsAt: startsAt.toISOString(), hours });
  const make = (hotelId: string, extra: Record<string, unknown>) =>
    request(app).post('/v1/bookings').set('Idempotency-Key', `hr-${++n}-${Date.now()}`).send({ hotelId, guest: { fullName: 'Khách Giờ', phone: '0912345678' }, ...extra });
  const state = async (code: string) => {
    const b = (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
    const rs = (await db.query<any>('SELECT room_type_id, qty, state, starts_at, ends_at FROM room_reservations WHERE booking_id = $1 ORDER BY starts_at, qty', [b.id])).rows;
    return { b, rs };
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    H = await mkHotel({ code: 'HR1' });
    manualH = await mkHotel({ code: 'HR2', manual: true });
    R = await mkRoomType(H, 1, 500_000, { name: 'Phòng giờ' });
    R3 = await mkRoomType(H, 3, 600_000, { name: 'Phòng giờ ba' });
    N = await mkRoomType(H, 5, 400_000, { name: 'Standard' });
    O = await mkRoomType(H, 2, 450_000, { name: 'Phòng khung giờ' });
    M = await mkRoomType(manualH, 2, 500_000, { name: 'Phòng giờ duyệt' });
    for (const id of [R, R3, M]) await db.query("UPDATE room_types SET pricing = pricing || jsonb_build_object('hourly', $2::jsonb) WHERE id = $1", [id, json(HOURLY)]);
    await db.query("UPDATE room_types SET pricing = pricing || jsonb_build_object('hourly', $2::jsonb) WHERE id = $1", [O, json({ ...HOURLY, openFromHour: 8, openToHour: 22 })]);
    HS = await mkHotel({ code: 'HR3' });
    RS = await mkRoomType(HS, 3, 500_000, { name: 'Phòng giờ xe' });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [HS]);
    await db.query("UPDATE room_types SET pricing = pricing || jsonb_build_object('hourly', $2::jsonb) WHERE id = $1", [RS, json(HOURLY)]);
    staffH = (await mkStaff(H, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE])).token;
    staff = (await mkStaff(manualH, [PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.ROOM_MANAGE])).token;
  });
  afterAll(async () => closeDb());

  it('báo giá đơn toàn giờ: không cần from/to, 3 giờ = 120k + 2×70k, nhân qty; trả kind/giờ ra từng dòng', async () => {
    const d = nextDay();
    const res = await request(app).post('/v1/bookings/quote').send({ hotelId: H, rooms: [hl(R3, at(d, 14), 3, 2)] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.roomVnd).toBe(2 * 260_000);
    expect(res.body.serviceFeeVnd).toBe(serviceFee(520_000, FEE));
    expect(res.body.stayType).toBe('HOURLY');
    expect(res.body.rooms[0]).toMatchObject({ kind: 'HOURLY', hours: 3, qty: 2, unitPriceVnd: 260_000, subtotalVnd: 520_000, startsAt: at(d, 14).toISOString(), endsAt: at(d, 17).toISOString() });
  });

  it('tạo đơn giờ: stay HOURLY = [giờ vào, giờ ra), reservation chặn thêm 30 phút dọn, lines có kind; tra cứu và danh sách thấy kind', async () => {
    const d = nextDay();
    const res = await make(H, { rooms: [hl(R3, at(d, 14), 3)], guests: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const b = res.body.booking;
    expect(b.stay).toMatchObject({ type: 'HOURLY', from: at(d, 14).toISOString(), to: at(d, 17).toISOString(), nights: 1 });
    expect(b.lines[0]).toMatchObject({ kind: 'HOURLY', hours: 3, unitPriceVnd: 260_000, subtotalVnd: 260_000, startsAt: at(d, 14).toISOString(), endsAt: at(d, 17).toISOString() });
    expect(b.pricing).toMatchObject({ roomVnd: 260_000, totalVnd: 260_000 + serviceFee(260_000, FEE) });
    const { rs } = await state(b.code);
    expect(new Date(rs[0].startsAt).getTime()).toBe(at(d, 14).getTime());
    expect(new Date(rs[0].endsAt).getTime()).toBe(at(d, 17, 30).getTime());
    const lk = await request(app).post('/v1/bookings/lookup').set(guestIp(++ip)).send({ code: b.code, phone: '0912345678' });
    expect(lk.body.booking.lines[0]).toMatchObject({ kind: 'HOURLY', hours: 3 });
    expect(lk.body.booking.stay.type).toBe('HOURLY');
  });

  it('trùng giờ và dọn phòng: sát giờ ra + 30 phút bị chặn, đúng mốc thì được; SOLD_OUT kèm giờ của dòng', async () => {
    const d = nextDay();
    expect((await make(H, { rooms: [hl(R, at(d, 14), 3)] })).status).toBe(201); // 14:00-17:00, nhả 17:30
    const clash = await make(H, { rooms: [hl(R, at(d, 17, 10), 2)] });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SOLD_OUT');
    expect(clash.body.error.details.soldOut[0]).toMatchObject({ roomTypeId: R, kind: 'HOURLY', hours: 2 });
    expect((await make(H, { rooms: [hl(R, at(d, 12, 45), 1)] })).status).toBe(409); // ra 13:45 + dọn 14:15 chạm 14:00
    expect((await make(H, { rooms: [hl(R, at(d, 12, 30), 1)] })).status).toBe(201); // ra 13:30 + dọn = đúng 14:00
    expect((await make(H, { rooms: [hl(R, at(d, 17, 30), 2)] })).status).toBe(201); // vào đúng lúc phòng được dọn xong
  });

  it('đêm và giờ chặn lẫn nhau theo đúng khoảng, loại phòng khác không bị ảnh hưởng', async () => {
    const d = nextDay();
    const night = await make(H, { rooms: [{ roomTypeId: R, qty: 1 }], from: at(d, 14).toISOString(), to: at(new Date(d.getTime() + DAY), 12).toISOString() });
    expect(night.status, JSON.stringify(night.body)).toBe(201);
    expect(night.body.booking.lines[0].kind).toBe('NIGHT');
    expect((await make(H, { rooms: [hl(R, at(d, 20), 2)] })).status).toBe(409); // trong đêm đã đặt
    expect((await make(H, { rooms: [hl(R3, at(d, 20), 2)] })).status).toBe(201); // loại khác
    const next = new Date(d.getTime() + DAY);
    expect((await make(H, { rooms: [hl(R, at(next, 11), 1)] })).status).toBe(409); // 11:00-12:00 còn trong đêm (trả 12:00)
    expect((await make(H, { rooms: [hl(R, at(next, 12), 2)] })).status).toBe(201); // từ 12:00
    // ngược lại: giờ trước, đêm sau
    const d2 = nextDay();
    expect((await make(H, { rooms: [hl(R, at(d2, 16), 2)] })).status).toBe(201);
    expect((await make(H, { rooms: [{ roomTypeId: R, qty: 1 }], from: at(d2, 14).toISOString(), to: at(new Date(d2.getTime() + DAY), 12).toISOString() })).status).toBe(409);
  });

  it('đơn trộn đêm + giờ: stay MIXED, tổng = đêm + giờ, giờ phải nằm trong khoảng ở', async () => {
    const d = nextDay();
    const d1 = new Date(d.getTime() + DAY);
    const from = at(d, 14).toISOString();
    const to = at(new Date(d.getTime() + 2 * DAY), 12).toISOString();
    const res = await make(H, { rooms: [{ roomTypeId: N, qty: 1 }, hl(R3, at(d1, 9), 2)], from, to, guests: 3 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const b = res.body.booking;
    expect(b.stay).toMatchObject({ type: 'MIXED', from, to, nights: 2 });
    expect(b.lines.map((l: any) => [l.kind, l.subtotalVnd])).toEqual([['NIGHT', 400_000 * 2], ['HOURLY', 190_000]]);
    expect(b.pricing.roomVnd).toBe(800_000 + 190_000);
    expect(b.pricing.totalVnd).toBe(990_000 + serviceFee(990_000, FEE));
    expect(b.roomTypeName).toBe('Standard +1 loại khác');
    const out = await make(H, { rooms: [{ roomTypeId: N, qty: 1 }, hl(R3, at(new Date(d.getTime() + 2 * DAY), 11), 3)], from, to });
    expect(out.status).toBe(422);
    expect(out.body.error.code).toBe('HOURLY_OUT_OF_STAY');
    expect(out.body.error.details).toMatchObject({ lineNo: 2, roomTypeId: R3 });
    expect((await make(H, { rooms: [{ roomTypeId: N, qty: 1 }, hl(R3, at(d1, 9), 2)] })).status).toBe(422); // trộn mà thiếu from/to
  });

  it('cùng loại phòng cuối: dòng đêm + dòng giờ của CHÍNH đơn cũng tranh tồn (không bán trùng)', async () => {
    const d = nextDay();
    const res = await make(H, { rooms: [{ roomTypeId: R, qty: 1 }, hl(R, at(d, 20), 2)], from: at(d, 14).toISOString(), to: at(new Date(d.getTime() + DAY), 12).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.error.details.soldOut).toHaveLength(1);
    expect(res.body.error.details.soldOut[0]).toMatchObject({ roomTypeId: R, kind: 'HOURLY' });
    expect(await count('bookings', "hotel_id = $1 AND stay_from = $2", [H, at(d, 14)])).toBe(0);
  });

  it('song song tranh phòng cuối của một khung giờ: đúng 1 đơn thành công', async () => {
    const d = nextDay();
    const r = await Promise.all([1, 2, 3, 4].map(() => make(H, { rooms: [hl(R, at(d, 15), 2)] })));
    expect(r.map((x) => x.status).sort()).toEqual([201, 409, 409, 409]);
    expect((await one<any>("SELECT coalesce(sum(qty),0)::int AS n FROM room_reservations WHERE room_type_id = $1 AND starts_at = $2 AND state <> 'RELEASED'", [R, at(d, 15)]))!.n).toBe(1);
    // hai khung giờ chồng nhau (một đơn trộn thứ tự ngược) cũng không deadlock
    const d2 = nextDay();
    const r2 = await Promise.all([
      make(H, { rooms: [hl(R, at(d2, 15), 2), hl(R3, at(d2, 15), 2)] }),
      make(H, { rooms: [hl(R3, at(d2, 16), 2), hl(R, at(d2, 16), 2)] }),
    ]);
    expect(r2.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('validate: HOURLY_NOT_ENABLED, HOURS_OUT_OF_RANGE, STARTS_AT_IN_PAST, OUTSIDE_OPEN_HOURS, thiếu startsAt/hours, NIGHT kèm giờ', async () => {
    const d = nextDay();
    const nope = await make(H, { rooms: [{ roomTypeId: R3, qty: 1 }, hl(N, at(d, 14), 2)], from: at(d, 14).toISOString(), to: at(new Date(d.getTime() + DAY), 12).toISOString() });
    expect(nope.status).toBe(422);
    expect(nope.body.error.code).toBe('HOURLY_NOT_ENABLED');
    expect(nope.body.error.details).toMatchObject({ lineNo: 2, roomTypeId: N });
    const range = await make(H, { rooms: [hl(R3, at(d, 14), 9)] });
    expect(range.body.error.code).toBe('HOURS_OUT_OF_RANGE');
    expect(range.body.error.details).toMatchObject({ lineNo: 1, hours: 9, minHours: 1, maxHours: 8 });
    const past = await make(H, { rooms: [hl(R3, new Date(Date.now() - H1), 2)] });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe('STARTS_AT_IN_PAST');
    const closed = await make(H, { rooms: [hl(O, at(d, 21), 3)] });
    expect(closed.body.error.code).toBe('OUTSIDE_OPEN_HOURS');
    expect(closed.body.error.details).toMatchObject({ openFromHour: 8, openToHour: 22 });
    expect((await make(H, { rooms: [hl(O, at(d, 7), 2)] })).body.error.code).toBe('OUTSIDE_OPEN_HOURS');
    expect((await make(H, { rooms: [hl(O, at(d, 19), 3)] })).status).toBe(201); // ra đúng 22:00
    expect((await make(H, { rooms: [{ roomTypeId: R3, qty: 1, kind: 'HOURLY', hours: 2 }] })).status).toBe(422); // thiếu startsAt
    expect((await make(H, { rooms: [{ roomTypeId: R3, qty: 1, kind: 'HOURLY', startsAt: at(d, 14).toISOString() }] })).status).toBe(422); // thiếu hours
    expect((await make(H, { rooms: [{ roomTypeId: N, qty: 1, hours: 2 }], from: at(d, 14).toISOString(), to: at(new Date(d.getTime() + DAY), 12).toISOString() })).status).toBe(422); // NIGHT mà có hours
    expect((await make(H, { rooms: [{ roomTypeId: N, qty: 1, kind: 'WEEKLY' }], from: at(d, 14).toISOString(), to: at(new Date(d.getTime() + DAY), 12).toISOString() })).status).toBe(422);
    expect((await make(H, { rooms: [hl(R3, at(d, 14), 2), hl(R3, at(d, 18), 2)] })).status).toBe(422); // trùng (loại phòng, kind)
  });

  it('xe đưa đón của đơn giờ: giờ đến bám giờ vào, số khách đi xe = guests, phí DV tính trên phòng + xe', async () => {
    const d = nextDay();
    const res = await make(HS, { rooms: [hl(RS, at(d, 14), 3, 2)], guests: 3, shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt: at(d, 13).toISOString() }] } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = res.body.booking.pricing;
    expect(res.body.shuttles[0]).toMatchObject({ passengers: 3, direction: 'TO_HOTEL' });
    expect(p.shuttleVnd).toBeGreaterThan(0);
    expect(p.roomVnd).toBe(520_000);
    expect(p.serviceFeeVnd).toBe(serviceFee(p.roomVnd + p.shuttleVnd, FEE));
    const far = await make(HS, { rooms: [hl(RS, at(d, 14), 3)], guests: 1, shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt: new Date(at(d, 14).getTime() - 3 * DAY).toISOString() }] } });
    expect(far.status).toBe(422);
    expect(far.body.error.code).toBe('PICKUP_OUT_OF_STAY_WINDOW');
  });

  it('khách sạn duyệt tay: giữ chỗ không quá giờ vào + 10 phút; reject và hết hạn nhả đúng; hủy nhả đúng; đổi ngày bị từ chối rõ', async () => {
    const hold = async (starts: Date, hours = 2) => { const r = await make(manualH, { rooms: [hl(M, starts, hours)] }); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.booking.code as string; };
    const soon = new Date(Math.ceil((Date.now() + 5 * MIN) / MIN) * MIN);
    const c0 = await hold(soon);
    const s0 = await state(c0);
    expect(s0.b.status).toBe('PENDING');
    expect(new Date(s0.b.expiresAt).getTime()).toBeLessThanOrEqual(soon.getTime() + 10 * MIN);
    const d = nextDay();
    const c1 = await hold(at(d, 14));
    const id1 = (await state(c1)).b.id;
    expect((await state(c1)).rs.map((r: any) => r.state)).toEqual(['HOLD']);
    expect((await request(app).post(`/v1/hotel/bookings/${id1}/reject`).set(auth(staff)).send({ reason: 'Hết phòng' })).status).toBe(200);
    expect((await state(c1)).rs.map((r: any) => r.state)).toEqual(['RELEASED']);
    const c2 = await hold(at(d, 14));
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE code = $1", [c2]);
    await db.query("UPDATE room_reservations SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = (SELECT id FROM bookings WHERE code = $1)", [c2]);
    await expireOverdueBookings();
    const s2 = await state(c2);
    expect(s2.b.status).toBe('EXPIRED');
    expect(s2.rs.map((r: any) => r.state)).toEqual(['RELEASED']);
    // hủy qua yêu cầu của khách
    const c3 = await hold(at(d, 14));
    const ask = (body: object) => request(app).post('/v1/change-requests').set(guestIp(++ip)).set('Idempotency-Key', `cr-${++n}-${Date.now()}`).send({ code: c3, phone: '0912345678', reasonCode: 'CHANGE_OF_PLAN', ...body });
    const chg = await ask({ type: 'CHANGE', newFrom: at(d, 15).toISOString(), newTo: at(d, 18).toISOString() });
    expect(chg.status).toBe(422);
    expect(chg.body.error.code).toBe('CHANGE_NOT_SUPPORTED_HOURLY');
    const cancel = await ask({ type: 'CANCEL' });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(201);
    expect((await request(app).post(`/v1/hotel/change-requests/${cancel.body.request.id}/approve`).set(auth(staff)).send({})).status).toBe(200);
    const s3 = await state(c3);
    expect(s3.b.status).toBe('CANCELLED');
    expect(s3.rs.map((r: any) => r.state)).toEqual(['RELEASED']);
    expect((await make(manualH, { rooms: [hl(M, at(d, 14), 2, 2)] })).status).toBe(201); // phòng đã nhả: đặt đủ 2 phòng
  });

  it('check-in / check-out đơn giờ nhả phòng; không đến chỉ khi đã qua giờ vào', async () => {
    const d = nextDay();
    const a = await make(H, { rooms: [hl(R, at(d, 14), 3)] });
    const id = (await state(a.body.booking.code)).b.id;
    expect((await make(H, { rooms: [hl(R, at(d, 14), 3)] })).status).toBe(409);
    expect((await request(app).post(`/v1/hotel/bookings/${id}/check-in`).set(auth(staffH)).send({})).status).toBe(200);
    expect((await state(a.body.booking.code)).rs.map((r: any) => r.state)).toEqual(['CHECKED_IN']);
    const out = await request(app).post(`/v1/hotel/bookings/${id}/check-out`).set(auth(staffH)).send({});
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect((await state(a.body.booking.code)).rs.map((r: any) => r.state)).toEqual(['COMPLETED']);
    expect((await make(H, { rooms: [hl(R, at(d, 14), 3)] })).status).toBe(201); // phòng trống lại
    // không đến
    const future = await make(H, { rooms: [hl(R3, at(nextDay(), 14), 2)] });
    const early = await request(app).post(`/v1/hotel/bookings/${(await state(future.body.booking.code)).b.id}/no-show`).set(auth(staffH)).send({});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('NO_SHOW_NOT_DUE');
    const started = await make(H, { rooms: [hl(R3, new Date(Date.now() - 2 * MIN), 2)] });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const ns = await request(app).post(`/v1/hotel/bookings/${(await state(started.body.booking.code)).b.id}/no-show`).set(auth(staffH)).send({});
    expect(ns.status, JSON.stringify(ns.body)).toBe(200);
    expect((await state(started.body.booking.code)).rs.map((r: any) => r.state)).toEqual(['RELEASED']);
  });

  it('hourly-slots: báo kín (đã gồm dọn phòng), quá khứ, ngoài giờ mở; loại không bật giờ -> 422', async () => {
    const d = nextDay();
    expect((await make(H, { rooms: [hl(R, at(d, 14), 3)] })).status).toBe(201); // 14:00-17:00, nhả 17:30
    const date = d.toISOString().slice(0, 10);
    const slots = async (roomTypeId: string, q: string) => request(app).get(`/v1/hotels/${H}/hourly-slots?roomTypeId=${roomTypeId}&${q}`);
    const res = await slots(R, `date=${date}&hours=2`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const by = Object.fromEntries(res.body.slots.map((s: any) => [s.time, s]));
    expect(res.body).toMatchObject({ hours: 2, priceVnd: 190_000 });
    expect(by['11:30']).toMatchObject({ available: true });
    expect(by['12:00']).toMatchObject({ available: false, reason: 'FULL' }); // ra 14:00 + dọn 14:30 chạm
    expect(by['16:30']).toMatchObject({ available: false, reason: 'FULL' });
    expect(by['17:00']).toMatchObject({ available: false, reason: 'FULL' });
    expect(by['17:30']).toMatchObject({ available: true });
    expect(by['17:30'].endsAt).toBe(at(d, 19, 30).toISOString());
    const other = await slots(R3, `date=${date}&hours=2`);
    expect(other.body.slots.find((s: any) => s.time === '14:00').available).toBe(true); // loại khác còn
    const past = await slots(R3, `date=${new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10)}&hours=2`);
    expect(past.body.slots.every((s: any) => !s.available && s.reason === 'PAST')).toBe(true);
    const o = await slots(O, `date=${date}&hours=2`);
    const times = o.body.slots.map((s: any) => s.time);
    expect(times[0]).toBe('08:00');
    expect(times).not.toContain('22:00');
    expect(o.body.slots.find((s: any) => s.time === '21:00')).toMatchObject({ available: false, reason: 'CLOSED' });
    expect(o.body.slots.find((s: any) => s.time === '20:00').available).toBe(true);
    expect((await slots(N, `date=${date}&hours=2`)).body.error.code).toBe('HOURLY_NOT_ENABLED');
    expect((await slots(R3, `date=${date}&hours=9`)).body.error.code).toBe('HOURS_OUT_OF_RANGE');
    expect((await slots(R3, 'date=2026-13-45&hours=2')).status).toBe(422);
    const today = new Date().toISOString().slice(0, 10);
    const t = await slots(R3, `date=${today}&hours=1`);
    expect(t.body.slots.some((s: any) => s.now)).toBe(true);
  });

  it('cấu hình theo loại phòng: PATCH hourly giữ nguyên giá đêm, đồng bộ cờ HOURLY của khách sạn; công khai trả cấu hình', async () => {
    const hid = await mkHotel({ code: 'HR9' });
    const owner = (await mkStaff(hid, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    const created = await request(app).post('/v1/hotel/room-types').set(auth(owner)).send({ code: 'STD', name: 'Standard', capacity: 2, beds: 1, areaM2: 20, totalRooms: 2, baseNightVnd: 400_000 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.roomType?.id ?? created.body.id;
    const bad = await request(app).patch(`/v1/hotel/room-types/${id}`).set(auth(owner)).send({ hourly: { enabled: true, firstHourVnd: 120_000 } });
    expect(bad.status).toBe(422);
    const ok = await request(app).patch(`/v1/hotel/room-types/${id}`).set(auth(owner)).send({ hourly: { enabled: true, firstHourVnd: 120_000, nextHourVnd: 70_000, minHours: 2, maxHours: 6 } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await one<any>('SELECT pricing FROM room_types WHERE id = $1', [id]))!.pricing).toMatchObject({ baseNightVnd: 400_000, hourly: { enabled: true, firstHourVnd: 120_000, nextHourVnd: 70_000, minHours: 2, maxHours: 6, cleaningMin: 30 } });
    expect((await one<any>('SELECT amenities FROM hotels WHERE id = $1', [hid]))!.amenities).toContain('HOURLY');
    const pub = await request(app).get(`/v1/hotels/${hid}`);
    expect(pub.body.rooms[0].hourly).toMatchObject({ enabled: true, firstHourVnd: 120_000, minHours: 2 });
    await request(app).patch(`/v1/hotel/room-types/${id}`).set(auth(owner)).send({ baseNightVnd: 450_000 });
    expect((await one<any>('SELECT pricing FROM room_types WHERE id = $1', [id]))!.pricing).toMatchObject({ baseNightVnd: 450_000, hourly: { enabled: true } }); // sửa giá đêm không mất cấu hình giờ
    await request(app).patch(`/v1/hotel/room-types/${id}`).set(auth(owner)).send({ hourly: { enabled: false } });
    expect((await one<any>('SELECT amenities FROM hotels WHERE id = $1', [hid]))!.amenities).not.toContain('HOURLY');
    expect((await request(app).get(`/v1/hotels/${hid}`)).body.rooms[0].hourly).toBeNull();
  });
});
