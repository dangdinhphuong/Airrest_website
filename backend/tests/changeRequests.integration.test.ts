import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { bookingEvents } from '../services/events';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { createBookingVia, guestIp, payBooking, setStatus, setStay } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const H = 3600_000;
const DAY = 24 * H;

run('tích hợp: yêu cầu đổi/hủy của khách', () => {
  const app = createApp();
  let flexHotel = '';
  let stdHotel = '';
  let flexRt = '';
  let stdRt = '';
  let ip = 0;
  const nextIp = () => guestIp(++ip);
  let n = 0;
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) => request(app).post(`/v1/change-requests${path}`).set(nextIp()).set(extra).send(body as object);
  const cancel = (b: { code: string; phone: string }, key = `cr-${++n}-${Date.now()}`, reasonCode = 'CHANGE_OF_PLAN') =>
    post('/', { ...b, type: 'CANCEL', reasonCode }, { 'Idempotency-Key': key });
  const offDay = (() => { let d = 20; return () => (d += 3); })();
  const mk = async (o: { hotel?: 'FLEX' | 'STD'; paid?: boolean } = {}) => {
    const std = o.hotel === 'STD';
    const b = await createBookingVia(app, { hotelId: std ? stdHotel : flexHotel, roomTypeId: std ? stdRt : flexRt, paymentMethod: o.paid ? 'VNPAY' : 'AT_HOTEL', offDays: offDay() });
    if (o.paid) await payBooking(app, b.code);
    return b;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    flexHotel = await mkHotel({ code: 'FX', manual: false });
    stdHotel = await mkHotel({ code: 'ST', manual: false });
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"STANDARD\"') WHERE id = $1", [stdHotel]);
    flexRt = await mkRoomType(flexHotel, 20);
    stdRt = await mkRoomType(stdHotel, 20);
  });
  afterEach(() => {
    vi.useRealTimers();
    bookingEvents.removeAllListeners('change');
  });
  afterAll(async () => closeDb());

  it('báo giá hủy: STANDARD còn 30h -> hoàn 100%', async () => {
    const b = await mk({ hotel: 'STD', paid: true });
    await setStay(b.id, new Date(Date.now() + 30 * H));
    const res = await post('/quote', { code: b.code, phone: b.phone });
    expect(res.status).toBe(200);
    expect(res.body.quote.tier).toBe('FREE');
    const paid = (await one<any>('SELECT paid_vnd FROM bookings WHERE id = $1', [b.id]))!.paidVnd;
    expect(res.body.quote.refundVnd).toBe(paid);
  });

  it('mốc đúng 24h trước check-in (STANDARD) -> miễn phí; lệch 1ms -> giữ 50%', async () => {
    const b = await mk({ hotel: 'STD', paid: true });
    const T = new Date(Date.now() + 100 * H);
    await setStay(b.id, T);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(T.getTime() - 24 * H));
    expect((await post('/quote', { code: b.code, phone: b.phone })).body.quote.tier).toBe('FREE');
    vi.setSystemTime(new Date(T.getTime() - 24 * H + 1));
    const q = (await post('/quote', { code: b.code, phone: b.phone })).body.quote;
    expect(q.tier).toBe('PARTIAL');
    expect(q.keepVnd).toBe(300_000 + (await one<any>('SELECT pricing FROM bookings WHERE id = $1', [b.id]))!.pricing.serviceFeeVnd);
  });

  it('tạo yêu cầu hủy: 201, lưu quote lúc gửi, audit; response không lộ hotelId/decidedBy', async () => {
    const b = await mk();
    const res = await cancel(b);
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ status: 'PENDING', type: 'CANCEL' });
    expect(res.body.request.quote.kind).toBe('CANCEL');
    expect(JSON.stringify(res.body)).not.toMatch(/hotelId|decidedBy|requestedBy/);
    expect(await count('audit_logs', "action = 'CHANGE_REQUEST.CREATE' AND booking_id = $1", [b.id])).toBe(1);
  });

  it('đồng thời 2 yêu cầu hủy cùng booking: 1 thành công, 1 REQUEST_ALREADY_PENDING', async () => {
    const b = await mk();
    const [a, c] = await Promise.all([cancel(b), cancel(b)]);
    expect([a.status, c.status].sort()).toEqual([201, 409]);
    expect([a, c].find((r) => r.status === 409)!.body.error.code).toBe('REQUEST_ALREADY_PENDING');
    expect(await count('change_requests', 'booking_id = $1', [b.id])).toBe(1);
  });

  it('Idempotency-Key lặp trả kết quả cũ; thiếu key -> 400', async () => {
    const b = await mk();
    const key = `idem-${Date.now()}-abcdef`;
    const same = guestIp(198); // idempotency theo (khóa, IP khách): hai lần phải cùng IP
    const send = () => post('/', { ...b, type: 'CANCEL', reasonCode: 'HEALTH' }, { 'Idempotency-Key': key, ...same });
    const a = await send();
    const c = await send();
    expect(c.headers['idempotent-replay']).toBe('true');
    expect(c.body.request.id).toBe(a.body.request.id);
    const none = await post('/', { code: b.code, phone: b.phone, type: 'CANCEL', reasonCode: 'HEALTH' });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('hủy đơn không ở trạng thái cho phép -> 409 BOOKING_NOT_CANCELLABLE, không tạo bản ghi', async () => {
    for (const st of ['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW']) {
      const b = await mk();
      await setStatus(b.id, st);
      const res = await cancel(b);
      expect(res.status, st).toBe(409);
      expect(res.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
      expect(await count('change_requests', 'booking_id = $1', [b.id])).toBe(0);
    }
  });

  it('đổi ngày: CHECKED_IN, trùng ngày cũ, NON_REFUNDABLE sát giờ, OTHER thiếu ghi chú, newTo <= newFrom', async () => {
    const change = (b: { code: string; phone: string }, from: Date, to: Date, extra: object = {}) =>
      post('/', { ...b, type: 'CHANGE', reasonCode: 'CHANGE_OF_PLAN', newFrom: from.toISOString(), newTo: to.toISOString(), ...extra }, { 'Idempotency-Key': `chg-${++n}-${Date.now()}` });
    const from = new Date(Date.now() + 60 * DAY);
    const b1 = await mk();
    await setStatus(b1.id, 'CHECKED_IN');
    expect((await change(b1, from, new Date(from.getTime() + DAY))).body.error.code).toBe('BOOKING_NOT_CHANGEABLE');
    const b2 = await mk();
    const stay = (await one<any>('SELECT stay FROM bookings WHERE id = $1', [b2.id]))!.stay;
    expect((await change(b2, new Date(stay.from), new Date(stay.to))).body.error.code).toBe('CHANGE_SAME_DATES');
    const b3 = await mk();
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"NON_REFUNDABLE\"') WHERE id = $1", [flexHotel]);
    await setStay(b3.id, new Date(Date.now() + 10 * H));
    expect((await change(b3, from, new Date(from.getTime() + DAY))).body.error.code).toBe('CHANGE_NOT_ALLOWED');
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"FLEXIBLE\"') WHERE id = $1", [flexHotel]);
    const b4 = await mk();
    expect((await change(b4, from, new Date(from.getTime() + DAY), { reasonCode: 'OTHER' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await change(b4, from, new Date(from.getTime() - DAY))).status).toBe(422);
  });

  it('sai SĐT và mã không tồn tại cho cùng body 404 ở /quote, / và /lookup', async () => {
    const b = await mk();
    for (const path of ['/quote', '/lookup', '/']) {
      const extra: Record<string, string> = path === '/' ? { 'Idempotency-Key': `nf-${++n}-${Date.now()}-x` } : {};
      const body = (code: string, phone: string) => (path === '/' ? { code, phone, type: 'CANCEL', reasonCode: 'HEALTH' } : { code, phone });
      const wrong = await post(path, body(b.code, '0999999999'), extra);
      const missing = await post(path, body('AR-ZZZZZZZZ', b.phone), { ...extra, 'Idempotency-Key': `nf-${++n}-${Date.now()}-y` });
      expect(wrong.status).toBe(404);
      expect({ ...wrong.body.error, requestId: 0 }).toEqual({ ...missing.body.error, requestId: 0 });
      expect(wrong.body.error.code).toBe('BOOKING_NOT_FOUND');
    }
  });

  it('rate limit 429 sau 10 lần dò', async () => {
    const same = guestIp(199);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(app).post('/v1/change-requests/lookup').set(same).send({ code: 'AR-ZZZZZZZZ', phone: '0912345678' })).status;
    expect(last).toBe(429);
  });

  it('tra cứu: chỉ thấy yêu cầu của booking mình; phát bookingEvents khi gửi', async () => {
    const events: any[] = [];
    bookingEvents.on('change', (e) => events.push(e));
    const a = await mk();
    const b = await mk();
    await cancel(a);
    expect(events).toContainEqual(expect.objectContaining({ code: a.code, isNew: false }));
    expect((await post('/lookup', { code: a.code, phone: a.phone })).body.requests).toHaveLength(1);
    expect((await post('/lookup', { code: b.code, phone: b.phone })).body.requests).toHaveLength(0);
  });
});


