import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { env } from '../config/env';
import { simTick } from '../services/shuttle/simulation';
import { systemSetExternal } from '../services/shuttle/trips';
import { closeDb, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const MIN = 60_000;

run('tích hợp: mô phỏng xe ngoài (tự đặt xe + tự chạy)', () => {
  const app = createApp();
  let n = 0;
  const ip = () => ({ 'X-Forwarded-For': `10.99.${Math.floor(++n / 250)}.${(n % 250) + 1}` });
  const saved = { auto: env.SHUTTLE_SIM_AUTO, scale: env.SHUTTLE_SIM_TIME_SCALE };
  let hotelId: string, rt: string, handler: string;

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel();
    rt = await mkRoomType(hotelId, 30);
    handler = (await mkStaff(hotelId, [PERM.SHUTTLE_HANDLE])).token;
    env.SHUTTLE_SIM_TIME_SCALE = 1;
  });
  afterEach(() => { env.SHUTTLE_SIM_AUTO = saved.auto; });
  afterAll(async () => { env.SHUTTLE_SIM_TIME_SCALE = saved.scale; await closeDb(); });

  // Khách sạn không có xe -> yêu cầu xe sinh ngay chuyến EXTERNAL NEEDS_EXTERNAL.
  const needsExternal = async () => {
    const res = await request(app).post('/v1/bookings').set(ip()).set('Idempotency-Key', `fb-${randomUUID()}`).send({
      hotelId, roomTypeId: rt, qty: 1, paymentMethod: 'AT_HOTEL', from: new Date(Date.now() + 30 * MIN).toISOString(), to: new Date(Date.now() + 30 * MIN + 86400_000).toISOString(),
      guest: { fullName: 'Khách Ngoài', phone: '0912345678' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const code = res.body.booking.code as string;
    await db.query("UPDATE bookings SET guest = guest || '{\"count\": 10}'::jsonb WHERE code = $1", [code]);
    const r = await request(app).post('/v1/shuttle-requests').set(ip()).set('Idempotency-Key', `sh-${randomUUID()}`).send({ code, phone: '0912345678', direction: 'TO_HOTEL', airport: 'HAN', pickupAt: new Date(Date.now() + 20 * MIN).toISOString(), passengers: 2 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    let t: any;
    for (let k = 0; k < 160 && !t; k++) { t = await one<any>('SELECT * FROM shuttle_trips WHERE request_id = $1', [r.body.shuttle.id]); if (!t) await new Promise((res) => setTimeout(res, 25)); }
    expect(t).toMatchObject({ kind: 'EXTERNAL', status: 'NEEDS_EXTERNAL', simulated: false });
    return { id: t.id as string, requestId: r.body.shuttle.id as string, code, bookingId: (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id };
  };
  const trip = (id: string) => one<any>('SELECT * FROM shuttle_trips WHERE id = $1', [id]);
  const guestTrip = async (code: string) => (await request(app).post('/v1/shuttle-requests/lookup').set(ip()).send({ code, phone: '0912345678' })).body.shuttles[0].trips[0];
  const staffTrip = async (id: string) => (await request(app).get(`/v1/hotel/shuttle-trips/${id}`).set(ip()).set({ Authorization: `Bearer ${handler}` })).body.trip;

  it('AUTO: quá thời gian mô phỏng -> tự đặt xe ngoài (SYSTEM) -> ARRIVED -> ONBOARD -> DROPPED_OFF, request DONE', async () => {
    env.SHUTTLE_SIM_AUTO = true;
    const x = await needsExternal();
    const now = Date.now();
    await simTick(now + 3_000);
    expect((await trip(x.id)).status).toBe('NEEDS_EXTERNAL'); // chưa tới 8 giây mô phỏng
    await simTick(now + 9_000);
    const t = await trip(x.id);
    expect(t).toMatchObject({ status: 'ACCEPTED', simulated: true, extDriverName: 'Tài xế mô phỏng', extPlate: '51A-DEMO', extPhone: '+84900000000' });
    expect(['GRAB', 'XANHSM']).toContain(t.provider);
    expect(t.shareUrl).toMatch(/\/DEMO-[0-9A-F]{8}$/);
    expect(t.extEtaAt).toBeTruthy();
    expect(t.route).toBeFalsy(); // xe ngoài không có tuyến
    const ev = await one<any>("SELECT actor_type, actor_id, data FROM booking_events WHERE booking_id = $1 AND type = 'EXTERNAL_LINK_SET'", [x.bookingId]);
    expect(ev).toMatchObject({ actorType: 'SYSTEM', data: { provider: t.provider, simulated: true } });

    const g = await guestTrip(x.code);
    expect(g).toMatchObject({ kind: 'EXTERNAL', status: 'ACCEPTED', simulated: true, shareUrl: t.shareUrl });
    expect(g.route).toBeUndefined();
    expect(g.position).toBeUndefined();
    expect((await staffTrip(x.id)).external).toMatchObject({ simulated: true, provider: t.provider });

    await simTick(Date.now() + 5_000); // chưa đủ 10 giây kể từ lúc nhận
    expect((await trip(x.id)).status).toBe('ACCEPTED');
    await simTick(Date.now() + 60_000);
    expect((await trip(x.id)).status).toBe('ARRIVED');
    await simTick(Date.now() + 60_000);
    expect((await trip(x.id)).status).toBe('ONBOARD');
    await simTick(Date.now() + 60_000);
    expect((await trip(x.id)).status).toBe('DROPPED_OFF');
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [x.requestId]))!.status).toBe('DONE');
    for (const type of ['TRIP_ARRIVED', 'TRIP_ONBOARD', 'TRIP_DROPPED_OFF', 'SHUTTLE_DONE']) {
      expect((await one<any>('SELECT actor_type FROM booking_events WHERE booking_id = $1 AND type = $2', [x.bookingId, type]))!.actorType, type).toBe('SYSTEM');
    }
  });

  it('nhân sự nhập tay thắng: mô phỏng bỏ qua (409), chuyến nhập thật KHÔNG bị tự chạy, simulated=false', async () => {
    env.SHUTTLE_SIM_AUTO = true;
    const x = await needsExternal();
    const r = await request(app).post(`/v1/hotel/shuttle-trips/${x.id}/external`).set(ip()).set({ Authorization: `Bearer ${handler}` }).send({ provider: 'GRAB', shareUrl: 'https://r.grab.com/ride/real1', plate: '51F-123.45', driverName: 'Lê Văn Thật', phone: '0901234567' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await expect(systemSetExternal(x.id, { provider: 'GRAB', shareUrl: 'https://r.grab.com/g/DEMO-AAAAAAAA' })).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    await simTick(Date.now() + 3_600_000);
    await simTick(Date.now() + 3_600_000);
    const t = await trip(x.id);
    expect(t).toMatchObject({ status: 'ACCEPTED', simulated: false, shareUrl: 'https://r.grab.com/ride/real1', extDriverName: 'Lê Văn Thật' });
    expect(await guestTrip(x.code)).toMatchObject({ simulated: false, shareUrl: 'https://r.grab.com/ride/real1' });
    // Nhân sự sửa thông tin chuyến mô phỏng cũng chuyển nó thành chuyến thật.
    const y = await needsExternal();
    await simTick(Date.now() + 9_000);
    expect((await trip(y.id)).simulated).toBe(true);
    await request(app).post(`/v1/hotel/shuttle-trips/${y.id}/external`).set(ip()).set({ Authorization: `Bearer ${handler}` }).send({ provider: 'XANHSM', shareUrl: 'https://xanhsm.com/share/real2' });
    await simTick(Date.now() + 3_600_000);
    expect(await trip(y.id)).toMatchObject({ status: 'ACCEPTED', simulated: false, provider: 'XANHSM' });
  });

  it('AUTO=false: không tự đặt xe, không tự chạy', async () => {
    env.SHUTTLE_SIM_AUTO = false;
    const x = await needsExternal();
    await simTick(Date.now() + 3_600_000);
    expect(await trip(x.id)).toMatchObject({ status: 'NEEDS_EXTERNAL', simulated: false });
    expect(await one<any>("SELECT 1 FROM booking_events WHERE booking_id = $1 AND type = 'EXTERNAL_LINK_SET'", [x.bookingId])).toBeUndefined();
    expect((await guestTrip(x.code)).simulated).toBe(false);
  });
});
