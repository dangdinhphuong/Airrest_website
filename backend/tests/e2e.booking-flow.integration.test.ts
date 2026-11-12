import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

// Kịch bản đầu-cuối qua API (không FE): khách đặt -> lễ tân xác nhận -> khách yêu cầu xe + hỗ trợ -> khách yêu cầu hủy -> lễ tân duyệt -> admin thấy.
run('E2E API: đặt -> xác nhận -> hủy', () => {
  const app = createApp();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const phone = '0912345678';
  let hotel = '';
  let rt = '';
  let staff = '';
  let admin = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'E2E', manual: true });
    rt = await mkRoomType(hotel, 1);
    staff = (await mkStaff(hotel, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE])).token;
    admin = (await mkAdmin([PERM.ADMIN_BOOKING_READ, PERM.ADMIN_DASHBOARD_READ, PERM.SUPPORT_HANDLE])).token;
  });
  afterAll(async () => closeDb());

  it('toàn bộ vòng đời một booking', async () => {
    const from = new Date(Date.now() + 10 * DAY);
    const created = await request(app).post('/v1/bookings').set('Idempotency-Key', `e2e-${Date.now()}-abc`).send({ hotelId: hotel, roomTypeId: rt, from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString(), guest: { fullName: 'Khách E2E', phone } });
    expect(created.status).toBe(201);
    expect(created.body.booking.status).toBe('PENDING');
    const { code } = created.body.booking;
    const id = (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id;

    // Phòng cuối đang được giữ: người thứ hai không đặt được.
    expect((await request(app).post('/v1/bookings').set('Idempotency-Key', `e2e2-${Date.now()}-abc`).send({ hotelId: hotel, roomTypeId: rt, from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString(), guest: { fullName: 'Người khác', phone: '0987654321' } })).status).toBe(409);

    expect((await request(app).post(`/v1/hotel/bookings/${id}/confirm`).set(auth(staff))).status).toBe(200);
    expect((await request(app).post('/v1/bookings/lookup').set(guestIp(31)).send({ code, phone })).body.booking.status).toBe('CONFIRMED');

    const shuttle = await request(app).post('/v1/shuttle-requests').set(guestIp(32)).set('Idempotency-Key', `e2e-sh-${Date.now()}-abc`).send({ code, phone, direction: 'TO_HOTEL', airport: 'HAN', pickupAt: new Date(from.getTime() + 3600_000).toISOString() });
    expect(shuttle.status).toBe(201);
    const ticket = await request(app).post('/v1/support').set(guestIp(33)).set('Idempotency-Key', `e2e-sp-${Date.now()}-abc`).send({ bookingCode: code, phone, subject: 'Hỏi về xe đón', message: 'Xe đón lúc mấy giờ?' });
    expect(ticket.status).toBe(201);

    const cr = await request(app).post('/v1/change-requests').set(guestIp(34)).set('Idempotency-Key', `e2e-cr-${Date.now()}-abc`).send({ code, phone, type: 'CANCEL', reasonCode: 'CHANGE_OF_PLAN' });
    expect(cr.status).toBe(201);
    expect((await request(app).post(`/v1/hotel/change-requests/${cr.body.request.id}/approve`).set(auth(staff)).send({})).status).toBe(200);

    expect((await request(app).post('/v1/bookings/lookup').set(guestIp(35)).send({ code, phone })).body.booking.status).toBe('CANCELLED');
    expect((await one<any>('SELECT status FROM shuttle_requests WHERE id = $1', [shuttle.body.shuttle.id]))!.status).toBe('CANCELLED');
    // Phòng đã nhả: người khác đặt được.
    expect((await request(app).post('/v1/bookings').set('Idempotency-Key', `e2e3-${Date.now()}-abc`).send({ hotelId: hotel, roomTypeId: rt, from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString(), guest: { fullName: 'Người khác', phone: '0987654321' } })).status).toBe(201);

    // Admin thấy: booking, nhật ký, dashboard, ticket hỗ trợ.
    const detail = await request(app).get(`/v1/admin/bookings/${id}`).set(auth(admin));
    expect(detail.body.booking.statusHistory.map((h: any) => h.to)).toEqual(['PENDING', 'CONFIRMED', 'CANCELLED']);
    expect(await count('audit_logs', "booking_id = $1 AND action IN ('BOOKING.CONFIRM','BOOKING.CANCEL','CHANGE_REQUEST.APPROVE','CHANGE_REQUEST.CREATE')", [id])).toBe(4);
    expect((await request(app).get(`/v1/admin/dashboard?from=${encodeURIComponent(new Date(Date.now() - DAY).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 30 * DAY).toISOString())}`).set(auth(admin))).body.bookings.byStatus.CANCELLED.count).toBe(1);
    expect((await request(app).get('/v1/admin/support').set(auth(admin))).body.items).toHaveLength(1);
  });
});