run('tích hợp: xử lý yêu cầu hủy / đổi ngày', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let RT1 = '';
  let RT2 = '';
  let staff1 = '';
  let staff2 = '';
  let admin = '';
  let n = 0;
  let ipn = 100;
  let off = 5;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const guest = () => guestIp(++ipn);
  const mk = async (hotel = H1, rt = RT1, paid = false, offDays = (off += 3)) => {
    const b = await createBookingVia(app, { hotelId: hotel, roomTypeId: rt, paymentMethod: paid ? 'VNPAY' : 'AT_HOTEL', offDays });
    if (paid) await payBooking(app, b.code);
    return b;
  };
  const askCancel = async (b: { code: string; phone: string }) =>
    (await request(app).post('/v1/change-requests').set(guest()).set('Idempotency-Key', `ap-${++n}-${Date.now()}`).send({ ...b, type: 'CANCEL', reasonCode: 'CHANGE_OF_PLAN' })).body.request.id as string;
  const askChange = async (b: { code: string; phone: string }, fromOff: number, nights = 1) => {
    const from = new Date(Date.now() + fromOff * DAY);
    const res = await request(app).post('/v1/change-requests').set(guest()).set('Idempotency-Key', `ac-${++n}-${Date.now()}`)
      .send({ ...b, type: 'CHANGE', reasonCode: 'CHANGE_OF_PLAN', newFrom: from.toISOString(), newTo: new Date(from.getTime() + nights * DAY).toISOString() });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.request.id as string;
  };
  const approve = (id: string, t = staff1) => request(app).post(`/v1/hotel/change-requests/${id}/approve`).set(auth(t)).send({});
  const reject = (id: string, note: unknown = 'Không thể xử lý', t = staff1) => request(app).post(`/v1/hotel/change-requests/${id}/reject`).set(auth(t)).send({ note });
  const status = async (id: string) => (await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status as string;

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'P1', manual: false });
    H2 = await mkHotel({ code: 'P2', manual: false });
    RT1 = await mkRoomType(H1, 30);
    RT2 = await mkRoomType(H2, 30);
    staff1 = (await mkStaff(H1, [PERM.REQUEST_HANDLE])).token;
    staff2 = (await mkStaff(H2, [PERM.REQUEST_HANDLE])).token;
    admin = (await mkAdmin([PERM.REQUEST_HANDLE, PERM.HOTEL_SCOPE_ALL])).token;
  });
  afterEach(() => {
    vi.useRealTimers();
    bookingEvents.removeAllListeners('change');
  });
  afterAll(async () => closeDb());

  it('quyền và phạm vi: không token 401; thiếu quyền 403; mỗi khách sạn chỉ thấy của mình, admin thấy cả hai, phân trang có nextCursor', async () => {
    expect((await request(app).get('/v1/hotel/change-requests')).status).toBe(401);
    const none = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
    expect((await request(app).get('/v1/hotel/change-requests').set(auth(none))).status).toBe(403);
    await askCancel(await mk(H1, RT1));
    await askCancel(await mk(H2, RT2));
    const mine = await request(app).get('/v1/hotel/change-requests?status=PENDING').set(auth(staff1));
    expect(mine.body.items.every((r: any) => r.hotelId === H1)).toBe(true);
    const all = await request(app).get('/v1/hotel/change-requests?status=PENDING&limit=100').set(auth(admin));
    expect(new Set(all.body.items.map((r: any) => r.hotelId))).toEqual(new Set([H1, H2]));
    expect((await request(app).get('/v1/hotel/change-requests?limit=1').set(auth(admin))).body.nextCursor).not.toBeNull();
  });

  it('khách sạn khác duyệt/từ chối -> 404, booking nguyên trạng', async () => {
    const b = await mk();
    const id = await askCancel(b);
    expect((await approve(id, staff2)).status).toBe(404);
    expect((await reject(id, 'Không thể xử lý', staff2)).body.error.code).toBe('REQUEST_NOT_FOUND');
    expect(await status(b.id)).toBe('CONFIRMED');
  });

  it('duyệt hủy đơn đã thu tiền: CANCELLED, phòng RELEASED, đúng 1 refund PENDING, chưa chạm refunded_vnd', async () => {
    const events: any[] = [];
    bookingEvents.on('change', (e) => events.push(e));
    const b = await mk(H1, RT1, true);
    await setStatus(b.id, 'CONFIRMED');
    const id = await askCancel(b);
    const quote = (await one<any>('SELECT quote FROM change_requests WHERE id = $1', [id]))!.quote;
    const res = await approve(id);
    expect(res.status).toBe(200);
    expect(await status(b.id)).toBe('CANCELLED');
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [b.id]))!.state).toBe('RELEASED');
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: 'PENDING', reasonCode: 'CANCEL_APPROVED', amountVnd: quote.refundVnd, key: `cancel:${id}` });
    expect((await one<any>('SELECT refunded_vnd FROM bookings WHERE id = $1', [b.id]))!.refundedVnd).toBe(0);
    expect(await count('audit_logs', "action IN ('CHANGE_REQUEST.APPROVE','BOOKING.CANCEL') AND booking_id = $1", [b.id])).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ code: b.code, status: 'CANCELLED', isNew: false }));
    const look = await request(app).post('/v1/change-requests/lookup').set(guest()).send(b);
    expect(look.body.requests[0].refund).toMatchObject({ status: 'PENDING', amountVnd: quote.refundVnd });
  });

  it('duyệt hủy đơn trả tại khách sạn: CANCELLED, không refund; đặt lại phòng cuối được', async () => {
    const H3 = await mkHotel({ code: 'P3', manual: false });
    const rt = await mkRoomType(H3, 1);
    const t = (await mkStaff(H3, [PERM.REQUEST_HANDLE])).token;
    const b = await mk(H3, rt, false, 70);
    const id = await askCancel(b);
    expect((await approve(id, t)).status).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    await createBookingVia(app, { hotelId: H3, roomTypeId: rt, offDays: 70 });
  });

  it('phí lấy từ báo giá lúc gửi, không tính lại lúc duyệt', async () => {
    const std = await mkHotel({ code: 'PS', manual: false });
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"STANDARD\"') WHERE id = $1", [std]);
    const rt = await mkRoomType(std, 5);
    const t = (await mkStaff(std, [PERM.REQUEST_HANDLE])).token;
    const b = await mk(std, rt, true);
    const T = new Date(Date.now() + 100 * H);
    await setStay(b.id, T);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(T.getTime() - 24 * H + 1));
    const id = await askCancel(b);
    vi.useRealTimers();
    expect((await approve(id, t)).status).toBe(200);
    expect((await one<any>('SELECT amount_vnd FROM refunds WHERE booking_id = $1', [b.id]))!.amountVnd).toBe(300_000);
  });

  it('duyệt hai lần song song chỉ tạo 1 lệnh hoàn; duyệt rồi từ chối -> 409', async () => {
    const b = await mk(H1, RT1, true);
    const id = await askCancel(b);
    const [a, c] = await Promise.all([approve(id), approve(id)]);
    expect([a.status, c.status]).toEqual([200, 200]);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(1);
    expect(await count('audit_logs', "action = 'CHANGE_REQUEST.APPROVE' AND booking_id = $1", [b.id])).toBe(1);
    expect((await reject(id)).body.error.code).toBe('REQUEST_ALREADY_DECIDED');
  });

  it('duyệt khi booking đã CHECKED_IN -> 409, không nhả phòng, không hoàn, yêu cầu còn PENDING', async () => {
    const b = await mk(H1, RT1, true);
    const id = await askCancel(b);
    await setStatus(b.id, 'CHECKED_IN');
    expect((await approve(id)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
    expect((await one<any>('SELECT state FROM room_reservations WHERE booking_id = $1', [b.id]))!.state).toBe('CHECKED_IN');
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    expect((await one<any>('SELECT status FROM change_requests WHERE id = $1', [id]))!.status).toBe('PENDING');
  });

  it('từ chối: lý do >= 3 ký tự; booking không đổi; khách thấy decisionNote, không thấy decidedBy', async () => {
    const b = await mk();
    const id = await askCancel(b);
    expect((await reject(id, 'ab')).status).toBe(422);
    expect((await reject(id, 'Đã quá sát giờ')).status).toBe(200);
    expect(await status(b.id)).toBe('CONFIRMED');
    const look = await request(app).post('/v1/change-requests/lookup').set(guest()).send(b);
    expect(look.body.requests[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'Đã quá sát giờ' });
    expect(JSON.stringify(look.body)).not.toContain('decidedBy');
  });

  it('đổi ngày: còn phòng -> stay/pricing/reservation cập nhật, change_count 1; dời chồng chính mình được', async () => {
    const H4 = await mkHotel({ code: 'P4', manual: false });
    const rt = await mkRoomType(H4, 1);
    const t = (await mkStaff(H4, [PERM.REQUEST_HANDLE])).token;
    const b = await mk(H4, rt, false, 80);
    const id = await askChange(b, 90, 2);
    expect((await approve(id, t)).status).toBe(200);
    const row = (await one<any>('SELECT * FROM bookings WHERE id = $1', [b.id]))!;
    expect(row.stay.nights).toBe(2);
    expect(row.pricing.roomVnd).toBe(1_200_000);
    expect(row.pricing.totalVnd).toBe(1_224_000);
    expect(row.changeCount).toBe(1);
    const resv = (await one<any>('SELECT starts_at, ends_at FROM room_reservations WHERE booking_id = $1', [b.id]))!;
    expect(resv.endsAt.getTime() - resv.startsAt.getTime()).toBe(2 * DAY);
    const id2 = await askChange(b, 90 + 1, 1); // dời 1 ngày, chồng khoảng cũ: không tự tranh với chính mình
    expect((await approve(id2, t)).status).toBe(200);
  });

  it('đổi sang ngày hết phòng -> 409 SOLD_OUT, đơn giữ nguyên, yêu cầu còn PENDING; hai đơn tranh phòng cuối: không bán trùng', async () => {
    const H5 = await mkHotel({ code: 'P5', manual: false });
    const rt = await mkRoomType(H5, 1);
    const t = (await mkStaff(H5, [PERM.REQUEST_HANDLE])).token;
    const a = await mk(H5, rt, false, 100);
    await mk(H5, rt, false, 110); // chiếm ngày 110
    const id = await askChange(a, 110);
    const res = await approve(id, t);
    expect(res.body.error.code).toBe('SOLD_OUT');
    expect((await one<any>('SELECT status FROM change_requests WHERE id = $1', [id]))!.status).toBe('PENDING');
    expect((await one<any>('SELECT change_count FROM bookings WHERE id = $1', [a.id]))!.changeCount).toBe(0);
    const c = await mk(H5, rt, false, 120);
    const d = await mk(H5, rt, false, 130);
    const [r1, r2] = await Promise.all([askChange(c, 140), askChange(d, 140)]);
    const [x, y] = await Promise.all([approve(r1, t), approve(r2, t)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('đổi ngày đơn đã thu tiền: tăng đêm -> 409 CHANGE_NEEDS_PAYMENT; giảm đêm -> refund CHANGE_DOWNSIZE đúng chênh lệch', async () => {
    const H6 = await mkHotel({ code: 'P6', manual: false });
    const rt = await mkRoomType(H6, 5);
    const t = (await mkStaff(H6, [PERM.REQUEST_HANDLE])).token;
    const up = await mk(H6, rt, true, 150);
    const idUp = await askChange(up, 160, 3);
    expect((await approve(idUp, t)).body.error.code).toBe('CHANGE_NEEDS_PAYMENT');
    expect((await one<any>('SELECT change_count FROM bookings WHERE id = $1', [up.id]))!.changeCount).toBe(0);
    // đơn 3 đêm -> 2 đêm
    const b = await mk(H6, rt, true, 170);
    await db.query("UPDATE bookings SET stay = jsonb_set(jsonb_set(stay,'{nights}','3'),'{to}', to_jsonb((stay->>'from')::timestamptz + interval '3 days')), pricing = pricing || '{\"roomVnd\":1800000,\"serviceFeeVnd\":36000,\"totalVnd\":1836000}'::jsonb, paid_vnd = 1836000 WHERE id = $1", [b.id]);
    const idDown = await askChange(b, 180, 2);
    expect((await approve(idDown, t)).status).toBe(200);
    expect((await one<any>('SELECT amount_vnd, reason_code FROM refunds WHERE booking_id = $1', [b.id]))).toMatchObject({ amountVnd: 612_000, reasonCode: 'CHANGE_DOWNSIZE' });
  });
});
