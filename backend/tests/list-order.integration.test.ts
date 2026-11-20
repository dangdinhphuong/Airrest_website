import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { writeAudit } from '../services/audit';
import { closeDb, db, freshDb, mkAdmin, mkHotel, mkRoomType } from './support/db';
import { createBookingVia } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

// Danh sách quản trị: bản ghi mới nhất lên đầu, con trỏ keyset đi hết các trang không lặp/sót.
run('tích hợp: danh sách quản trị — mới nhất trước + phân trang con trỏ', () => {
  const app = createApp();
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  // Đi hết các trang (limit 2); trả danh sách id theo thứ tự nhận được và số trang.
  async function walk(path: string, cursorKey: string, query: Record<string, string> = {}) {
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await request(app).get(path).set(auth()).query({ ...query, limit: '2', ...(cursor !== undefined && { [cursorKey]: cursor }) });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      ids.push(...r.body.items.map((i: { id: string | number }) => String(i.id)));
      cursor = r.body.nextCursor == null ? undefined : String(r.body.nextCursor);
      pages++;
    } while (cursor !== undefined && pages < 20);
    return { ids, pages };
  }
  const expectNewestFirst = (got: string[], createdOrder: string[]) => {
    expect(new Set(got).size).toBe(got.length); // không lặp
    expect(got).toEqual([...createdOrder].reverse()); // không sót, mới nhất trước
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    token = (await mkAdmin([PERM.ADMIN_HOTEL_READ, PERM.FLIGHT_MANAGE, PERM.ADMIN_ACCOUNT_MANAGE, PERM.ADMIN_PAYMENT_READ, PERM.AUDIT_READ, PERM.SUPPORT_HANDLE, PERM.ADMIN_PAYER_READ, PERM.ADMIN_PAYER_MANAGE, PERM.ADMIN_BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());

  it('khách sạn: mới nhất trước, qua 3 trang; lọc từ khóa (tên/mã/địa chỉ, không phân biệt hoa thường), trạng thái, sân bay', async () => {
    const ids: string[] = [];
    for (const [i, name] of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].entries()) ids.push(await mkHotel({ code: `LO-${i}`, name: `KS ${name}`, status: i === 4 ? 'SUSPENDED' : 'ACTIVE' }));
    await db.query(`UPDATE hotels SET address = '{"line":"12 Phố Hàng Bài","city":"Hà Nội"}'::jsonb WHERE id = $1`, [ids[1]]);
    const all = await walk('/api/v1/admin/hotels', 'after');
    expect(all.pages).toBe(3);
    expectNewestFirst(all.ids.filter((x) => ids.includes(x)), ids);
    const byName = (await request(app).get('/api/v1/admin/hotels').set(auth()).query({ q: 'cHaRlIe' })).body.items;
    expect(byName.map((h: { id: string }) => h.id)).toEqual([ids[2]]);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ q: 'lo-3' })).body.items.map((h: { id: string }) => h.id)).toEqual([ids[3]]);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ q: 'hà nội' })).body.items.map((h: { id: string }) => h.id)).toEqual([ids[1]]);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ q: '100%' })).body.items).toHaveLength(0); // ký tự đại diện bị thoát
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ status: 'SUSPENDED' })).body.items.map((h: { id: string }) => h.id)).toEqual([ids[4]]);
    const han = await walk('/api/v1/admin/hotels', 'after', { airport: 'han' });
    expect(han.ids).toHaveLength(5);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ airport: 'SGN' })).body.items).toHaveLength(0);
    await db.query(`UPDATE hotels SET contact = '{"phone":"+84 976 594 507"}'::jsonb WHERE id = $1`, [ids[2]]);
    for (const phone of ['0976594507', '+84976594507', '976 594', '(097) 659-4507']) {
      expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ phone })).body.items.map((h: { id: string }) => h.id)).toEqual([ids[2]]);
    }
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ phone: '0999999999' })).body.items).toHaveLength(0);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ phone: 'abc' })).status).toBe(422);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ status: 'BAD' })).status).toBe(422);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ airport: 'HANOI' })).status).toBe(422);
    expect((await request(app).get('/api/v1/admin/hotels').set(auth()).query({ after: 'abc' })).status).toBe(422);
  });

  it('chuyến bay: mới tạo trước, qua 3 trang; lọc mã/ngày/trạng thái', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await db.query<{ id: string }>(
        `INSERT INTO flights (code, airline, origin, dest, sched_dep, status) VALUES ($1,'VN','HAN','SGN',$2,$3) RETURNING id`,
        [`VN${100 + i}`, new Date(Date.UTC(2031, 0, 10 + i, 3)), i === 4 ? 'DELAYED' : 'ONTIME'],
      );
      ids.push(r.rows[0]!.id);
    }
    const all = await walk('/api/v1/admin/flights', 'cursor');
    expect(all.pages).toBe(3);
    expectNewestFirst(all.ids, ids);
    expect((await request(app).get('/api/v1/admin/flights').set(auth()).query({ code: 'VN102' })).body.items.map((f: { id: string }) => f.id)).toEqual([ids[2]]);
    expect((await request(app).get('/api/v1/admin/flights').set(auth()).query({ date: '2031-01-11' })).body.items.map((f: { id: string }) => f.id)).toEqual([ids[1]]);
    expect((await request(app).get('/api/v1/admin/flights').set(auth()).query({ status: 'DELAYED' })).body.items.map((f: { id: string }) => f.id)).toEqual([ids[4]]);
    expect((await request(app).get('/api/v1/admin/flights').set(auth()).query({ date: '11/01/2031' })).status).toBe(422);
  });

  it('tài khoản admin: mới nhất trước, qua nhiều trang; lọc từ khóa email/tên không phân biệt hoa thường', async () => {
    const made: string[] = [];
    for (const n of ['one', 'two', 'three', 'four']) made.push((await mkAdmin([PERM.AUDIT_READ], `${n}-lo@airrest.vn`)).id);
    const all = await walk('/api/v1/admin/accounts', 'after');
    expect(new Set(all.ids).size).toBe(all.ids.length);
    expect(all.ids.filter((x) => made.includes(x))).toEqual([...made].reverse());
    expect(all.ids[0]).toBe(made[3]); // bản ghi mới nhất ở đầu danh sách
    expect((await request(app).get('/api/v1/admin/accounts').set(auth()).query({ q: 'THREE-LO' })).body.items.map((a: { id: string }) => a.id)).toEqual([made[2]]);
  });

  it('nhật ký: mới nhất trước, qua nhiều trang; lọc theo hành động và khoảng ngày', async () => {
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      await writeAudit({ actor: { type: 'ADMIN', id: 'x' }, action: i % 2 ? 'LO.B' : 'LO.A', entity: { type: 'lo', id: String(i) } });
      created.push(String((await db.query<{ id: string }>('SELECT max(id) AS id FROM audit_logs')).rows[0]!.id));
    }
    const all = await walk('/api/v1/admin/audit-logs', 'cursor', { entityType: 'lo' });
    expect(all.pages).toBe(3);
    expectNewestFirst(all.ids, created);
    const a = await walk('/api/v1/admin/audit-logs', 'cursor', { action: 'LO.A' });
    expect(a.ids).toEqual([created[4], created[2], created[0]]);
    const future = await request(app).get('/api/v1/admin/audit-logs').set(auth()).query({ from: new Date(Date.now() + 86400_000).toISOString() });
    expect(future.body.items).toHaveLength(0);
    expect((await request(app).get('/api/v1/admin/audit-logs').set(auth()).query({ from: 'khong-phai-ngay' })).status).toBe(422);
  });

  it('hỗ trợ: ticket mới nhất trước, qua 3 trang; lọc trạng thái', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await db.query<{ id: string }>(
        `INSERT INTO support_tickets (code, contact, subject, status) VALUES ($1, '{"phone":"+84912345678"}'::jsonb, 'Cần hỗ trợ', $2) RETURNING id`,
        [`SP-LO0000${i}`, i === 3 ? 'RESOLVED' : 'OPEN'],
      );
      ids.push(r.rows[0]!.id);
    }
    const all = await walk('/api/v1/admin/support', 'cursor');
    expect(all.pages).toBe(3);
    expectNewestFirst(all.ids, ids);
    expect((await walk('/api/v1/admin/support', 'cursor', { status: 'RESOLVED' })).ids).toEqual([ids[3]]);
    expect((await request(app).get('/api/v1/admin/support').set(auth()).query({ status: 'XYZ' })).status).toBe(422);
  });

  it('thanh toán: giao dịch mới nhất trước, qua 2 trang', async () => {
    const hotel = await mkHotel({ code: 'PAYLO' });
    const rt = await mkRoomType(hotel, 10);
    const bookings: string[] = [];
    for (let i = 0; i < 3; i++) bookings.push((await createBookingVia(app, { hotelId: hotel, roomTypeId: rt, paymentMethod: 'SEPAY', offDays: 20 + i })).id);
    const expected = (await db.query<{ id: string }>('SELECT id FROM payments WHERE booking_id = ANY($1::uuid[]) ORDER BY seq', [bookings])).rows.map((r) => r.id);
    expect(expected).toHaveLength(3);
    const all = await walk('/api/v1/admin/payments', 'cursor');
    expect(all.pages).toBe(2);
    expectNewestFirst(all.ids, expected);
    expect((await walk('/api/v1/admin/payments', 'cursor', { method: 'SEPAY' })).ids).toEqual(all.ids); // chỉ còn cổng SePay
  });

  it('đơn vị chi trả: mới nhất trước, qua 3 trang; lọc trạng thái', async () => {
    const ids: string[] = [];
    for (const [i, code] of ['PAA', 'PBB', 'PCC', 'PDD', 'PEE'].entries()) {
      const r = await request(app).post('/api/v1/admin/payers').set(auth()).set('Idempotency-Key', `lo-payer-${i}-${Date.now()}`).send({ code, name: `Đơn vị ${code}`, kind: 'AIRLINE' });
      expect(r.status).toBe(201);
      ids.push(r.body.payer.id);
    }
    await db.query("UPDATE payers SET status = 'SUSPENDED' WHERE id = $1", [ids[1]]);
    const all = await walk('/api/v1/admin/payers', 'after');
    expect(all.pages).toBe(3);
    expectNewestFirst(all.ids, ids);
    expect((await walk('/api/v1/admin/payers', 'after', { status: 'SUSPENDED' })).ids).toEqual([ids[1]]);
    expect((await request(app).get('/api/v1/admin/payers').set(auth()).query({ status: 'X' })).status).toBe(422);
  });

  it('đơn đặt phòng (admin): mới nhất trước; lọc khoảng ngày nhận phòng theo biên', async () => {
    const hotel = await mkHotel({ code: 'BKLO' });
    const rt = await mkRoomType(hotel, 10);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await createBookingVia(app, { hotelId: hotel, roomTypeId: rt, offDays: 40 + i })).id);
    const all = await walk('/api/v1/admin/bookings', 'cursor', { hotelId: hotel });
    expectNewestFirst(all.ids, ids);
    const from = (await db.query<{ stayFrom: Date }>('SELECT stay_from FROM bookings WHERE id = $1', [ids[1]])).rows[0]!.stayFrom;
    const exact = await request(app).get('/api/v1/admin/bookings').set(auth()).query({ hotelId: hotel, from: from.toISOString(), to: new Date(from.getTime() + 1).toISOString() });
    expect(exact.body.items.map((b: { id: string }) => b.id)).toEqual([ids[1]]); // from bao gồm, to loại trừ
    expect((await request(app).get('/api/v1/admin/bookings').set(auth()).query({ from: from.toISOString(), to: from.toISOString() })).status).toBe(422);
  });
});
