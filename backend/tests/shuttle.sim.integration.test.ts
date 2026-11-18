import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { startShuttleStream } from '../api/realtime/shuttleFeed';
import { initSocket } from '../api/realtime/socket';
import { PERM } from '../config/permissions';
import { env } from '../config/env';
import { withTransaction } from '../database/pg';
import { signAccountToken } from '../lib/jwt';
import { publish, publishBookingStatus, shuttleBus, type ShuttleEvent } from '../services/shuttle/events';
import { clearOsrmCache } from '../services/shuttle/route';
import { simTick, startSimulation } from '../services/shuttle/simulation';
import { systemStep } from '../services/shuttle/trips';
import { closeDb, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | undefined | false> | T | undefined | false, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error('waitFor hết thời gian');
    await sleep(25);
  }
}

// OSRM giả: đường gấp khúc 5 điểm giữa hai tọa độ trong URL (test không dùng mạng).
const osrmMock = vi.fn(async (url: string) => {
  const m = /driving\/([\d.]+),([\d.]+);([\d.]+),([\d.]+)/.exec(String(url))!;
  const [a, b, c, d] = m.slice(1).map(Number) as [number, number, number, number];
  const coordinates = Array.from({ length: 5 }, (_, i) => [a + ((c - a) * i) / 4, b + ((d - b) * i) / 4]);
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 3000, duration: 300, geometry: { coordinates } }] }), { status: 200 });
});

