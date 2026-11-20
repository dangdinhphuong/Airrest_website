import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { dispatchDueRequests, dispatchRequest } from '../services/shuttle/dispatch';
import { closeStaleTrips } from '../services/shuttle/trips';
import { closeDb, count, db, freshDb, mkAccount, mkAdmin, mkHotel, mkRoomType, mkStaff, one, systemRoleId } from './support/db';
import { setStatus } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const MIN = 60_000;

run('tích hợp: đội xe, điều phối, tài xế, xe ngoài', () => {
  const app = createApp();
  let n = 0;
  const ip = () => ({ 'X-Forwarded-For': `10.77.${Math.floor(++n / 250)}.${(n % 250) + 1}` }); // mỗi request một bucket rate limit
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token?: string, body?: object) => {
    const r = request(app)[method](path).set(ip());
    if (token) r.set(auth(token));
    return body ? r.send(body) : r;
  };

  interface Ctx { hotelId: string; rt: string; owner: string; vehicles: string[]; drivers: { id: string; token: string }[] }
  let seqPlate = 0;
  // Khách sạn mới + xe (theo số chỗ) mỗi xe một tài xế (tạo qua API, đúng luồng thật).
  const setup = async (seats: number[]): Promise<Ctx> => {
    const hotelId = await mkHotel();
    const rt = await mkRoomType(hotelId, 30);
    const owner = (await mkStaff(hotelId, [PERM.FLEET_MANAGE, PERM.BOOKING_READ])).token;
    const ctx: Ctx = { hotelId, rt, owner, vehicles: [], drivers: [] };
    for (const s of seats) {
      const v = await call('post', '/api/v1/hotel/vehicles', owner, { plate: `30A-${String(++seqPlate).padStart(5, '0')}`, seats: s, model: `Xe ${s} chỗ` });
      expect(v.status, JSON.stringify(v.body)).toBe(201);
      const d = await call('post', '/api/v1/hotel/drivers', owner, { email: `d${randomUUID().slice(0, 8)}@airrest.vn`, password: 'MatKhau-Tai-Xe-1', fullName: `Tài xế ${s}`, phone: '0988777666', vehicleId: v.body.vehicle.id });
      expect(d.status, JSON.stringify(d.body)).toBe(201);
      ctx.vehicles.push(v.body.vehicle.id);
      ctx.drivers.push({ id: d.body.driver.accountId, token: signAccountToken({ sub: d.body.driver.accountId, accountType: 'DRIVER' }) });
    }
    return ctx;
  };
  // Đơn CONFIRMED có giờ nhận phòng gần (để giờ đón trong 30 phút nằm trong cửa sổ lưu trú).
  // `guests` = số người của đơn: yêu cầu xe mặc định lấy số này và không được vượt (mặc định 10 để các ca đoàn gửi passengers <= 10).
  const mkBooking = async (c: Ctx, guests = 10) => {
    const res = await call('post', '/api/v1/bookings').set('Idempotency-Key', `fb-${randomUUID()}`).send({
      hotelId: c.hotelId, roomTypeId: c.rt, qty: 1, paymentMethod: 'AT_HOTEL', from: new Date(Date.now() + 30 * MIN).toISOString(), to: new Date(Date.now() + 30 * MIN + 86400_000).toISOString(),
      guest: { fullName: 'Khách Đoàn', phone: '0912345678' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const code = res.body.booking.code as string;
    await db.query("UPDATE bookings SET guest = guest || jsonb_build_object('count', $2::int) WHERE code = $1", [code, guests]);
    return { id: (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id, code, phone: '0912345678' };
  };
  const guest = (path: string, body: object, key?: string) => call('post', `/api/v1/shuttle-requests${path}`).set(key ? { 'Idempotency-Key': key } : {}).send(body);
  const reqShuttle = (b: { code: string; phone: string }, passengers: number, minutes = 20, direction = 'TO_HOTEL') =>
    guest('', { code: b.code, phone: b.phone, direction, airport: 'HAN', pickupAt: new Date(Date.now() + minutes * MIN).toISOString(), passengers }, `sh-${randomUUID()}`);
  const lookup = (b: { code: string; phone: string }) => guest('/lookup', { code: b.code, phone: b.phone });
  const act = (token: string, id: string, action: string, body: object = {}) => call('post', `/api/v1/driver/trips/${id}/${action}`, token, body);
  const tripsOf = (requestId: string) => db.query<any>('SELECT * FROM shuttle_trips WHERE request_id = $1 ORDER BY seq', [requestId]).then((r) => r.rows);

  beforeAll(async () => {
    await freshDb({ roles: true });
  });
  afterAll(async () => closeDb());

  it('passengers: không gửi = 1 (yêu cầu cũ cũng 1); báo giá trả passengers; ngoài 1..30 -> 422', async () => {
    const c = await setup([]);
    const b = await mkBooking(c, 1); // đơn 1 người (đơn cũ cũng là 1)
    const body = { code: b.code, phone: b.phone, direction: 'TO_HOTEL', airport: 'HAN', pickupAt: new Date(Date.now() + 120 * MIN).toISOString() };
    expect((await guest('/quote', body)).body.quote.passengers).toBe(1);
    const created = await guest('', body, `sh-${randomUUID()}`);
    expect(created.body.shuttle.passengers).toBe(1);
    expect((await one<any>('SELECT passengers FROM shuttle_requests WHERE id = $1', [created.body.shuttle.id]))!.passengers).toBe(1);
    expect((await guest('/quote', { ...body, passengers: 31 })).status).toBe(422);
    expect((await guest('/quote', { ...body, passengers: 0 })).status).toBe(422);
  });

  it('luồng đủ: 5 khách + 2 xe 4 chỗ -> 2 chuyến OFFERED -> nhận -> chạy -> trả khách -> request DONE; khách không thấy xe trước khi nhận; nhật ký đủ', async () => {
    const c = await setup([4, 4]);
    const b = await mkBooking(c);
    const created = await reqShuttle(b, 5);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const rid = created.body.shuttle.id as string;
    const trips = await tripsOf(rid);
    expect(trips.map((t) => [t.kind, t.status, t.seats].join())).toEqual(expect.arrayContaining(['OWN,OFFERED,4', 'OWN,OFFERED,1']));
    expect(trips).toHaveLength(2);

    // Khách: chỉ "đang tìm xe", không lộ xe/tài xế/trường nội bộ.
    const before = await lookup(b);
    expect(before.body.shuttles[0].trips.map((t: any) => t.status)).toEqual(['SEARCHING', 'SEARCHING']);
    const raw = JSON.stringify(before.body);
    for (const leak of ['30A-', 'Tài xế', 'accountId', 'hotelId', 'driverAccountId', 'vehicleId', c.drivers[0]!.id, c.hotelId]) expect(raw, leak).not.toContain(leak);
    expect(before.body.stage).toBe('BOOKED');

    // Tài xế thấy chuyến của mình kèm thông tin khách để đón.
    const mine = await call('get', '/api/v1/driver/trips', c.drivers[0]!.token);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ status: 'OFFERED', guest: { fullName: 'Khách Đoàn', phone: '+84912345678' }, request: { passengers: 5, direction: 'TO_HOTEL' } });

    // Cả hai tài xế nhận và chạy hết các bước.
    for (const d of c.drivers) {
      const tid = (await call('get', '/api/v1/driver/trips', d.token)).body.items[0].id as string;
      expect((await act(d.token, tid, 'accept')).body.trip.status).toBe('ACCEPTED');
      if (d === c.drivers[0]) {
        const after = await lookup(b);
        const t = after.body.shuttles[0].trips.find((x: any) => x.status === 'ACCEPTED');
        expect(t.vehicle.plate).toMatch(/^30A-/);
        expect(t.driver).toMatchObject({ name: 'Tài xế 4', phone: '0988777666'.replace(/^0/, '+84'), photoUrl: null });
        expect(JSON.stringify(after.body)).not.toContain('accountId');
      }
      expect((await act(d.token, tid, 'start')).status).toBe(200);
      expect((await act(d.token, tid, 'arrived')).status).toBe(200);
      expect((await lookup(b)).body.stage).toBe('PICKUP_IN');
      expect((await act(d.token, tid, 'onboard')).status).toBe(200);
      expect((await act(d.token, tid, 'dropped-off')).body.trip.status).toBe('DROPPED_OFF');
    }
    expect((await one<any>('SELECT status, completed_at FROM shuttle_requests WHERE id = $1', [rid]))!.status).toBe('DONE');

    // Nhật ký đơn (khách sạn + admin), có phân trang và lịch sử trạng thái ở trang đầu.
    const ev = await call('get', `/api/v1/hotel/bookings/${b.id}/events?limit=200`, c.owner);
    expect(ev.status).toBe(200);
    const types = ev.body.items.map((e: any) => e.type);
    for (const t of ['SHUTTLE_REQUESTED', 'TRIP_OFFERED', 'TRIP_ACCEPTED', 'TRIP_EN_ROUTE', 'TRIP_ARRIVED', 'TRIP_ONBOARD', 'TRIP_DROPPED_OFF', 'SHUTTLE_DONE']) expect(types, t).toContain(t);
    expect(ev.body.statusHistory).toBeDefined();
    const page = await call('get', `/api/v1/hotel/bookings/${b.id}/events?limit=2`, c.owner);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.nextCursor).not.toBeNull();
    expect(page.body.statusHistory).toBeDefined();
    const page2 = await call('get', `/api/v1/hotel/bookings/${b.id}/events?limit=2&cursor=${page.body.nextCursor}`, c.owner);
    expect(page2.body.items[0].seq).toBeGreaterThan(page.body.nextCursor);
    expect(page2.body.statusHistory).toBeUndefined();
    const other = (await mkStaff(await mkHotel(), [PERM.BOOKING_READ])).token;
    expect((await call('get', `/api/v1/hotel/bookings/${b.id}/events`, other)).status).toBe(404);
    const adm = (await mkAdmin([PERM.ADMIN_BOOKING_READ])).token;
    expect((await call('get', `/api/v1/admin/bookings/${b.id}/events`, adm)).body.items.length).toBe(ev.body.items.length);
    expect((await call('get', `/api/v1/admin/bookings/${b.id}/events`, c.owner)).status).toBe(403);
    // Khách xem bản rút gọn: có loại sự kiện + thời điểm, không có actor.
    const g = (await lookup(b)).body;
    expect(g.stage).toBe('BOOKED'); // chiều đón xong nhưng chưa check-in
    expect(g.events.length).toBeGreaterThan(5);
    expect(Object.keys(g.events[0]).sort()).toEqual(['at', 'type']);
  });

  it('xe 7 chỗ ưu tiên cho 5 khách; tài xế từ chối -> điều lại xe khác; hết xe -> chuyển EXTERNAL', async () => {
    const c = await setup([4, 4, 7]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 5)).body.shuttle.id as string;
    let trips = await tripsOf(rid);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ seats: 5, kind: 'OWN', vehicleId: c.vehicles[2] });
    // Xe 7 chỗ từ chối -> bị loại, 2 xe 4 chỗ nhận 4+1.
    expect((await act(c.drivers[2]!.token, trips[0].id, 'reject', { reason: 'Xe hỏng' })).body.trip.status).toBe('REJECTED');
    trips = await tripsOf(rid);
    expect(trips.filter((t) => t.status === 'OFFERED').map((t) => t.seats).sort()).toEqual([1, 4]);
    expect(trips.find((t) => t.status === 'REJECTED')!.rejectReason).toBe('Xe hỏng');
    expect(JSON.stringify((await lookup(b)).body)).not.toContain('Xe hỏng'); // lý do từ chối là nội bộ
    // Một xe 4 chỗ từ chối nữa: còn đúng một xe -> chuyến 1 khách cho xe kia? Xe còn lại bận -> EXTERNAL.
    const t4 = trips.find((t) => t.status === 'OFFERED' && t.seats === 4)!;
    await act(c.drivers[t4.vehicleId === c.vehicles[0] ? 0 : 1]!.token, t4.id, 'reject');
    trips = await tripsOf(rid);
    const ext = trips.find((t) => t.kind === 'EXTERNAL')!;
    expect(ext).toMatchObject({ status: 'NEEDS_EXTERNAL', seats: 4, externalReason: 'NO_FREE_VEHICLE' });
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_REJECTED'", [b.id])).toBe(2);
  });

  it('hết xe: NEEDS_EXTERNAL cả đoàn -> bảng điều phối cảnh báo -> link xấu 422 -> link hợp lệ -> khách thấy -> nhân sự bấm các bước -> DONE', async () => {
    const c = await setup([]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 3, 8)).body.shuttle.id as string; // còn 8 phút tới giờ đón: quá hạn (< 10 phút)
    const [t] = await tripsOf(rid);
    expect(t).toMatchObject({ kind: 'EXTERNAL', status: 'NEEDS_EXTERNAL', seats: 3 });

    const dispatcher = (await mkStaff(c.hotelId, [PERM.SHUTTLE_HANDLE])).token; // lễ tân có shuttle:handle vẫn xử lý được xe ngoài
    const board = await call('get', '/api/v1/hotel/shuttle/board', dispatcher);
    expect(board.status).toBe(200);
    expect(board.body.alerts).toEqual([expect.objectContaining({ tripId: t.id, overdue: true })]);
    expect(board.body.alerts[0].deadlineAt).toBeTruthy();
    expect(board.body.requests[0].trips[0]).toMatchObject({ status: 'NEEDS_EXTERNAL', overdue: true });
    expect(board.body.requests[0].guest.phone).toBe('+84912345678');

    const g1 = await lookup(b);
    expect(g1.body.shuttles[0].trips[0]).toMatchObject({ kind: 'EXTERNAL', status: 'NEEDS_EXTERNAL', reason: 'NO_FREE_VEHICLE' });
    expect(g1.body.shuttles[0].trips[0].message).toContain('Xe của khách sạn hiện đã hết');
    expect(g1.body.shuttles[0].trips[0].shareUrl).toBeUndefined();

    const ext = (body: object) => call('post', `/api/v1/hotel/shuttle-trips/${t.id}/external`, dispatcher, body);
    for (const shareUrl of ['http://grab.com/x', 'javascript:alert(1)', 'https://evil.example.com/x', 'https://evilgrab.com/x', 'https://127.0.0.1/x', 'https://user:p@grab.com/x', `https://grab.com/${'a'.repeat(500)}`]) {
      const r = await ext({ provider: 'GRAB', shareUrl });
      expect(r.status, shareUrl).toBe(422);
      expect(r.body.error.code, shareUrl).toBe('EXTERNAL_LINK_NOT_ALLOWED');
    }
    expect((await ext({ provider: 'GRAB' })).status).toBe(422); // thiếu shareUrl: lỗi validation chung
    expect((await ext({ provider: 'GRAB', shareUrl: 'https://r.grab.com/ride/abc123', plate: '51F-123.45', driverName: 'Lê Văn Grab', phone: '0901234567' })).body.trip.status).toBe('ACCEPTED');
    const g2 = (await lookup(b)).body.shuttles[0].trips[0];
    expect(g2).toMatchObject({ status: 'ACCEPTED', provider: 'GRAB', shareUrl: 'https://r.grab.com/ride/abc123', shareHost: 'r.grab.com', vehicle: { plate: '51F-123.45' }, driver: { name: 'Lê Văn Grab', phone: '+84901234567' } });
    // Nhật ký ghi ai nhập liên kết.
    const e = await one<any>("SELECT actor_type, actor_id, data FROM booking_events WHERE booking_id = $1 AND type = 'EXTERNAL_LINK_SET'", [b.id]);
    expect(e).toMatchObject({ actorType: 'HOTEL', data: { provider: 'GRAB', shareHost: 'r.grab.com' } });
    expect(e!.actorId).toBeTruthy();
    expect(await count('audit_logs', "action = 'TRIP.EXTERNAL_SET'")).toBe(1);

    // Các bước do nhân sự bấm (không có bước start cho xe ngoài).
    const step = (a: string) => call('post', `/api/v1/hotel/shuttle-trips/${t.id}/${a}`, dispatcher, {});
    expect((await step('onboard')).body.error.code).toBe('INVALID_TRANSITION');
    expect((await step('arrived')).body.trip.status).toBe('ARRIVED');
    expect((await step('onboard')).body.trip.status).toBe('ONBOARD');
    expect((await step('dropped-off')).body.trip.status).toBe('DROPPED_OFF');
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [rid]))!.status).toBe('DONE');
  });

  it('đổi/hủy xe ngoài; nhân sự khách sạn khác 404; xe của khách sạn không bấm bằng endpoint nhân sự', async () => {
    const c = await setup([4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 4)).body.shuttle.id as string;
    const [own] = await tripsOf(rid);
    const staff = (await mkStaff(c.hotelId, [PERM.FLEET_MANAGE])).token;
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${own.id}/arrived`, staff, {})).body.error.code).toBe('NOT_EXTERNAL_TRIP');
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${own.id}/external`, staff, { provider: 'GRAB', shareUrl: 'https://grab.com/x' })).body.error.code).toBe('NOT_EXTERNAL_TRIP');
    // Chuyến 4 khách hủy -> yêu cầu mới 3 khách thiếu xe (xe duy nhất đang bận) -> xe ngoài.
    const b2 = await mkBooking(c);
    const rid2 = (await reqShuttle(b2, 3, 25)).body.shuttle.id as string;
    const [x] = await tripsOf(rid2);
    expect(x.status).toBe('NEEDS_EXTERNAL'); // xe trùng giờ (lệch 5 phút < 90) bị loại
    const otherHotel = (await mkStaff(await mkHotel(), [PERM.FLEET_MANAGE])).token;
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/external`, otherHotel, { provider: 'GRAB', shareUrl: 'https://grab.com/x' })).status).toBe(404);
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/cancel`, otherHotel, { note: 'thử hủy' })).status).toBe(404);
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/external`, staff, { provider: 'XANHSM', shareUrl: 'https://xanhsm.com/s/1' })).body.trip.status).toBe('ACCEPTED');
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/external`, staff, { provider: 'GRAB', shareUrl: 'https://grab.com/s/2' })).body.trip.external.provider).toBe('GRAB'); // đổi xe ngoài
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/cancel`, staff, { note: 'Khách tự đi' })).body.trip.status).toBe('CANCELLED');
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${x.id}/cancel`, staff, { note: 'Khách tự đi' })).status).toBe(409);
    expect(await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [rid2])).toMatchObject({ status: 'CANCELLED' }); // hủy chuyến duy nhất -> đóng yêu cầu, không treo REQUESTED
  });

  it('quyền: tài xế chỉ thấy/nhận chuyến của mình (người khác, khách sạn khác -> 404); thiếu fleet:manage -> 403; tài xế không vào cổng khách sạn', async () => {
    const c = await setup([4, 4]);
    const c2 = await setup([4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 8)).body.shuttle.id as string;
    const [t0, t1] = await tripsOf(rid);
    const mine = await call('get', '/api/v1/driver/trips', c.drivers[0]!.token);
    expect(mine.body.items.map((i: any) => i.id)).toEqual([t0.vehicleId === c.vehicles[0] ? t0.id : t1.id]);
    expect((await call('get', '/api/v1/driver/trips', c2.drivers[0]!.token)).body.items).toEqual([]);
    const theirs = t0.vehicleId === c.vehicles[0] ? t1 : t0; // chuyến của tài xế còn lại
    expect((await act(c.drivers[0]!.token, theirs.id, 'accept')).status).toBe(404);
    expect((await act(c2.drivers[0]!.token, theirs.id, 'accept')).status).toBe(404);
    expect((await act(c.drivers[0]!.token, randomUUID(), 'accept')).status).toBe(404);
    expect((await act(c.owner, theirs.id, 'accept')).status).toBe(403); // chủ không có trip:drive
    // Thiếu quyền
    const reader = (await mkStaff(c.hotelId, [PERM.BOOKING_READ])).token;
    for (const [m, p] of [['get', '/api/v1/hotel/vehicles'], ['get', '/api/v1/hotel/drivers'], ['get', '/api/v1/hotel/shuttle/board'], ['get', '/api/v1/driver/trips']] as const) expect((await call(m, p, reader)).status, p).toBe(403);
    const handler = (await mkStaff(c.hotelId, [PERM.SHUTTLE_HANDLE])).token; // shuttle:handle: điều phối được nhưng không quản lý đội xe
    expect((await call('get', '/api/v1/hotel/shuttle/board', handler)).status).toBe(200);
    expect((await call('post', '/api/v1/hotel/vehicles', handler, { plate: '30A-99999', seats: 4 })).status).toBe(403);
    expect((await call('get', '/api/v1/hotel/shuttle/board', c.drivers[0]!.token)).status).toBe(403);
    expect((await call('get', `/api/v1/hotel/bookings/${b.id}`, c.drivers[0]!.token)).status).toBe(403);
    expect((await call('get', '/api/v1/driver/trips')).status).toBe(401);
    // Tài xế đăng nhập bằng /api/v1/auth/login như nhân sự: có hotelId + trip:drive.
    const email = (await one<{ email: string }>('SELECT email FROM accounts WHERE id = $1', [c.drivers[0]!.id]))!.email;
    const login = await call('post', '/api/v1/auth/login', undefined, { email, password: 'MatKhau-Tai-Xe-1' });
    expect(login.body.account).toMatchObject({ type: 'DRIVER', permissions: [PERM.TRIP_DRIVE] });
    expect((await call('get', '/api/v1/driver/trips', login.body.token)).status).toBe(200);
    // Vai trò mặc định: chủ khách sạn có fleet:manage, tài xế chỉ trip:drive.
    const ownerRole = (await one<{ permissions: string[] }>("SELECT permissions FROM roles WHERE key = 'hotel_owner' AND hotel_id IS NULL"))!;
    expect(ownerRole.permissions).toContain(PERM.FLEET_MANAGE);
    expect((await one<{ permissions: string[] }>("SELECT permissions FROM roles WHERE key = 'hotel_driver'"))!.permissions).toEqual([PERM.TRIP_DRIVE]);
  });

  it('chuyển trạng thái sai -> 409 INVALID_TRANSITION; hai lần nhận đồng thời: một 200 một 409', async () => {
    const c = await setup([4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
    const [t] = await tripsOf(rid);
    const d = c.drivers[0]!.token;
    for (const a of ['start', 'arrived', 'onboard', 'dropped-off']) expect((await act(d, t.id, a)).body.error.code, a).toBe('INVALID_TRANSITION');
    const rs = await Promise.all([act(d, t.id, 'accept'), act(d, t.id, 'accept')]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await act(d, t.id, 'reject')).body.error.code).toBe('INVALID_TRANSITION');
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_ACCEPTED'", [b.id])).toBe(1);
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [rid]))!.status).toBe('ASSIGNED');
  });

  it('điều phối idempotent + vòng quét: yêu cầu tới hạn chưa có chuyến được điều đúng một lần', async () => {
    const c = await setup([4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 2, 120)).body.shuttle.id as string; // còn 2 giờ: chưa điều
    expect(await tripsOf(rid)).toHaveLength(0);
    expect((await dispatchDueRequests()).dispatched).toBe(0);
    await db.query("UPDATE shuttle_requests SET pickup_at = now() + interval '10 minutes' WHERE id = $1", [rid]); // tới hạn
    expect(await dispatchRequest(rid).then((r) => r.dispatched)).toBe(true);
    expect(await dispatchRequest(rid)).toMatchObject({ dispatched: false, reason: 'ALREADY_DISPATCHED' });
    expect((await dispatchDueRequests()).dispatched).toBe(0);
    expect(await tripsOf(rid)).toHaveLength(1);
    // Đơn chưa xác nhận thì không điều.
    const b2 = await mkBooking(c);
    const rid2 = (await reqShuttle(b2, 1, 120)).body.shuttle.id as string;
    await setStatus(b2.id, 'PENDING');
    await db.query("UPDATE shuttle_requests SET pickup_at = now() + interval '10 minutes' WHERE id = $1", [rid2]);
    expect(await dispatchRequest(rid2)).toMatchObject({ dispatched: false, reason: 'BOOKING_NOT_ELIGIBLE' });
  });

  it('xác nhận đơn duyệt tay kích hoạt điều phối (hook)', async () => {
    const c = await setup([4]);
    const manual = (await mkStaff(c.hotelId, [PERM.BOOKING_DECIDE])).token;
    await db.query("UPDATE hotels SET approval = '{\"manual\":true}'::jsonb WHERE id = $1", [c.hotelId]);
    const b = await mkBooking(c);
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [b.id]))!.status).toBe('PENDING');
    const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
    expect(await tripsOf(rid)).toHaveLength(0);
    expect((await call('post', `/api/v1/hotel/bookings/${b.id}/confirm`, manual, {})).status).toBe(200);
    expect(await tripsOf(rid)).toHaveLength(1);
    await db.query("UPDATE hotels SET approval = '{\"manual\":false}'::jsonb WHERE id = $1", [c.hotelId]);
  });

  it('gọi xe ngay: TO_AIRPORT giờ đón ~ +15 phút, điều phối ngay; trùng -> 409; đơn không hợp lệ -> 409; hủy trước ONBOARD ok, sau ONBOARD 409', async () => {
    const c = await setup([4]);
    const b = await mkBooking(c);
    await setStatus(b.id, 'CHECKED_IN');
    const r = await guest('/call-now', { code: b.code, phone: b.phone, passengers: 3 }, `cn-${randomUUID()}`);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.shuttle).toMatchObject({ direction: 'TO_AIRPORT', passengers: 3, status: 'REQUESTED' });
    const diff = new Date(r.body.shuttle.pickupAt).getTime() - Date.now();
    expect(diff).toBeGreaterThan(13 * MIN);
    expect(diff).toBeLessThan(16 * MIN);
    expect(r.body.shuttle.trips).toEqual([expect.objectContaining({ status: 'SEARCHING', seats: 3 })]);
    expect((await guest('/call-now', { code: b.code, phone: b.phone }, `cn-${randomUUID()}`)).body.error.code).toBe('SHUTTLE_ALREADY_REQUESTED');
    const bad = await mkBooking(c);
    await setStatus(bad.id, 'CANCELLED');
    expect((await guest('/call-now', { code: bad.code, phone: bad.phone }, `cn-${randomUUID()}`)).body.error.code).toBe('BOOKING_NOT_ELIGIBLE');
    expect(await count('booking_events', "booking_id = $1 AND type = 'SHUTTLE_CALL_NOW'", [b.id])).toBe(1);

    // Hủy sau khi lên xe -> 409; trước đó (tài xế đã nhận) hủy được và chuyến CANCELLED.
    const [t] = await tripsOf(r.body.shuttle.id);
    const d = c.drivers[0]!.token;
    for (const a of ['accept', 'start', 'arrived', 'onboard']) await act(d, t.id, a);
    const c1 = await guest(`/${r.body.shuttle.id}/cancel`, { code: b.code, phone: b.phone });
    expect(c1.status).toBe(409);
    expect(c1.body.error.code).toBe('TRIP_ALREADY_STARTED');
    await act(d, t.id, 'dropped-off');

    const b3 = await mkBooking(c);
    const r3 = (await reqShuttle(b3, 2, 20, 'TO_AIRPORT')).body.shuttle.id as string;
    const [t3] = await tripsOf(r3);
    await act(d, t3.id, 'accept');
    const cancelled = await guest(`/${r3}/cancel`, { code: b3.code, phone: b3.phone });
    expect(cancelled.body.shuttle.status).toBe('CANCELLED');
    expect(cancelled.body.shuttle.trips).toEqual([expect.objectContaining({ status: 'CANCELLED' })]);
    expect((await tripsOf(r3))[0].status).toBe('CANCELLED');
    expect((await act(d, t3.id, 'start')).body.error.code).toBe('INVALID_TRANSITION');
    expect(await count('booking_events', "booking_id = $1 AND type = 'SHUTTLE_CANCELLED'", [b3.id])).toBe(1);
  });

  it('hủy đơn (duyệt yêu cầu hủy) -> hủy cả chuyến (cascade) và tài xế không còn thấy', async () => {
    const c = await setup([4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
    const reqStaff = (await mkStaff(c.hotelId, [PERM.REQUEST_HANDLE])).token;
    const cr = await call('post', '/api/v1/change-requests').set('Idempotency-Key', `cx-${randomUUID()}`).send({ code: b.code, phone: b.phone, type: 'CANCEL', reasonCode: 'HEALTH' });
    expect((await call('post', `/api/v1/hotel/change-requests/${cr.body.request.id}/approve`, reqStaff, {})).status).toBe(200);
    expect((await tripsOf(rid))[0].status).toBe('CANCELLED');
    expect((await call('get', '/api/v1/driver/trips', c.drivers[0]!.token)).body.items).toEqual([]);
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_CANCELLED'", [b.id])).toBe(1);
  });

  it('gán tay: đổi xe cho chuyến chưa chạy (xe rảnh, đủ chỗ), xe bận/nhỏ bị từ chối; endpoint cũ không vỡ nhưng bị chặn khi đã có chuyến', async () => {
    const c = await setup([4, 7, 4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 3)).body.shuttle.id as string;
    const [t] = await tripsOf(rid);
    expect([c.vehicles[0], c.vehicles[2]]).toContain(t.vehicleId); // một trong hai xe 4 chỗ (nhỏ nhất đủ chỗ), không phải xe 7
    const staff = (await mkStaff(c.hotelId, [PERM.FLEET_MANAGE])).token;
    const re = (v: string) => call('post', `/api/v1/hotel/shuttle-trips/${t.id}/reassign`, staff, { vehicleId: v });
    expect((await re(randomUUID())).status).toBe(404);
    // Xe khách sạn khác không đổi được.
    const foreign = await setup([4]);
    expect((await re(foreign.vehicles[0]!)).status).toBe(404);
    await act(c.drivers[c.vehicles.indexOf(t.vehicleId)]!.token, t.id, 'accept');
    const ok = await re(c.vehicles[1]!);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.trip).toMatchObject({ status: 'OFFERED', vehicle: { id: c.vehicles[1] } });
    expect((await call('get', '/api/v1/driver/trips', c.drivers[c.vehicles.indexOf(t.vehicleId)]!.token)).body.items).toEqual([]); // tài xế cũ không còn thấy
    expect((await call('get', '/api/v1/driver/trips', c.drivers[1]!.token)).body.items).toHaveLength(1);
    // Xe 4 chỗ thứ hai bận với yêu cầu khác cùng giờ -> không đổi sang được; xe quá nhỏ -> 422.
    const b2 = await mkBooking(c);
    const rid2 = (await reqShuttle(b2, 4, 25)).body.shuttle.id as string;
    const [t2] = await tripsOf(rid2);
    expect([c.vehicles[0], c.vehicles[2]]).toContain(t2.vehicleId);
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${t2.id}/reassign`, staff, { vehicleId: c.vehicles[1]! })).body.error.code).toBe('VEHICLE_UNAVAILABLE');
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${t.id}/reassign`, staff, { vehicleId: c.vehicles.find((v, i) => i !== 1 && v !== t2.vehicleId)! })).status).toBe(200);
    // Endpoint cũ: gán tay/hoàn tất bị chặn (chuyến là nguồn sự thật), hủy cũ hủy luôn chuyến.
    const legacy = (await mkStaff(c.hotelId, [PERM.SHUTTLE_HANDLE])).token;
    expect((await call('post', `/api/v1/hotel/shuttle-requests/${rid}/assign`, legacy, { driverName: 'Nguyễn Văn A', driverPhone: '0988777666' })).body.error.code).toBe('USE_TRIP_FLOW');
    expect((await call('post', `/api/v1/hotel/shuttle-requests/${rid}/cancel`, legacy, { note: 'Khách báo hủy' })).body.shuttle.status).toBe('CANCELLED');
    expect((await tripsOf(rid)).every((x) => x.status === 'CANCELLED')).toBe(true);
    // Chuyến đã chạy thì không đổi xe.
    const small = await setup([4, 4]);
    const sb = await mkBooking(small);
    const [st] = await tripsOf((await reqShuttle(sb, 4)).body.shuttle.id);
    await act(small.drivers[small.vehicles.indexOf(st.vehicleId)]!.token, st.id, 'accept');
    await act(small.drivers[small.vehicles.indexOf(st.vehicleId)]!.token, st.id, 'start');
    expect((await call('post', `/api/v1/hotel/shuttle-trips/${st.id}/reassign`, (await mkStaff(small.hotelId, [PERM.FLEET_MANAGE])).token, { vehicleId: small.vehicles.find((v) => v !== st.vehicleId)! })).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('đội xe: CRUD xe/tài xế, validation, cách ly khách sạn, xóa mềm khi đã có chuyến', async () => {
    const c = await setup([]);
    const post = (p: string, b: object, t = c.owner) => call('post', p, t, b);
    // Xe
    expect((await post('/api/v1/hotel/vehicles', { plate: 'ab', seats: 4 })).status).toBe(422);
    expect((await post('/api/v1/hotel/vehicles', { plate: '30A-12345', seats: 0 })).status).toBe(422);
    expect((await post('/api/v1/hotel/vehicles', { plate: '30A-12345', seats: 51 })).status).toBe(422);
    expect((await post('/api/v1/hotel/vehicles', { plate: '30A-12345', seats: 4, hotelId: randomUUID() })).status).toBe(422); // strict
    const v = await post('/api/v1/hotel/vehicles', { plate: '30a-123.45', seats: 4, model: 'Vios' });
    expect(v.status).toBe(201);
    expect(v.body.vehicle).toMatchObject({ plate: '30A-123.45', seats: 4, model: 'Vios', active: true, driver: null });
    expect((await post('/api/v1/hotel/vehicles', { plate: '30A-123.45', seats: 7 })).body.error.code).toBe('PLATE_TAKEN');
    const other = await setup([]);
    expect((await post('/api/v1/hotel/vehicles', { plate: '30A-123.45', seats: 7 }, other.owner)).status).toBe(201); // trùng biển ở khách sạn khác được
    expect((await call('patch', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, other.owner, { seats: 5 })).status).toBe(404);
    expect((await call('delete', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, other.owner)).status).toBe(404);
    expect((await call('patch', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, c.owner, {})).status).toBe(422);
    expect((await call('patch', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, c.owner, { seats: 7, model: null })).body.vehicle).toMatchObject({ seats: 7, model: null });
    // Tài xế
    const drv = (o: object = {}) => post('/api/v1/hotel/drivers', { email: `t${randomUUID().slice(0, 6)}@airrest.vn`, password: 'MatKhau-Tai-Xe-1', fullName: 'Phạm Tài Xế', phone: '0911222333', ...o });
    expect((await drv({ password: 'ngan' })).status).toBe(422);
    expect((await drv({ phone: '123' })).status).toBe(422);
    expect((await drv({ photoKey: 'hotels/2026/x.jpg' })).status).toBe(422);
    expect((await drv({ photoKey: '../../etc/passwd' })).status).toBe(422);
    const key = `drivers/2026/${randomUUID()}.jpg`;
    const d1 = await drv({ email: 'tx.dup@airrest.vn', photoKey: key, vehicleId: v.body.vehicle.id });
    expect(d1.status, JSON.stringify(d1.body)).toBe(201);
    expect(d1.body.driver).toMatchObject({ phone: '+84911222333', photoKey: key, photoUrl: `https://pub-test.r2.dev/${key}`, vehicleId: v.body.vehicle.id, active: true });
    expect(JSON.stringify(d1.body)).not.toMatch(/password|hash|scrypt/i);
    const acct = (await one<any>('SELECT type, status, hotel_id, role_ids, password_hash FROM accounts WHERE id = $1', [d1.body.driver.accountId]))!;
    expect(acct).toMatchObject({ type: 'DRIVER', status: 'ACTIVE', hotelId: c.hotelId, roleIds: [await systemRoleId('hotel_driver')] });
    expect(acct.passwordHash.startsWith('scrypt$')).toBe(true);
    expect((await drv({ email: 'tx.dup@airrest.vn' })).body.error.code).toBe('EMAIL_TAKEN');
    expect((await drv({ vehicleId: v.body.vehicle.id })).body.error.code).toBe('VEHICLE_HAS_DRIVER');
    expect((await drv({ vehicleId: randomUUID() })).status).toBe(404);
    expect((await call('get', '/api/v1/hotel/vehicles', c.owner)).body.items[0].driver).toMatchObject({ name: 'Phạm Tài Xế', photoUrl: `https://pub-test.r2.dev/${key}` });
    expect((await call('get', '/api/v1/hotel/drivers', other.owner)).body.items).toEqual([]);
    expect((await call('patch', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, other.owner, { fullName: 'Kẻ lạ' })).status).toBe(404);
    expect((await call('delete', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, other.owner)).status).toBe(404);
    const upd = await call('patch', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner, { fullName: 'Phạm Mới', photoKey: null, vehicleId: null });
    expect(upd.body.driver).toMatchObject({ fullName: 'Phạm Mới', photoKey: null, photoUrl: null, vehicleId: null });
    expect((await call('patch', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner, { vehicleId: v.body.vehicle.id })).status).toBe(200);
    // Khóa tài xế: không đăng nhập được
    expect((await call('patch', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner, { active: false })).body.driver.active).toBe(false);
    expect((await call('post', '/api/v1/auth/login', undefined, { email: 'tx.dup@airrest.vn', password: 'MatKhau-Tai-Xe-1' })).status).toBe(401);
    expect((await call('patch', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner, { active: true, password: 'MatKhauMoi-123456' })).status).toBe(200);
    expect((await call('post', '/api/v1/auth/login', undefined, { email: 'tx.dup@airrest.vn', password: 'MatKhauMoi-123456' })).status).toBe(200);
    expect(await count('audit_logs', "action IN ('VEHICLE.CREATE','VEHICLE.UPDATE','DRIVER.CREATE','DRIVER.UPDATE') AND hotel_id = $1", [c.hotelId])).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify((await db.query('SELECT after FROM audit_logs WHERE action = \'DRIVER.UPDATE\'')).rows)).not.toContain('MatKhauMoi');

    // Xóa: chưa có chuyến -> xóa hẳn; đang có chuyến -> 409; đã có chuyến xong -> chỉ ngừng hoạt động.
    const spare = await post('/api/v1/hotel/vehicles', { plate: '30B-00001', seats: 4 });
    expect((await call('delete', `/api/v1/hotel/vehicles/${spare.body.vehicle.id}`, c.owner)).body).toEqual({ deleted: true, deactivated: false });
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
    const [t] = await tripsOf(rid);
    expect(t.vehicleId).toBe(v.body.vehicle.id);
    expect((await call('delete', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, c.owner)).body.error.code).toBe('VEHICLE_IN_USE');
    expect((await call('delete', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner)).body.error.code).toBe('DRIVER_IN_USE');
    expect((await call('patch', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, c.owner, { active: false })).body.error.code).toBe('VEHICLE_IN_USE');
    const dtoken = signAccountToken({ sub: d1.body.driver.accountId, accountType: 'DRIVER' });
    for (const a of ['accept', 'start', 'arrived', 'onboard', 'dropped-off']) expect((await act(dtoken, t.id, a)).status, a).toBe(200);
    expect((await call('delete', `/api/v1/hotel/vehicles/${v.body.vehicle.id}`, c.owner)).body).toEqual({ deleted: false, deactivated: true });
    expect((await call('delete', `/api/v1/hotel/drivers/${d1.body.driver.accountId}`, c.owner)).body).toEqual({ deleted: false, deactivated: true });
    expect((await call('get', '/api/v1/hotel/vehicles?active=true', c.owner)).body.items.map((x: any) => x.id)).not.toContain(v.body.vehicle.id);
    expect((await one<any>('SELECT status FROM accounts WHERE id = $1', [d1.body.driver.accountId]))!.status).toBe('LOCKED');
    const d2 = await drv();
    expect((await call('delete', `/api/v1/hotel/drivers/${d2.body.driver.accountId}`, c.owner)).body).toEqual({ deleted: true, deactivated: false });
    expect(await count('accounts', 'id = $1', [d2.body.driver.accountId])).toBe(0);
  });

  it('upload-url folder drivers: cần fleet:manage (room:manage không đủ); folder khác vẫn room:manage; khóa đúng định dạng', async () => {
    const h = await mkHotel();
    const fleet = (await mkStaff(h, [PERM.FLEET_MANAGE])).token;
    const room = (await mkStaff(h, [PERM.ROOM_MANAGE])).token;
    const body = { folder: 'drivers', contentType: 'image/jpeg', size: 1000 };
    const ok = await call('post', '/api/v1/hotel/media/upload-url', fleet, body);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.key).toMatch(/^drivers\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
    expect((await call('post', '/api/v1/hotel/media/upload-url', room, body)).status).toBe(403);
    expect((await call('post', '/api/v1/hotel/media/upload-url', fleet, { ...body, folder: 'hotels' })).status).toBe(403);
    expect((await call('post', '/api/v1/hotel/media/upload-url', room, { ...body, folder: 'hotels' })).status).toBe(201);
    expect((await call('post', '/api/v1/hotel/media/upload-url', fleet, { ...body, contentType: 'image/gif' })).status).toBe(422);
  });

  it('chủ khách sạn thật (vai trò hotel_owner) quản lý được đội xe; quyền admin không có fleet:manage không vào được', async () => {
    const h = await mkHotel();
    const id = await mkAccount({ type: 'HOTEL', email: `own${randomUUID().slice(0, 6)}@airrest.vn`, hotelId: h, roleIds: [await systemRoleId('hotel_owner')] });
    const token = signAccountToken({ sub: id, accountType: 'HOTEL' });
    expect((await call('post', '/api/v1/hotel/vehicles', token, { plate: '29A-11111', seats: 4 })).status).toBe(201);
    const adm = (await mkAdmin([PERM.ADMIN_HOTEL_READ])).token;
    expect((await call('get', '/api/v1/hotel/vehicles', adm)).status).toBe(403);
  });
  it('khách không có mặt: chỉ tài xế được giao, chỉ khi ARRIVED; chuyến + yêu cầu đóng, khách thấy lý do, phí không đổi, có sự kiện', async () => {
    const c = await setup([4, 4]);
    const b = await mkBooking(c);
    const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
    const [t] = await tripsOf(rid);
    const d = c.drivers.find((x) => x.id === t.driverAccountId)!.token;
    const other = c.drivers.find((x) => x.id !== t.driverAccountId)!.token;
    const noShow = (tok: string, id = t.id) => act(tok, id, 'no-show');
    expect((await noShow(d)).body.error.code).toBe('INVALID_TRANSITION'); // OFFERED
    await act(d, t.id, 'accept'); await act(d, t.id, 'start');
    expect((await noShow(d)).body.error.code).toBe('INVALID_TRANSITION'); // EN_ROUTE
    await act(d, t.id, 'arrived');
    expect((await noShow(other)).status).toBe(404); // không phải chuyến của tôi
    expect((await call('post', `/api/v1/driver/trips/${t.id}/no-show`, c.owner)).status).toBe(403); // thiếu trip:drive
    const before = await one<any>('SELECT price_vnd FROM shuttle_requests WHERE id = $1', [rid]);
    const seen: any[] = [];
    const { shuttleBus } = await import('../services/shuttle/events.js');
    const on = (e: any) => seen.push(e);
    shuttleBus.on('event', on);
    expect((await noShow(d)).status).toBe(200);
    shuttleBus.off('event', on);
    expect(seen.map((e) => e.type).sort()).toEqual(['SHUTTLE_CANCELLED', 'TRIP_CANCELLED']);
    expect((await noShow(d)).body.error.code).toBe('INVALID_TRANSITION'); // lần hai
    expect((await tripsOf(rid))[0]).toMatchObject({ status: 'CANCELLED', cancelNote: 'no_show' });
    expect(await one<any>('SELECT status, cancel_note, price_vnd FROM shuttle_requests WHERE id = $1', [rid])).toMatchObject({ status: 'CANCELLED', cancelNote: 'no_show', priceVnd: before!.priceVnd });
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_CANCELLED' AND data->>'note' = 'no_show'", [b.id])).toBe(1);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    const sh = (await lookup(b)).body.shuttles[0];
    expect(sh).toMatchObject({ status: 'CANCELLED', cancelReason: 'no_show' });
    expect(sh.trips[0]).toMatchObject({ status: 'CANCELLED', cancelReason: 'no_show' });
    expect((await act(d, t.id, 'no-show')).status).toBe(409);
  });

  it('vòng quét tự đóng chuyến quá hạn: chỉ chuyến cũ chưa xong; chuyến mới/đã lên xe giữ nguyên; không đổi phí; đóng yêu cầu khi hết chuyến', async () => {
    const c = await setup([4, 4, 4]);
    const mk = async (state: string, pickupMin: number, updatedAgoH: number) => {
      const b = await mkBooking(c);
      const rid = (await reqShuttle(b, 2)).body.shuttle.id as string;
      const [t] = await tripsOf(rid);
      await db.query('UPDATE shuttle_trips SET status = $2, updated_at = now() - make_interval(mins => $3) WHERE id = $1', [t.id, state, updatedAgoH]);
      await db.query('UPDATE shuttle_requests SET pickup_at = now() + make_interval(mins => $2) WHERE id = $1', [rid, pickupMin]);
      return { b, rid, tid: t.id as string };
    };
    const old = await mk('ARRIVED', -8 * 60, 480);
    const fresh = await mk('EN_ROUTE', -2 * 60, 6); // chạy hợp lệ
    const recentUpdate = await mk('ACCEPTED', -8 * 60, 6); // giờ đón cũ nhưng vừa được thao tác
    const onboard = await mk('ONBOARD', -8 * 60, 480); // đã lên xe: không đụng
    const status = async (x: { tid: string }) => (await one<any>('SELECT status FROM shuttle_trips WHERE id = $1', [x.tid]))!.status;
    expect((await closeStaleTrips()).closed).toBe(1);
    expect([await status(old), await status(fresh), await status(recentUpdate), await status(onboard)]).toEqual(['CANCELLED', 'EN_ROUTE', 'ACCEPTED', 'ONBOARD']);
    expect((await closeStaleTrips()).closed).toBe(0); // idempotent
    expect(await one<any>('SELECT cancel_note FROM shuttle_trips WHERE id = $1', [old.tid])).toMatchObject({ cancelNote: 'auto_expired' });
    expect(await one<any>('SELECT status, cancel_note FROM shuttle_requests WHERE id = $1', [old.rid])).toMatchObject({ status: 'CANCELLED', cancelNote: 'auto_expired' });
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [fresh.rid]))!.status).not.toBe('CANCELLED');
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_CANCELLED' AND actor_type = 'SYSTEM' AND data->>'note' = 'auto_expired'", [old.b.id])).toBe(1);
    expect(await count('refunds', 'booking_id = $1', [old.b.id])).toBe(0);
    expect((await lookup(old.b)).body.shuttles[0]).toMatchObject({ status: 'CANCELLED', cancelReason: 'auto_expired' });
  });
});
