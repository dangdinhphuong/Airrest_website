import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { HOTEL_OWNER_ROLE } from '../config/roles';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { closeDb, db, freshDb, mkAccount, mkHotel, mkStaff, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: báo cáo doanh thu từng khách sạn + tổng doanh nghiệp', () => {
  const app = createApp();
  let bizA = '', bizB = '', H1 = '', H2 = '', H3 = '', HB = '', ownerTok = '', ownerBTok = '', staff1 = '', staffNoRead = '';

  // stayFrom nhận ISO có múi giờ VN để kiểm ranh giới ngày.
  const mkBooking = async (hotelId: string, status: string, stayFrom: string, room: number, shuttle: number, fee: number) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO bookings (id, code, status, hotel_id, guest, hotel_snapshot, stay, stay_from, lines, pricing, payment_method, shuttle, status_history, flags)
       VALUES ($1,$2,$3,$4,'{}','{}','{}',$5,'[]',$6::jsonb,'AT_HOTEL','{}','[]','{}')`,
      [id, `AR-${id.slice(0, 8).toUpperCase()}`, status, hotelId, stayFrom, JSON.stringify({ roomVnd: room, shuttleVnd: shuttle, serviceFeeVnd: fee, totalVnd: room + shuttle + fee })],
    );
  };
  const mkOwner = async (biz: string, email: string, hotelId: string) => {
    const id = await mkAccount({ type: 'HOTEL', email, hotelId, roleIds: [await systemRoleId(HOTEL_OWNER_ROLE.key)] });
    await db.query('UPDATE accounts SET business_id = $2, is_owner = true WHERE id = $1', [id, biz]);
    return signAccountToken({ sub: id, accountType: 'HOTEL', hotelId });
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    bizA = (await one<{ id: string }>("INSERT INTO businesses (name, status) VALUES ('DN A','ACTIVE') RETURNING id"))!.id;
    bizB = (await one<{ id: string }>("INSERT INTO businesses (name, status) VALUES ('DN B','ACTIVE') RETURNING id"))!.id;
    H1 = await mkHotel({ code: 'R1', name: 'KS R1' });
    H2 = await mkHotel({ code: 'R2', name: '=R2 hotel' }); // tên bắt đầu bằng "=" để kiểm chống công thức CSV
    H3 = await mkHotel({ code: 'R3', name: 'KS R3 (không đơn)' });
    HB = await mkHotel({ code: 'RB', name: 'KS của DN B' });
    await db.query('UPDATE hotels SET business_id = $1 WHERE id = ANY($2::uuid[])', [bizA, [H1, H2, H3]]);
    await db.query('UPDATE hotels SET business_id = $1 WHERE id = $2', [bizB, HB]);
    ownerTok = await mkOwner(bizA, 'owner-a@dn.vn', H1);
    ownerBTok = await mkOwner(bizB, 'owner-b@dn.vn', HB);
    staff1 = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
    staffNoRead = (await mkStaff(H1, [PERM.ROOM_MANAGE])).token;

    // H1: ngày 10/03 (giờ VN) và ranh giới 23:30 VN ngày 10/03 = 16:30Z; 00:10 VN 11/03 = 17:10Z ngày 10/03 -> thuộc ngày 11 theo giờ VN
    await mkBooking(H1, 'CHECKED_OUT', '2026-03-10T03:00:00+07:00', 1_000_000, 100_000, 50_000);
    await mkBooking(H1, 'CHECKED_OUT', '2026-03-10T23:30:00+07:00', 500_000, 0, 25_000);
    await mkBooking(H1, 'CONFIRMED', '2026-03-11T00:10:00+07:00', 700_000, 0, 35_000);
    await mkBooking(H1, 'CHECKED_IN', '2026-03-20T12:00:00+07:00', 300_000, 50_000, 15_000);
    await mkBooking(H1, 'CANCELLED', '2026-03-10T12:00:00+07:00', 9_000_000, 0, 0); // không tính
    await mkBooking(H1, 'CHECKED_OUT', '2026-04-02T12:00:00+07:00', 2_000_000, 0, 100_000);
    await mkBooking(H2, 'CHECKED_OUT', '2026-03-15T12:00:00+07:00', 800_000, 0, 40_000);
    await mkBooking(H2, 'NO_SHOW', '2026-03-15T12:00:00+07:00', 800_000, 0, 40_000); // không tính
    await mkBooking(HB, 'CHECKED_OUT', '2026-03-10T12:00:00+07:00', 123_000_000, 0, 0); // DN khác
    await db.query("INSERT INTO hotel_payouts (hotel_id, period, status, gross_vnd, commission_vnd, net_vnd, line_count) VALUES ($1,'2026-03','PAID',1000000,100000,900000,1), ($1,'2026-02','DRAFT',5,1,4,1), ($2,'2026-03','LOCKED',800000,80000,720000,1)", [H1, H2]);
  });
  afterAll(async () => closeDb());

  const rev = (t: string, qs: string) => request(app).get(`/api/v1/hotel/reports/revenue?${qs}`).set(bearer(t));
  const sum = (t: string, qs: string) => request(app).get(`/api/v1/hotel/reports/revenue/summary?${qs}`).set(bearer(t));

  it('riêng khách sạn: đúng công thức realized/expected (phòng+xe), phí dịch vụ tách riêng, đơn hủy/không đến bị loại, ranh giới ngày theo giờ VN', async () => {
    const r = await rev(ownerTok, `hotelId=${H1}&from=2026-03-01&to=2026-03-31&groupBy=day`);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(31);
    const day = (d: string) => r.body.items.find((i: any) => i.bucket === d);
    expect(day('2026-03-10')).toMatchObject({ bookings: 2, realizedVnd: 1_600_000, expectedVnd: 0, serviceFeeRealizedVnd: 75_000 });
    expect(day('2026-03-11')).toMatchObject({ bookings: 1, realizedVnd: 0, expectedVnd: 700_000, serviceFeeExpectedVnd: 35_000 });
    expect(day('2026-03-20')).toMatchObject({ expectedVnd: 350_000 });
    expect(day('2026-03-12')).toMatchObject({ bookings: 0, realizedVnd: 0 });
    expect(r.body.totals).toEqual({ bookings: 4, realizedVnd: 1_600_000, expectedVnd: 1_050_000, serviceFeeRealizedVnd: 75_000, serviceFeeExpectedVnd: 50_000 });
    expect(r.body.settlement.items).toHaveLength(1); // chỉ kỳ 2026-03 PAID; DRAFT không tính
    expect(r.body.settlement.totals).toEqual({ grossVnd: 1_000_000, commissionVnd: 100_000, netVnd: 900_000 });
  });

  it('khớp với thống kê khách sạn hiện có (cùng định nghĩa)', async () => {
    const r = await rev(ownerTok, `hotelId=${H1}&from=2026-03-01&to=2026-03-31`);
    const s = await request(app).get(`/api/v1/hotel/stats?from=${encodeURIComponent('2026-02-28T17:00:00.000Z')}&to=${encodeURIComponent('2026-03-31T17:00:00.000Z')}`).set(bearer(ownerTok));
    expect(s.body.revenue.realized.hotelShareVnd).toBe(r.body.totals.realizedVnd);
    expect(s.body.revenue.expected.hotelShareVnd).toBe(r.body.totals.expectedVnd);
  });

  it('groupBy=month: gộp theo tháng giờ VN, tổng khớp tổng ngày', async () => {
    const m = await rev(ownerTok, `hotelId=${H1}&from=2026-03-01&to=2026-04-30&groupBy=month`);
    expect(m.body.items.map((i: any) => i.bucket)).toEqual(['2026-03', '2026-04']);
    expect(m.body.items[1]).toMatchObject({ realizedVnd: 2_000_000, bookings: 1 });
    expect(m.body.totals.realizedVnd).toBe(3_600_000);
    expect(m.body.settlement.totals.netVnd).toBe(900_000);
  });

  it('phân quyền: nhân viên booking:read chỉ khách sạn của mình; khách sạn khác/DN khác/không tồn tại = 404; thiếu booking:read = 403; không token = 401', async () => {
    expect((await rev(staff1, `hotelId=${H1}&from=2026-03-01&to=2026-03-31`)).status).toBe(200);
    expect((await rev(staff1, `hotelId=${H2}&from=2026-03-01&to=2026-03-31`)).status).toBe(404); // cùng DN nhưng nhân viên không có quyền doanh nghiệp
    expect((await rev(ownerTok, `hotelId=${HB}&from=2026-03-01&to=2026-03-31`)).status).toBe(404);
    expect((await rev(ownerTok, `hotelId=${randomUUID()}&from=2026-03-01&to=2026-03-31`)).status).toBe(404);
    expect((await rev(ownerBTok, `hotelId=${H1}&from=2026-03-01&to=2026-03-31`)).status).toBe(404);
    expect((await rev(staffNoRead, `hotelId=${H1}&from=2026-03-01&to=2026-03-31`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/hotel/reports/revenue?hotelId=${H1}&from=2026-03-01&to=2026-03-31`)).status).toBe(401);
    expect((await rev(ownerTok, `hotelId=${H2}&from=2026-03-01&to=2026-03-31`)).status).toBe(200); // chủ xem được khách sạn khác của DN mình
  });

  it('tham số: thiếu hotelId/ngày sai định dạng 422; from > to và > 366 ngày 422 đúng mã', async () => {
    expect((await rev(ownerTok, 'from=2026-03-01&to=2026-03-31')).status).toBe(422);
    expect((await rev(ownerTok, `hotelId=${H1}&from=01-03-2026&to=2026-03-31`)).status).toBe(422);
    expect((await rev(ownerTok, `hotelId=${H1}&from=2026-03-31&to=2026-03-01`)).body.error.code).toBe('INVALID_RANGE');
    expect((await rev(ownerTok, `hotelId=${H1}&from=2025-01-01&to=2026-03-01`)).body.error.code).toBe('RANGE_TOO_LARGE');
  });

  it('tổng doanh nghiệp: mỗi khách sạn một dòng (kể cả không đơn), tổng cộng = tổng các dòng = tổng báo cáo riêng, không lẫn DN khác', async () => {
    const r = await sum(ownerTok, 'from=2026-03-01&to=2026-03-31');
    expect(r.status).toBe(200);
    expect(r.body.hotels.map((h: any) => h.code)).toEqual(['R1', 'R2', 'R3']);
    const row = (c: string) => r.body.hotels.find((h: any) => h.code === c);
    expect(row('R2')).toMatchObject({ bookings: 1, realizedVnd: 800_000, expectedVnd: 0, settlement: { grossVnd: 800_000, commissionVnd: 80_000, netVnd: 720_000 } });
    expect(row('R3')).toMatchObject({ bookings: 0, realizedVnd: 0, settlement: { netVnd: 0 } });
    const t = r.body.totals;
    for (const k of ['bookings', 'realizedVnd', 'expectedVnd', 'serviceFeeRealizedVnd', 'serviceFeeExpectedVnd']) expect(t[k]).toBe(r.body.hotels.reduce((s: number, h: any) => s + h[k], 0));
    expect(t.settlement.netVnd).toBe(900_000 + 720_000);
    expect(t.realizedVnd).toBe(1_600_000 + 800_000);
    const h1 = (await rev(ownerTok, `hotelId=${H1}&from=2026-03-01&to=2026-03-31`)).body.totals;
    const h2 = (await rev(ownerTok, `hotelId=${H2}&from=2026-03-01&to=2026-03-31`)).body.totals;
    expect(t.realizedVnd).toBe(h1.realizedVnd + h2.realizedVnd);
    expect(JSON.stringify(r.body)).not.toContain('KS của DN B');
  });

  it('tổng doanh nghiệp: chỉ chủ (business:report:read + businessId); nhân viên 403', async () => {
    expect((await sum(staff1, 'from=2026-03-01&to=2026-03-31')).status).toBe(403);
    expect((await request(app).get('/api/v1/hotel/reports/revenue/summary?from=2026-03-01&to=2026-03-31')).status).toBe(401);
    const b = await sum(ownerBTok, 'from=2026-03-01&to=2026-03-31');
    expect(b.body.hotels.map((h: any) => h.code)).toEqual(['RB']);
    expect(b.body.totals.realizedVnd).toBe(123_000_000);
  });

  it('CSV: dòng Tổng cộng khớp, tên bắt đầu bằng "=" được vô hiệu hóa công thức', async () => {
    const r = await sum(ownerTok, 'from=2026-03-01&to=2026-03-31&format=csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain('"\'=R2 hotel"');
    expect(r.text).toContain('"Tổng cộng","5","2400000"');
    const d = await rev(ownerTok, `hotelId=${H1}&from=2026-03-01&to=2026-03-31&format=csv`);
    expect(d.text.split('\r\n').filter(Boolean)).toHaveLength(1 + 31 + 1);
  });
});