run('tích hợp: mô phỏng vị trí xe, realtime, theo dõi của khách', () => {
  const app = createApp();
  let server: Server, url: string, stopFeed: () => void, stopSim: () => void;
  let n = 0;
  const ip = () => ({ 'X-Forwarded-For': `10.88.${Math.floor(++n / 250)}.${(n % 250) + 1}` });
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const saved = { auto: env.SHUTTLE_SIM_AUTO, scale: env.SHUTTLE_SIM_TIME_SCALE, tick: env.SHUTTLE_SIM_TICK_MS };
  const sockets: Socket[] = [];

  interface Ctx { hotelId: string; rt: string; owner: string; handler: string; driver: { id: string; token: string } }
  let seqPlate = 100;
  const setup = async (): Promise<Ctx> => {
    const hotelId = await mkHotel();
    const rt = await mkRoomType(hotelId, 30);
    const owner = (await mkStaff(hotelId, [PERM.FLEET_MANAGE, PERM.BOOKING_READ])).token;
    const handler = (await mkStaff(hotelId, [PERM.SHUTTLE_HANDLE])).token;
    const v = await request(app).post('/v1/hotel/vehicles').set(ip()).set(auth(owner)).send({ plate: `30A-${String(++seqPlate).padStart(5, '0')}`, seats: 7, model: 'Xe 7 chỗ' });
    const d = await request(app).post('/v1/hotel/drivers').set(ip()).set(auth(owner)).send({ email: `d${randomUUID().slice(0, 8)}@airrest.vn`, password: 'MatKhau-Tai-Xe-1', fullName: 'Tài xế Sim', phone: '0988777666', vehicleId: v.body.vehicle.id });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    return { hotelId, rt, owner, handler, driver: { id: d.body.driver.accountId, token: signAccountToken({ sub: d.body.driver.accountId, accountType: 'DRIVER' }) } };
  };
  const mkBooking = async (c: Ctx) => {
    const res = await request(app).post('/v1/bookings').set(ip()).set('Idempotency-Key', `fb-${randomUUID()}`).send({
      hotelId: c.hotelId, roomTypeId: c.rt, qty: 1, paymentMethod: 'AT_HOTEL', from: new Date(Date.now() + 30 * MIN).toISOString(), to: new Date(Date.now() + 30 * MIN + 86400_000).toISOString(),
      guest: { fullName: 'Khách Sim', phone: '0912345678' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const code = res.body.booking.code as string;
    await db.query("UPDATE bookings SET guest = guest || '{\"count\": 10}'::jsonb WHERE code = $1", [code]); // yêu cầu xe không được vượt số người của đơn
    return { id: (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id, code, phone: '0912345678' };
  };
  const lookupToken = async (b: { code: string; phone: string }) => (await request(app).post('/v1/shuttle-requests/lookup').set(ip()).send({ code: b.code, phone: b.phone })).body.guestToken as string;
  // Đơn + yêu cầu xe (điều phối ngay) -> chuyến OFFERED của tài xế.
  const offered = async (c: Ctx, direction = 'TO_HOTEL') => {
    const b = await mkBooking(c);
    const r = await request(app).post('/v1/shuttle-requests').set(ip()).set('Idempotency-Key', `sh-${randomUUID()}`).send({ code: b.code, phone: b.phone, direction, airport: 'HAN', pickupAt: new Date(Date.now() + 20 * MIN).toISOString(), passengers: 2 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const t = await waitFor(() => one<{ id: string }>('SELECT id FROM shuttle_trips WHERE request_id = $1', [r.body.shuttle.id]));
    return { b, tripId: t.id, requestId: r.body.shuttle.id as string };
  };
  const act = (c: Ctx, tripId: string, a: string) => request(app).post(`/v1/driver/trips/${tripId}/${a}`).set(ip()).set(auth(c.driver.token)).send({});
  const tripRow = (id: string) => one<any>('SELECT * FROM shuttle_trips WHERE id = $1', [id]);
  const connect = async (token: string): Promise<Socket> => {
    const s = ioClient(url, { auth: { token }, reconnection: false });
    sockets.push(s);
    await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', (e) => rej(e)); });
    return s;
  };
  const collect = (s: Socket, ev: string) => { const got: any[] = []; s.on(ev, (m) => got.push(m)); return got; };

  beforeAll(async () => {
    await freshDb({ roles: true });
    vi.stubGlobal('fetch', osrmMock);
    server = createServer(app);
    initSocket(server);
    stopFeed = startShuttleStream();
    env.SHUTTLE_SIM_TICK_MS = 3_600_000; // timer thật không chạy trong test: simTick được gọi tay
    stopSim = startSimulation();
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => { env.SHUTTLE_SIM_AUTO = saved.auto; env.SHUTTLE_SIM_TIME_SCALE = saved.scale; });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    stopSim(); stopFeed();
    env.SHUTTLE_SIM_TICK_MS = saved.tick;
    vi.unstubAllGlobals();
    await new Promise<void>((r) => server.close(() => r()));
    await closeDb();
  });

  it('tài xế nhận -> tuyến OSRM được lưu (source osrm, approach + ride); khách thấy route + position qua GET /v1/track/shuttle', async () => {
    clearOsrmCache(); osrmMock.mockClear();
    const c = await setup();
    const { b, tripId } = await offered(c);
    expect((await act(c, tripId, 'accept')).status).toBe(200);
    const row = await waitFor(async () => { const r = await tripRow(tripId); return r.route ? r : undefined; });
    expect(row.route.source).toBe('osrm');
    expect(row.route.approach.length).toBeGreaterThan(1);
    expect(row.route.ride.length).toBeGreaterThan(1);
    expect(osrmMock).toHaveBeenCalledTimes(2);
    expect(String(osrmMock.mock.calls[0]![0])).toContain('overview=full&geometries=geojson');
    const track = await request(app).get('/v1/track/shuttle').set(ip()).set(auth(await lookupToken(b)));
    expect(track.status).toBe(200);
    const trip = track.body.shuttles[0].trips[0];
    expect(trip.status).toBe('ACCEPTED');
    expect(trip.position).toMatchObject({ phase: 'APPROACH', speedKmh: 0 });
    expect(trip.route.approach.length).toBeGreaterThan(1);
    // nhân sự + tài xế cũng có route/position
    const staff = await request(app).get(`/v1/hotel/shuttle-trips/${tripId}`).set(ip()).set(auth(c.handler));
    expect(staff.body.trip.route.source).toBe('osrm');
    expect(staff.body.trip.position.phase).toBe('APPROACH');
    const drv = await request(app).get('/v1/driver/trips').set(ip()).set(auth(c.driver.token));
    expect(drv.body.items[0].position.phase).toBe('APPROACH');
  });

  it('OSRM lỗi -> đường thẳng source straight (vẫn có vị trí)', async () => {
    clearOsrmCache();
    osrmMock.mockImplementationOnce(async () => { throw new Error('timeout'); }).mockImplementationOnce(async () => new Response('x', { status: 500 }));
    const c = await setup();
    const { tripId } = await offered(c);
    await act(c, tripId, 'accept');
    const row = await waitFor(async () => { const r = await tripRow(tripId); return r.route ? r : undefined; });
    expect(row.route.source).toBe('straight');
    expect(row.route.approach).toHaveLength(2);
  });

  it('SIM_AUTO + tua nhanh: ACCEPTED -> EN_ROUTE -> ARRIVED -> ONBOARD -> DROPPED_OFF, log booking_events actor SYSTEM, request DONE', async () => {
    env.SHUTTLE_SIM_AUTO = true; env.SHUTTLE_SIM_TIME_SCALE = 100_000;
    const c = await setup();
    const { b, tripId, requestId } = await offered(c);
    await act(c, tripId, 'accept');
    await waitFor(async () => (await tripRow(tripId)).route);
    await waitFor(async () => { await simTick(); return (await tripRow(tripId)).status === 'DROPPED_OFF'; }, 8000);
    const ev = (await db.query<{ type: string; actorType: string }>('SELECT type, actor_type FROM booking_events WHERE booking_id = $1 AND type LIKE \'TRIP\\_%\' ORDER BY seq', [b.id])).rows;
    const sys = ev.filter((e) => e.actorType === 'SYSTEM').map((e) => e.type);
    expect(sys).toEqual(expect.arrayContaining(['TRIP_EN_ROUTE', 'TRIP_ARRIVED', 'TRIP_ONBOARD', 'TRIP_DROPPED_OFF']));
    expect(ev.find((e) => e.type === 'TRIP_ACCEPTED')!.actorType).toBe('DRIVER');
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [requestId]))!.status).toBe('DONE');
  });

  it('SIM_AUTO: chuyến OFFERED quá SHUTTLE_SIM_ACCEPT_DELAY_S được tài xế mô phỏng nhận (SYSTEM); chưa tới hạn hoặc SIM_AUTO=false thì không', async () => {
    const c = await setup();
    const { tripId } = await offered(c);
    const saveDelay = env.SHUTTLE_SIM_ACCEPT_DELAY_S;
    try {
      env.SHUTTLE_SIM_AUTO = true; env.SHUTTLE_SIM_ACCEPT_DELAY_S = 15; env.SHUTTLE_SIM_TIME_SCALE = 1;
      await simTick();
      expect((await tripRow(tripId)).status).toBe('OFFERED'); // mới gán, chưa tới 15 giây
      await db.query("UPDATE shuttle_trips SET offered_at = now() - interval '30 seconds' WHERE id = $1", [tripId]);
      env.SHUTTLE_SIM_AUTO = false;
      await simTick();
      expect((await tripRow(tripId)).status).toBe('OFFERED'); // không bật mô phỏng
      env.SHUTTLE_SIM_AUTO = true; env.SHUTTLE_SIM_ACCEPT_DELAY_S = 0;
      await simTick();
      expect((await tripRow(tripId)).status).toBe('OFFERED'); // 0 = tắt
      env.SHUTTLE_SIM_ACCEPT_DELAY_S = 15;
      await simTick();
      expect((await tripRow(tripId)).status).toBe('ACCEPTED');
      expect(await one("SELECT 1 AS x FROM booking_events WHERE type = 'TRIP_ACCEPTED' AND actor_type = 'SYSTEM' AND data->>'tripId' = $1", [tripId])).toBeTruthy();
    } finally { env.SHUTTLE_SIM_ACCEPT_DELAY_S = saveDelay; }
  });

  it('bấm tay thắng tự động; SIM_AUTO=false không tự chuyển; systemStep sau bấm tay -> 409 và simTick không lỗi', async () => {
    env.SHUTTLE_SIM_AUTO = false; env.SHUTTLE_SIM_TIME_SCALE = 100_000;
    const c = await setup();
    const { tripId } = await offered(c);
    await act(c, tripId, 'accept');
    await waitFor(async () => (await tripRow(tripId)).route);
    await simTick(); await simTick();
    expect((await tripRow(tripId)).status).toBe('ACCEPTED'); // AUTO tắt: đứng yên
    expect((await act(c, tripId, 'start')).status).toBe(200);
    await expect(systemStep(tripId, 'start')).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' }); // tay đã thắng
    env.SHUTTLE_SIM_AUTO = true;
    await expect(simTick()).resolves.toBeUndefined();
    expect((await act(c, tripId, 'arrived')).status === 200 || (await tripRow(tripId)).status === 'ARRIVED').toBe(true);
  });

  it('realtime: shuttle:update tới đúng phòng (khách đơn mình, nhân sự khách sạn mình, tài xế mình); đơn khác/khách sạn khác/tài xế khác không nhận; payload không PII', async () => {
    env.SHUTTLE_SIM_AUTO = false;
    const c = await setup();
    const o = await setup(); // khách sạn + tài xế + khách khác
    const { b, tripId } = await offered(c);
    const bOther = await mkBooking(o);
    const otherOffered = await offered(o);
    const guest = await connect(await lookupToken(b));
    const guestOther = await connect(await lookupToken(bOther));
    const staff = await connect(c.handler);
    const owner = await connect(c.owner);
    const staffOther = await connect(o.handler);
    const drv = await connect(c.driver.token);
    const drvOther = await connect(o.driver.token);
    const rooms = await new Promise<string[]>((r) => guest.emit('rooms:list', r));
    expect(rooms).toEqual([`booking:${b.code}`]);
    expect(await new Promise<string[]>((r) => staff.emit('rooms:list', r))).toContain(`hotel:${c.hotelId}:shuttle`);
    expect(await new Promise<string[]>((r) => drv.emit('rooms:list', r))).toEqual([`driver:${c.driver.id}`]);
    const got = { guest: collect(guest, 'shuttle:update'), guestOther: collect(guestOther, 'shuttle:update'), staff: collect(staff, 'shuttle:update'), owner: collect(owner, 'shuttle:update'), staffOther: collect(staffOther, 'shuttle:update'), drv: collect(drv, 'shuttle:update'), drvOther: collect(drvOther, 'shuttle:update') };
    expect((await act(c, tripId, 'accept')).status).toBe(200);
    await waitFor(() => got.guest.some((m) => m.type === 'TRIP_ACCEPTED') && got.drv.some((m) => m.type === 'TRIP_ACCEPTED'));
    await sleep(300);
    for (const k of ['guest', 'staff', 'owner', 'drv'] as const) {
      const m = got[k].find((x) => x.type === 'TRIP_ACCEPTED');
      expect(m, k).toMatchObject({ type: 'TRIP_ACCEPTED', bookingCode: b.code, tripId, status: 'ACCEPTED' });
      expect(Object.keys(m).sort(), k).toEqual(['at', 'bookingCode', 'requestId', 'status', 'tripId', 'type']);
    }
    expect(got.guest.every((m) => m.bookingCode === b.code)).toBe(true);
    expect(got.guestOther).toHaveLength(0);
    expect(got.staffOther).toHaveLength(0);
    expect(got.drvOther).toHaveLength(0);
    expect(otherOffered.tripId).toBeTruthy();
  });

  it('realtime: BOOKING_STATUS khi xác nhận/check-in/check-out/hủy tới khách đúng đơn + khách sạn mình; không PII; rollback thì không phát', async () => {
    env.SHUTTLE_SIM_AUTO = false;
    const c = await setup();
    const o = await setup();
    const staffPerm = await mkStaff(c.hotelId, [PERM.BOOKING_CHECKIN, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE]);
    const b = await mkBooking(c);
    const bOther = await mkBooking(o);
    const guest = await connect(await lookupToken(b));
    const guestOther = await connect(await lookupToken(bOther));
    const staff = await connect(staffPerm.token);
    const staffOther = await connect(o.handler);
    const got = { guest: collect(guest, 'shuttle:update'), guestOther: collect(guestOther, 'shuttle:update'), staff: collect(staff, 'shuttle:update'), staffOther: collect(staffOther, 'shuttle:update') };
    const post = (path: string, body = {}) => request(app).post(path).set(ip()).set(auth(staffPerm.token)).send(body);
    const seen = (k: keyof typeof got) => got[k].filter((m) => m.type === 'BOOKING_STATUS').map((m) => m.status);

    await db.query("UPDATE bookings SET status = 'PENDING', expires_at = now() + interval '1 hour' WHERE id = $1", [b.id]);
    await db.query("UPDATE room_reservations SET state = 'HOLD', hold_expires_at = now() + interval '1 hour' WHERE booking_id = $1", [b.id]);
    expect((await post(`/v1/hotel/bookings/${b.id}/confirm`)).status).toBe(200);
    expect((await post(`/v1/hotel/bookings/${b.id}/check-in`)).status).toBe(200);
    expect((await post(`/v1/hotel/bookings/${b.id}/check-out`)).status).toBe(200);
    await waitFor(() => seen('guest').length >= 3 && seen('staff').length >= 3);
    expect(seen('guest')).toEqual(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);
    expect(seen('staff')).toEqual(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);
    const m = got.guest.find((x) => x.type === 'BOOKING_STATUS');
    expect(m.bookingCode).toBe(b.code);
    expect(Object.keys(m).filter((k) => !['at', 'bookingCode', 'requestId', 'status', 'tripId', 'type'].includes(k))).toEqual([]);

    const b2 = await mkBooking(c);
    const g2got = collect(await connect(await lookupToken(b2)), 'shuttle:update');
    const cr = await request(app).post('/v1/change-requests').set(ip()).set('Idempotency-Key', `cx-${randomUUID()}`).send({ code: b2.code, phone: b2.phone, type: 'CANCEL', reasonCode: 'HEALTH' });
    expect(cr.status, JSON.stringify(cr.body)).toBe(201);
    expect((await post(`/v1/hotel/change-requests/${cr.body.request.id}/approve`)).status).toBe(200);
    await waitFor(() => g2got.some((x) => x.type === 'BOOKING_STATUS' && x.status === 'CANCELLED'));

    await sleep(300);
    expect(got.guest.every((x) => x.bookingCode === b.code)).toBe(true);
    expect(got.guestOther).toHaveLength(0);
    expect(got.staffOther).toHaveLength(0);

    const evts: ShuttleEvent[] = [];
    const spy = (e: ShuttleEvent) => evts.push(e);
    shuttleBus.on('event', spy);
    await expect(withTransaction(async () => { publishBookingStatus({ id: b.id, hotelId: c.hotelId }, 'CANCELLED'); throw new Error('rollback'); })).rejects.toThrow('rollback');
    await sleep(100);
    shuttleBus.off('event', spy);
    expect(evts).toHaveLength(0);
  });

  it('realtime: trip:position phát khi chạy (APPROACH/RIDE) và dừng sau DROPPED_OFF (phase DONE rồi im)', async () => {
    env.SHUTTLE_SIM_AUTO = true; env.SHUTTLE_SIM_TIME_SCALE = 5000;
    const c = await setup();
    const { b, tripId } = await offered(c);
    const guest = await connect(await lookupToken(b));
    const staff = await connect(c.handler);
    const drv = await connect(c.driver.token);
    const gp = collect(guest, 'trip:position'), sp = collect(staff, 'trip:position'), dp = collect(drv, 'trip:position');
    await act(c, tripId, 'accept');
    await waitFor(async () => (await tripRow(tripId)).route);
    await waitFor(async () => { await simTick(); return (await tripRow(tripId)).status === 'DROPPED_OFF'; }, 10000);
    await waitFor(() => gp.some((p) => p.phase === 'DONE'));
    expect(gp.some((p) => p.phase === 'APPROACH')).toBe(true);
    expect(gp.some((p) => p.phase === 'RIDE')).toBe(true);
    expect(gp[0]).toMatchObject({ tripId });
    expect(Object.keys(gp[0]).sort()).toEqual(['at', 'etaSec', 'heading', 'lat', 'lng', 'phase', 'speedKmh', 'tripId']);
    expect(sp.length).toBeGreaterThan(0);
    expect(dp.length).toBeGreaterThan(0);
    await sleep(200);
    const before = gp.length;
    await simTick(); await simTick(); await sleep(200);
    expect(gp.length).toBe(before); // đã xong: bộ đếm không phát thêm
  });

  it('token sai không kết nối được; token không phải GUEST/ACCOUNT hợp lệ bị từ chối', async () => {
    const s = ioClient(url, { auth: { token: 'khong-hop-le' }, reconnection: false });
    await new Promise<void>((r) => s.on('connect_error', (e) => { expect(e.message).toBe('INVALID_TOKEN'); r(); }));
    s.close();
  });

  it('GET /v1/track/shuttle: thiếu token 401, token nhân sự 403, token đơn khác không lộ dữ liệu; giới hạn 120/phút/đơn (429); không dính strictRateLimit', async () => {
    const c = await setup();
    const { b } = await offered(c);
    const other = await mkBooking(c); // đơn không có xe
    expect((await request(app).get('/v1/track/shuttle').set(ip())).status).toBe(401);
    expect((await request(app).get('/v1/track/shuttle').set(ip()).set(auth('abc'))).status).toBe(401);
    expect((await request(app).get('/v1/track/shuttle').set(ip()).set(auth(c.owner))).status).toBe(403);
    const mine = await request(app).get('/v1/track/shuttle').set(ip()).set(auth(await lookupToken(b)));
    expect(mine.body.shuttles).toHaveLength(1);
    const tokOther = await lookupToken(other);
    const theirs = await request(app).get('/v1/track/shuttle').set(ip()).set(auth(tokOther));
    expect(theirs.status).toBe(200);
    expect(theirs.body.shuttles).toHaveLength(0);
    expect(JSON.stringify(theirs.body)).not.toContain(b.code);
    // mỗi request một IP khác nhau (tránh giới hạn chung theo IP): chỉ bộ đếm theo đơn có tác dụng
    let last = 0;
    for (let i = 0; i < 125 && last !== 429; i++) last = (await request(app).get('/v1/track/shuttle').set(ip()).set(auth(tokOther))).status;
    expect(last).toBe(429);
    expect((await request(app).get('/v1/track/shuttle').set(ip()).set(auth(await lookupToken(b)))).status).toBe(200); // đơn khác không bị ảnh hưởng
  });

  it('khởi động lại: vị trí khôi phục từ route + mốc thời gian trong DB (không cần trạng thái bộ nhớ)', async () => {
    env.SHUTTLE_SIM_AUTO = false; env.SHUTTLE_SIM_TIME_SCALE = 1;
    const c = await setup();
    const { b, tripId } = await offered(c);
    await act(c, tripId, 'accept');
    await waitFor(async () => (await tripRow(tripId)).route);
    await act(c, tripId, 'start');
    const tok = await lookupToken(b);
    const get = async () => (await request(app).get('/v1/track/shuttle').set(ip()).set(auth(tok))).body.shuttles[0].trips[0].position;
    const p0 = await get();
    await db.query("UPDATE shuttle_trips SET en_route_at = now() - interval '100 seconds' WHERE id = $1", [tripId]); // như thể server tắt 100 giây rồi bật lại
    const p1 = await get();
    expect(p1.etaSec).toBeLessThan(p0.etaSec - 50);
    expect(p1.lat).not.toBe(p0.lat);
    expect(p1.speedKmh).toBe(env.SHUTTLE_SIM_SPEED_KMH);
  });

  it('publish trong transaction chỉ phát SAU commit; rollback thì không phát', async () => {
    const seen: ShuttleEvent[] = [];
    const l = (e: ShuttleEvent) => seen.push(e);
    shuttleBus.on('event', l);
    const evt = (type: string): ShuttleEvent => ({ type, hotelId: randomUUID(), bookingId: randomUUID(), audience: ['HOTEL'], payload: {} });
    await expect(withTransaction(async () => { publish(evt('RB')); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(seen).toHaveLength(0);
    await withTransaction(async () => { publish(evt('OK')); expect(seen).toHaveLength(0); });
    expect(seen.map((e) => e.type)).toEqual(['OK']);
    shuttleBus.off('event', l);
  });
});
