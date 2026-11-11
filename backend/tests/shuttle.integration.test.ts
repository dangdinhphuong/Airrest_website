import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { withTransaction } from '../database/pg';
import { cancelShuttlesForBooking } from '../services/shuttle/cascade';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { createBookingVia, guestIp, setStatus } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: xe đưa đón', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let RT1 = '';
  let RT2 = '';
  let ip = 0;
  let n = 0;
  let off = 3;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const g = () => guestIp(++ip + 120);
  const post = (path: string, body: object, extra: Record<string, string> = {}) => request(app).post(`/v1/shuttle-requests${path}`).set(g()).set(extra).send(body);
  const mk = async (hotel = H1, rt = RT1, status = 'CONFIRMED') => {
    const b = await createBookingVia(app, { hotelId: hotel, roomTypeId: rt, offDays: (off += 2) });
    if (status !== 'CONFIRMED') await setStatus(b.id, status);
    const stay = (await one<any>('SELECT stay FROM bookings WHERE id = $1', [b.id]))!.stay;
    return { ...b, from: new Date(stay.from) };
  };
  const body = (b: { code: string; phone: string; from: Date }, o: Record<string, unknown> = {}) => ({ code: b.code, phone: b.phone, direction: 'TO_HOTEL', airport: 'han', pickupAt: new Date(b.from.getTime() + 3600_000).toISOString(), ...o });
  const create = (b: any, o: Record<string, unknown> = {}, key = `sh-${++n}-${Date.now()}`) => post('/', body(b, o), { 'Idempotency-Key': key });

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'X1' });
    H2 = await mkHotel({ code: 'X2' });
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":6.5,\"minutes\":15}]'::jsonb WHERE id = $1", [H1]);
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":6.5,\"minutes\":15}]'::jsonb WHERE id = $1", [H2]);
    RT1 = await mkRoomType(H1, 30);
    RT2 = await mkRoomType(H2, 30);
  });
  afterAll(async () => closeDb());

  it('báo giá: HAN 6.5km ban ngày 100000; 22:00 VN phụ thu đêm 120000', async () => {
    const b = await mk();
    const day = new Date(b.from);
    day.setUTCHours(5, 0, 0, 0); // 12:00 VN
    const night = new Date(b.from);
    night.setUTCHours(15, 0, 0, 0); // 22:00 VN
    expect((await post('/quote', body(b, { pickupAt: day.toISOString() }))).body.quote).toMatchObject({ priceVnd: 100_000, night: false, distanceKm: 6.5 });
    expect((await post('/quote', body(b, { pickupAt: night.toISOString() }))).body.quote).toMatchObject({ priceVnd: 120_000, night: true });
  });

  it('tạo yêu cầu xe: 201 REQUESTED, giá chốt lúc tạo (đổi cấu hình sau không đổi), audit', async () => {
    const b = await mk();
    const day = new Date(b.from);
    day.setUTCHours(5, 0, 0, 0);
    const res = await create(b, { pickupAt: day.toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.shuttle).toMatchObject({ status: 'REQUESTED', priceVnd: 100_000 });
    expect(JSON.stringify(res.body)).not.toContain('hotelId');
    const cfgAdmin = (await mkAdmin([PERM.ADMIN_CONFIG_SHUTTLE, PERM.ADMIN_CONFIG_READ])).token;
    expect((await request(app).put('/v1/admin/configs/pricing.shuttle').set(auth(cfgAdmin)).send({ value: { baseVnd: 90_000, baseKm: 3, perKmVnd: 10_000, nightSurchargeBps: 2000, maxKm: 25 }, reason: 'Thử' })).status).toBe(201);
    expect((await one<any>('SELECT price_vnd FROM shuttle_requests WHERE id = $1', [res.body.shuttle.id]))!.priceVnd).toBe(100_000);
    expect(await count('audit_logs', "action = 'SHUTTLE.REQUEST' AND entity_id = $1", [res.body.shuttle.id])).toBe(1);
    await request(app).put('/v1/admin/configs/pricing.shuttle').set(auth(cfgAdmin)).send({ value: { baseVnd: 60_000, baseKm: 3, perKmVnd: 10_000, nightSurchargeBps: 2000, maxKm: 25 }, reason: 'Khôi phục' });
  });

  it('booking không đủ điều kiện -> 409 BOOKING_NOT_ELIGIBLE', async () => {
    for (const st of ['CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING_PAYMENT', 'CHECKED_OUT', 'NO_SHOW']) {
      const b = await mk(H1, RT1, st);
      const res = await create(b);
      expect(res.status, st).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_ELIGIBLE');
    }
  });

  it('giờ đón ngoài khoảng/quá khứ -> 422; sân bay không phục vụ -> 422; vượt maxKm -> 422', async () => {
    const b = await mk();
    expect((await create(b, { pickupAt: new Date(b.from.getTime() + 5 * DAY).toISOString() })).body.error.code).toBe('PICKUP_OUT_OF_STAY_WINDOW');
    expect((await create(b, { pickupAt: new Date(Date.now() - DAY).toISOString() })).body.error.code).toBe('PICKUP_OUT_OF_STAY_WINDOW');
    expect((await create(b, { airport: 'SGN' })).body.error.code).toBe('AIRPORT_NOT_SERVED');
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":30,\"minutes\":50}]'::jsonb WHERE id = $1", [H1]);
    expect((await create(b)).body.error.code).toBe('SHUTTLE_OUT_OF_RANGE');
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":6.5,\"minutes\":15}]'::jsonb WHERE id = $1", [H1]);
  });

  it('trùng yêu cầu cùng chiều -> 409; hủy rồi tạo lại được; chiều khác riêng; song song 1×201 + 1×409; Idempotency-Key lặp', async () => {
    const b = await mk();
    const first = await create(b);
    expect((await create(b)).body.error.code).toBe('SHUTTLE_ALREADY_REQUESTED');
    expect((await create(b, { direction: 'TO_AIRPORT' })).status).toBe(201);
    expect((await post(`/${first.body.shuttle.id}/cancel`, { code: b.code, phone: b.phone })).status).toBe(200);
    expect((await create(b)).status).toBe(201);
    const p = await mk();
    const [x, y] = await Promise.all([create(p), create(p)]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    const q = await mk();
    const same = guestIp(250);
    const k = `idem-shuttle-${Date.now()}`;
    const a1 = await request(app).post('/v1/shuttle-requests').set(same).set('Idempotency-Key', k).send(body(q));
    const a2 = await request(app).post('/v1/shuttle-requests').set(same).set('Idempotency-Key', k).send(body(q));
    expect(a2.body.shuttle.id).toBe(a1.body.shuttle.id);
  });

  it('khách hủy: REQUESTED -> CANCELLED; đã hủy -> 409; sai SĐT hoặc xe của booking khác -> 404; lookup không lộ hotelId; 429 sau 10 lần', async () => {
    const b = await mk();
    const other = await mk();
    const s = (await create(b)).body.shuttle.id as string;
    expect((await post(`/${s}/cancel`, { code: other.code, phone: other.phone })).status).toBe(404);
    expect((await post(`/${s}/cancel`, { code: b.code, phone: '0999999999' })).status).toBe(404);
    expect((await post(`/${s}/cancel`, { code: b.code, phone: b.phone })).body.shuttle.status).toBe('CANCELLED');
    expect((await post(`/${s}/cancel`, { code: b.code, phone: b.phone })).body.error.code).toBe('SHUTTLE_NOT_CANCELLABLE');
    const look = await post('/lookup', { code: b.code, phone: b.phone });
    expect(look.body.shuttles).toHaveLength(1);
    expect(JSON.stringify(look.body)).not.toContain('hotelId');
    const same = guestIp(251);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(app).post('/v1/shuttle-requests/lookup').set(same).send({ code: 'AR-ZZZZZZZZ', phone: '0912345678' })).status;
    expect(last).toBe(429);
  });

  describe('vận hành xe', () => {
    let staff1 = '';
    let staff2 = '';
    let ops = '';
    const act = (id: string, action: string, t: string, b: object = {}) => request(app).post(`/v1/hotel/shuttle-requests/${id}/${action}`).set(auth(t)).send(b);
    const driver = { driverName: 'Nguyễn Tài Xế', driverPhone: '0988777666' };
    beforeAll(async () => {
      staff1 = (await mkStaff(H1, [PERM.SHUTTLE_HANDLE])).token;
      staff2 = (await mkStaff(H2, [PERM.SHUTTLE_HANDLE])).token;
      ops = (await mkAdmin([PERM.SHUTTLE_HANDLE, PERM.HOTEL_SCOPE_ALL])).token;
    });
    const newShuttle = async (hotel = H1, rt = RT1, st = 'CONFIRMED') => {
      const b = await mk(hotel, rt, 'CONFIRMED');
      const s = (await create(b)).body.shuttle.id as string;
      if (st !== 'CONFIRMED') await setStatus(b.id, st);
      return { b, s };
    };

    it('thiếu quyền 403; KS khác 404; OPS thấy mọi khách sạn; lọc + phân trang', async () => {
      const x = await newShuttle(H1, RT1);
      await newShuttle(H2, RT2);
      const none = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
      expect((await request(app).get('/v1/hotel/shuttle-requests').set(auth(none))).status).toBe(403);
      expect((await act(x.s, 'assign', staff2, driver)).status).toBe(404);
      expect((await act(x.s, 'complete', staff2)).status).toBe(404);
      expect((await act(x.s, 'cancel', staff2, { note: 'Thử hủy' })).status).toBe(404);
      const hotels = new Set((await request(app).get('/v1/hotel/shuttle-requests?limit=100').set(auth(ops))).body.items.map((i: any) => i.hotelId));
      expect(hotels).toEqual(new Set([H1, H2]));
      const p1 = await request(app).get('/v1/hotel/shuttle-requests?status=REQUESTED&limit=1').set(auth(ops));
      expect(p1.body.nextCursor).not.toBeNull();
    });

    it('gán tài xế: ASSIGNED, khách thấy driver, audit; SĐT sai 422; booking PENDING 409; gán lại được', async () => {
      const x = await newShuttle();
      expect((await act(x.s, 'assign', staff1, { ...driver, driverPhone: '123' })).status).toBe(422);
      const res = await act(x.s, 'assign', staff1, driver);
      expect(res.status).toBe(200);
      expect(res.body.shuttle.status).toBe('ASSIGNED');
      const look = await post('/lookup', { code: x.b.code, phone: x.b.phone });
      expect(look.body.shuttles[0].driver.name).toBe('Nguyễn Tài Xế');
      expect((await act(x.s, 'assign', staff1, { ...driver, driverName: 'Tài Xế Mới' })).status).toBe(200);
      expect(await count('audit_logs', "action = 'SHUTTLE.ASSIGN' AND entity_id = $1", [x.s])).toBe(2);
      const p = await newShuttle(H1, RT1, 'PENDING');
      expect((await act(p.s, 'assign', staff1, driver)).body.error.code).toBe('BOOKING_NOT_CONFIRMED');
    });

    it('hoàn tất: ASSIGNED->DONE; REQUESTED->DONE hoặc lần 2 -> 409; hủy nhân sự cần note', async () => {
      const x = await newShuttle();
      expect((await act(x.s, 'complete', staff1)).body.error.code).toBe('INVALID_TRANSITION');
      await act(x.s, 'assign', staff1, driver);
      expect((await act(x.s, 'complete', staff1)).body.shuttle.status).toBe('DONE');
      expect((await act(x.s, 'complete', staff1)).status).toBe(409);
      const y = await newShuttle();
      expect((await act(y.s, 'cancel', staff1, { note: 'ab' })).status).toBe(422);
      expect((await act(y.s, 'cancel', staff1, { note: 'Không có tài xế' })).body.shuttle.status).toBe('CANCELLED');
      expect((await post('/lookup', { code: y.b.code, phone: y.b.phone })).body.shuttles[0].status).toBe('CANCELLED');
    });

    it('cancelShuttlesForBooking: trả số xe bị hủy, DONE giữ nguyên, booking khác không bị ảnh hưởng', async () => {
      const a = await mk();
      const other = await mk();
      const s1 = (await create(a)).body.shuttle.id as string;
      const s2 = (await create(a, { direction: 'TO_AIRPORT' })).body.shuttle.id as string;
      await create(other);
      await act(s2, 'assign', staff1, driver);
      await act(s2, 'complete', staff1);
      const cancelled = await withTransaction((tx) => cancelShuttlesForBooking(tx, a.id, { type: 'SYSTEM' }, 'Booking đã hủy'));
      expect(cancelled).toBe(1);
      expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [s1]))!.status).toBe('CANCELLED');
      expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [s2]))!.status).toBe('DONE');
      expect(await count("shuttle_requests", "booking_id = $1 AND status = 'REQUESTED'", [other.id])).toBe(1);
    });

    it('duyệt hủy booking -> xe REQUESTED/ASSIGNED thành CANCELLED (cùng transaction, có audit)', async () => {
      const reqStaff = (await mkStaff(H1, [PERM.REQUEST_HANDLE])).token;
      const b = await mk();
      const s = (await create(b)).body.shuttle.id as string;
      const crId = (await request(app).post('/v1/change-requests').set(g()).set('Idempotency-Key', `cx-${++n}-${Date.now()}`).send({ code: b.code, phone: b.phone, type: 'CANCEL', reasonCode: 'HEALTH' })).body.request.id;
      expect((await request(app).post(`/v1/hotel/change-requests/${crId}/approve`).set(auth(reqStaff)).send({})).status).toBe(200);
      const row = (await one<any>('SELECT status, cancelled_at FROM shuttle_requests WHERE id = $1', [s]))!;
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelledAt).toBeTruthy();
      expect(await count('audit_logs', "action = 'SHUTTLE.CANCEL' AND entity_id = $1", [s])).toBe(1);
    });
  });
});
