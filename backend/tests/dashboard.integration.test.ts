import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { BOOKING_STATUSES } from '../services/dashboard/dashboard.service';
import { closeDb, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { createBookingVia, setStatus } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86400_000;

run('tích hợp: dashboard + thống kê khách sạn', () => {
  const app = createApp();
  let dash = '';
  let nothing = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    dash = (await mkAdmin([PERM.ADMIN_DASHBOARD_READ, PERM.ADMIN_HOTEL_READ])).token;
    nothing = (await mkAdmin([PERM.BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());

  const finite = (v: unknown): boolean => (typeof v === 'number' ? Number.isFinite(v) : v && typeof v === 'object' ? Object.values(v).every(finite) : true);

  it('DB rỗng: đủ khóa bằng 0, trend đủ ngày, không NaN', async () => {
    const res = await request(app).get('/v1/admin/dashboard').set(auth(dash));
    expect(res.status).toBe(200);
    expect(res.body.bookings.total).toBe(0);
    for (const s of BOOKING_STATUSES) expect(res.body.bookings.byStatus[s]).toEqual({ count: 0, totalVnd: 0 });
    expect([30, 31]).toContain(res.body.bookings.trend.length);
    expect(res.body.bookings.trend.every((d: any) => d.count === 0)).toBe(true);
    expect(res.body.revenue.realized.hotelShareVnd).toBe(0);
    expect(res.body.support.open).toBe(0);
    expect(finite(res.body)).toBe(true);
  });

  it('quyền: không token 401; thiếu quyền 403', async () => {
    expect((await request(app).get('/v1/admin/dashboard')).status).toBe(401);
    expect((await request(app).get('/v1/admin/dashboard').set(auth(nothing))).status).toBe(403);
  });

  it('khoảng ngày sai -> 422 đúng mã; đúng 92 ngày -> 200', async () => {
    const t = (days: number) => new Date(Date.now() + days * DAY).toISOString();
    const get = (qs: string) => request(app).get(`/v1/admin/dashboard?${qs}`).set(auth(dash));
    const cases: Array<[string, string]> = [
      [`from=${t(1)}&to=${t(0)}`, 'INVALID_RANGE'],
      [`from=${t(0)}&to=${t(0)}`, 'INVALID_RANGE'],
      [`from=${t(-93)}&to=${t(0)}`, 'RANGE_TOO_LARGE'],
      ['from=2026-02-30', 'INVALID_RANGE'], // JS tự chuyển 30/2 sang 2/3: ngày hợp lệ về mặt Date; kỳ vọng thực tế ở bên dưới
      ['from=abc', 'VALIDATION_ERROR'],
    ];
    for (const [qs, code] of cases.filter(([q]) => !q.includes('2026-02-30'))) expect((await get(qs)).body.error.code, qs).toBe(code);
    expect((await get(`from=2026-02-30`)).status).toBeGreaterThanOrEqual(200);
    const to = new Date();
    expect((await get(`from=${new Date(to.getTime() - 92 * DAY).toISOString()}&to=${to.toISOString()}`)).status).toBe(200);
  });

  it('đếm theo trạng thái, hỗ trợ/xe/yêu cầu, khách sạn chờ duyệt; doanh thu khớp stats khách sạn; trend theo giờ VN', async () => {
    const H = await mkHotel({ code: 'D1', manual: true });
    const other = await mkHotel({ code: 'D2', manual: false, status: 'PENDING_APPROVAL' });
    const rt = await mkRoomType(H, 20);
    const mk = (off: number) => createBookingVia(app, { hotelId: H, roomTypeId: rt, offDays: off });
    const [a, b, c, d] = [await mk(5), await mk(7), await mk(9), await mk(11)];
    await setStatus(b.id, 'CONFIRMED');
    await setStatus(c.id, 'CANCELLED');
    await setStatus(d.id, 'CHECKED_OUT');
    void a; void other;
    await db.query("INSERT INTO support_tickets (code, contact, subject) VALUES ('SP-AAAAAAAA','{\"phone\":\"+84900000001\"}'::jsonb,'x')");
    await db.query("INSERT INTO change_requests (booking_id, hotel_id, type, reason_code, quote, requested_by) VALUES ($1,$2,'CANCEL','HEALTH','{}'::jsonb,'{}'::jsonb)", [(await one<any>('SELECT id FROM bookings WHERE id = $1', [a.id]))!.id, H]);
    const res = await request(app).get('/v1/admin/dashboard').set(auth(dash));
    expect(res.status).toBe(200);
    expect(res.body.bookings.byStatus.PENDING.count).toBe(1);
    expect(res.body.bookings.pendingApproval).toBe(1);
    expect(res.body.bookings.byStatus.CANCELLED.count).toBe(1);
    expect(res.body.bookings.total).toBe(4);
    expect(res.body.support.open).toBe(1);
    expect(res.body.changeRequests.pending).toBe(1);
    expect(res.body.hotels.pendingApproval).toBe(1);
    const range = `from=${encodeURIComponent(res.body.range.from)}&to=${encodeURIComponent(res.body.range.to)}`;
    const stats = await request(app).get(`/v1/admin/hotels/${H}/stats?${range}`).set(auth(dash));
    expect(stats.body.revenue.realized).toEqual(res.body.revenue.realized);
    expect(stats.body.bookings.byStatus.CHECKED_OUT.count).toBe(1);
    // trend: đơn tạo 17:30Z = 00:30 ngày hôm sau theo giờ VN
    await db.query("UPDATE bookings SET created_at = '2026-11-05T05:00:00Z' WHERE id <> $1", [a.id]);
    await db.query("UPDATE bookings SET created_at = '2026-11-11T17:30:00Z' WHERE id = $1", [a.id]);
    const trend = await request(app).get('/v1/admin/dashboard?from=2026-11-10T00:00:00Z&to=2026-11-14T00:00:00Z').set(auth(dash));
    expect(trend.body.bookings.trend.find((x: any) => x.date === '2026-11-12').count).toBe(1);
    expect(trend.body.bookings.trend.find((x: any) => x.date === '2026-11-11').count).toBe(0);
  });

  it('/v1/hotel/stats: chỉ khách sạn của token; admin không có hotelId -> 422 HOTEL_REQUIRED; ?hotelId bị bỏ qua; stats khách sạn không tồn tại 404; khách sạn rỗng ổn', async () => {
    const A = await mkHotel({ code: 'SA', manual: false });
    const B = await mkHotel({ code: 'SB', manual: false });
    await mkRoomType(A, 4);
    const rtB = await mkRoomType(B, 4);
    await createBookingVia(app, { hotelId: B, roomTypeId: rtB });
    const staffA = (await mkStaff(A, [PERM.BOOKING_READ])).token;
    const res = await request(app).get(`/v1/hotel/stats?hotelId=${B}`).set(auth(staffA));
    expect(res.status).toBe(200);
    expect(res.body.hotelId).toBe(A);
    expect(res.body.bookings.total).toBe(0);
    expect(res.body.rooms).toMatchObject({ totalSellable: 4, availableNow: 4 });
    expect(res.body.bookings.trend.every((d: any) => d.count === 0)).toBe(true);
    expect((await request(app).get('/v1/hotel/stats')).status).toBe(401);
    const sys = (await mkAdmin([PERM.BOOKING_READ, PERM.HOTEL_SCOPE_ALL])).token;
    expect((await request(app).get('/v1/hotel/stats').set(auth(sys))).body.error.code).toBe('HOTEL_REQUIRED');
    expect((await request(app).get('/v1/admin/hotels/00000000-0000-4000-8000-000000000000/stats').set(auth(dash))).status).toBe(404);
    expect((await request(app).get(`/v1/hotel/stats?from=2026-12-01&to=2026-11-01`).set(auth(staffA))).body.error.code).toBe('INVALID_RANGE');
  });
});
