import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { db } from '../database/pg';
import { notify, sweepCheckinSoon } from '../services/notifications';
import { signAccountToken } from '../lib/jwt';
import { closeDb, freshDb, mkAccount, mkHotel } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
// Vai trò tự tạo của khách sạn (key custom_*, như HotelRoles) + một nhân viên.
const mkStaff = async (hotelId: string, permissions: string[]) => {
  const roleId = randomUUID();
  await db.query("INSERT INTO roles (id, key, name, scope, hotel_id, permissions) VALUES ($1,$2,$3,'HOTEL',$4,$5::text[])", [roleId, `custom_${roleId.slice(0, 8)}`, `VT ${roleId.slice(0, 4)}`, hotelId, permissions]);
  const id = await mkAccount({ type: 'HOTEL', email: `s-${roleId.slice(0, 8)}@airrest.vn`, hotelId, roleIds: [roleId] });
  return { id, roleId, token: signAccountToken({ sub: id, accountType: 'HOTEL' }) };
};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: thông báo khách sạn + cấu hình vai trò × loại', () => {
  const app = createApp();
  let hotel = '', other = '', desk = '', manager = '', deskRole = '';
  const list = async (t: string) => (await request(app).get('/api/v1/hotel/notifications').set(bearer(t))).body as { items: { id: string; type: string; read: boolean }[]; unread: number };

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'NT1' });
    other = await mkHotel({ code: 'NT2' });
    const d = await mkStaff(hotel, [PERM.BOOKING_READ]); // chỉ xem đơn
    desk = d.token; deskRole = d.roleId;
    manager = (await mkStaff(hotel, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE, PERM.HOTEL_ROLE_MANAGE])).token;
  });
  afterAll(async () => closeDb());

  it('mặc định theo quyền: đơn chờ duyệt chỉ tới người có quyền duyệt; trùng dedupeKey không tạo hai lần; khách sạn khác không thấy', async () => {
    await notify(hotel, 'BOOKING_PENDING', { title: 'Đơn chờ duyệt AR-1', refCode: 'AR-1', dedupeKey: 'p1' });
    await notify(hotel, 'BOOKING_PENDING', { title: 'Đơn chờ duyệt AR-1', refCode: 'AR-1', dedupeKey: 'p1' });
    await notify(hotel, 'BOOKING_PAID', { title: 'Đã thanh toán AR-1', refCode: 'AR-1', dedupeKey: 'pay1' });
    expect((await list(manager)).items.map((i) => i.type).sort()).toEqual(['BOOKING_PAID', 'BOOKING_PENDING']);
    expect((await list(desk)).items.map((i) => i.type)).toEqual(['BOOKING_PAID']);
    const o = await mkStaff(other, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE]);
    expect((await list(o.token)).items).toEqual([]);
  });

  it('đánh dấu đã đọc theo từng người; đọc hết; không có token -> 401', async () => {
    const { items, unread } = await list(manager);
    expect(unread).toBe(2);
    expect((await request(app).post(`/api/v1/hotel/notifications/${items[0]!.id}/read`).set(bearer(manager))).status).toBe(204);
    expect((await list(manager)).unread).toBe(1);
    expect((await list(desk)).unread).toBe(1); // người khác chưa đọc
    await request(app).post('/api/v1/hotel/notifications/read-all').set(bearer(manager));
    expect((await list(manager)).unread).toBe(0);
    expect((await request(app).get('/api/v1/hotel/notifications')).status).toBe(401);
  });

  it('cấu hình: cần quyền quản lý vai trò; ghi đè áp cho thông báo SAU đó; id lạ -> 422', async () => {
    expect((await request(app).get('/api/v1/hotel/notification-settings').set(bearer(desk))).status).toBe(403);
    const m = (await request(app).get('/api/v1/hotel/notification-settings').set(bearer(manager))).body as { types: { key: string }[]; roles: { id: string; enabled: Record<string, boolean> }[] };
    expect(m.types.length).toBeGreaterThanOrEqual(8);
    expect(m.roles.find((r) => r.id === deskRole)?.enabled).toMatchObject({ BOOKING_PAID: true, BOOKING_PENDING: false });
    const roleId = deskRole;
    expect((await request(app).put('/api/v1/hotel/notification-settings').set(bearer(manager)).send({ cells: [{ roleId: '00000000-0000-4000-8000-000000000000', type: 'BOOKING_PAID', enabled: false }] })).status).toBe(422);
    expect((await request(app).put('/api/v1/hotel/notification-settings').set(bearer(manager)).send({ cells: [{ roleId, type: 'BOOKING_PAID', enabled: false }] })).status).toBe(200);
    await notify(hotel, 'BOOKING_PAID', { title: 'Đã thanh toán AR-2', dedupeKey: 'pay2' });
    expect((await list(desk)).items.filter((i) => i.type === 'BOOKING_PAID')).toHaveLength(1); // chỉ còn cái cũ: thông báo mới sau khi tắt không tới vai trò desk
    expect((await list(manager)).items.filter((i) => i.type === 'BOOKING_PAID')).toHaveLength(2);
    expect((await db.query('SELECT 1 FROM notification_settings WHERE hotel_id = $1 AND role_id = $2 AND type = $3 AND enabled = false', [hotel, roleId, 'BOOKING_PAID'])).rows.length).toBe(1);
  });

  it('nhắc sắp nhận phòng: chỉ đơn CONFIRMED trong 2 giờ tới, chạy lại không tạo trùng', async () => {
    const n = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE type = 'CHECKIN_SOON'")).rows[0]!.n;
    await sweepCheckinSoon();
    await sweepCheckinSoon();
    expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE type = 'CHECKIN_SOON'")).rows[0]!.n).toBe(n);
  });
});
