import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hotelPayoutsRouter } from '../api/modules/hotelPayouts/hotelPayouts.router';
import { errorHandler } from '../api/middleware/errorHandler';
import { PERM } from '../config/permissions';
import { closeDb, db, freshDb, mkHotel, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: khách sạn xem chi trả của mình', () => {
  const app = express();
  app.use(express.json());
  app.use('/v1/hotel/payouts', hotelPayoutsRouter);
  app.use(errorHandler);
  let H1 = '', H2 = '', tok1 = '', tokNoPerm = '', draft = '', locked = '', paid = '', other = '';

  const mkPayout = async (hotel: string, period: string, status: string) => {
    const p = (await one<{ id: string }>("INSERT INTO hotel_payouts (hotel_id, period, status, gross_vnd, commission_vnd, net_vnd, line_count, locked_by) VALUES ($1,$2,$3,1000000,100000,900000,1,(SELECT id FROM accounts LIMIT 1)) RETURNING id", [hotel, period, status]))!.id;
    await db.query("INSERT INTO hotel_payout_lines (payout_id, kind, gross_vnd, commission_vnd, net_vnd, memo) VALUES ($1,'ADJUSTMENT',1000000,100000,900000,'ghi chú')", [p]);
    return p;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'P1' });
    H2 = await mkHotel({ code: 'P2' });
    tok1 = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
    tokNoPerm = (await mkStaff(H1, [PERM.ROOM_MANAGE])).token;
    draft = await mkPayout(H1, '2026-01', 'DRAFT');
    locked = await mkPayout(H1, '2026-02', 'LOCKED');
    paid = await mkPayout(H1, '2026-03', 'PAID');
    other = await mkPayout(H2, '2026-02', 'LOCKED');
  });
  afterAll(closeDb);

  it('danh sách: chỉ LOCKED/PAID của mình, không lộ nháp/KS khác/cột nội bộ', async () => {
    const r = await request(app).get('/v1/hotel/payouts').set(bearer(tok1));
    expect(r.status).toBe(200);
    expect(r.body.items.map((x: any) => x.id).sort()).toEqual([locked, paid].sort());
    expect(r.body.items[0]).not.toHaveProperty('lockedBy');
    expect(r.body.items[0]).not.toHaveProperty('hotelId');
    expect(r.body.items[0].commissionVnd).toBe(100000);
    const f = await request(app).get('/v1/hotel/payouts?period=2026-03').set(bearer(tok1));
    expect(f.body.items.map((x: any) => x.id)).toEqual([paid]);
  });
  it('phân trang theo cursor', async () => {
    const a = await request(app).get('/v1/hotel/payouts?limit=1').set(bearer(tok1));
    expect(a.body.items).toHaveLength(1);
    const b = await request(app).get(`/v1/hotel/payouts?limit=1&cursor=${a.body.nextCursor}`).set(bearer(tok1));
    expect(b.body.items).toHaveLength(1);
    expect(b.body.items[0].id).not.toBe(a.body.items[0].id);
    expect(b.body.nextCursor).toBeNull();
  });
  it('chi tiết: dòng của bảng mình, không có payer', async () => {
    const r = await request(app).get(`/v1/hotel/payouts/${locked}`).set(bearer(tok1));
    expect(r.status).toBe(200);
    expect(r.body.lines).toHaveLength(1);
    expect(r.body.lines[0]).not.toHaveProperty('payerId');
  });
  it('IDOR + nháp: 404 PAYOUT_NOT_FOUND', async () => {
    for (const id of [other, draft]) {
      const r = await request(app).get(`/v1/hotel/payouts/${id}`).set(bearer(tok1));
      expect(r.status).toBe(404);
      expect(r.body.error?.code ?? r.body.code).toBe('PAYOUT_NOT_FOUND');
    }
  });
  it('quyền: thiếu BOOKING_READ = 403, không token = 401', async () => {
    expect((await request(app).get('/v1/hotel/payouts').set(bearer(tokNoPerm))).status).toBe(403);
    expect((await request(app).get(`/v1/hotel/payouts/${locked}`).set(bearer(tokNoPerm))).status).toBe(403);
    expect((await request(app).get('/v1/hotel/payouts')).status).toBe(401);
  });
  it('chỉ đọc: POST không có route', async () => {
    expect((await request(app).post('/v1/hotel/payouts').set(bearer(tok1)).send({})).status).toBe(404);
  });
});
