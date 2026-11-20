import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { seedFleet } from '../database/scripts/seedFleet';
import { MAX_ADJUSTMENT_VND, assertAdjustAmount, assertAdjustTotal } from '../services/settlement/calc';
import * as hp from '../services/settlement/payouts';
import * as st from '../services/settlement/statements';
import { closeDb, count, db, freshDb, mkAccount, mkAdmin, mkHotel, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('trần số tiền điều chỉnh (không cần DB)', () => {
  it('từ chối 0, thập phân, vượt trần; tổng cộng dồn không vượt MAX_SAFE_INTEGER', () => {
    expect(() => assertAdjustAmount(0)).toThrow();
    expect(() => assertAdjustAmount(1.5)).toThrow();
    expect(() => assertAdjustAmount(MAX_ADJUSTMENT_VND + 1)).toThrow(expect.objectContaining({ code: 'AMOUNT_TOO_LARGE' }));
    expect(() => assertAdjustAmount(-MAX_ADJUSTMENT_VND)).not.toThrow();
    expect(() => assertAdjustTotal(Number.MAX_SAFE_INTEGER - 5, 5)).not.toThrow();
    expect(() => assertAdjustTotal(Number.MAX_SAFE_INTEGER - 5, 6)).toThrow(expect.objectContaining({ code: 'ADJUSTMENT_TOTAL_TOO_LARGE' }));
  });
});

run('tích hợp: điều chỉnh kết toán, đăng nhập payer tạm ngưng, seed xe', () => {
  const app = createApp();
  let n = 0;
  const ip = () => ({ 'X-Forwarded-For': `10.88.${Math.floor(++n / 250)}.${(n % 250) + 1}` });
  const ctx = (): st.Ctx => ({ auth: { kind: 'ACCOUNT', sub: randomUUID(), accountType: 'ADMIN', permissions: [] }, requestId: 'test' });
  let payerId = '';
  let hotelId = '';
  let admin = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    payerId = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('GRD','Guard Co','AIRLINE') RETURNING id"))!.id;
    hotelId = await mkHotel({ code: 'GRD-H' });
    admin = (await mkAdmin(['admin:payer:manage', 'admin:payer:read'])).token;
  });
  afterAll(async () => closeDb());

  it('điều chỉnh với payer/khách sạn/đơn không tồn tại -> 404 (không còn 500 vi phạm FK)', async () => {
    const ghost = randomUUID();
    const base = { period: '2026-03', amountVnd: 1000, memo: 'thử' };
    await expect(st.addPayerAdjustment(ctx(), { ...base, payerId: ghost })).rejects.toMatchObject({ status: 404, code: 'PAYER_NOT_FOUND' });
    await expect(st.addPayerAdjustment(ctx(), { ...base, payerId, bookingId: ghost })).rejects.toMatchObject({ status: 404, code: 'BOOKING_NOT_FOUND' });
    await expect(st.addPayerAdjustment(ctx(), { ...base, payerId, hotelId: ghost })).rejects.toMatchObject({ status: 404, code: 'HOTEL_NOT_FOUND' });
    await expect(hp.addHotelAdjustment(ctx(), { ...base, hotelId: ghost })).rejects.toMatchObject({ status: 404, code: 'HOTEL_NOT_FOUND' });
    await expect(hp.addHotelAdjustment(ctx(), { ...base, hotelId, bookingId: ghost })).rejects.toMatchObject({ status: 404, code: 'BOOKING_NOT_FOUND' });
  });

  it('số tiền vượt trần bị chặn ở service (422)', async () => {
    await expect(st.addPayerAdjustment(ctx(), { payerId, period: '2026-03', amountVnd: MAX_ADJUSTMENT_VND + 1, memo: 'quá lớn' })).rejects.toMatchObject({ status: 422, code: 'AMOUNT_TOO_LARGE' });
    await expect(hp.addHotelAdjustment(ctx(), { hotelId, period: '2026-03', amountVnd: -(MAX_ADJUSTMENT_VND + 1), memo: 'quá lớn' })).rejects.toMatchObject({ status: 422, code: 'AMOUNT_TOO_LARGE' });
  });

  it('API: zod chặn vượt trần, ID không tồn tại trả 404', async () => {
    const r1 = await request(app).post('/api/v1/admin/payer-statements/adjustments').set(bearer(admin)).set({ 'Idempotency-Key': `g-${randomUUID()}` }).set(ip())
      .send({ payerId, period: '2026-03', amountVnd: MAX_ADJUSTMENT_VND + 1, memo: 'quá lớn' });
    expect(r1.status).toBe(422);
    const r2 = await request(app).post('/api/v1/admin/hotel-payouts/adjustments').set(bearer(admin)).set({ 'Idempotency-Key': `g-${randomUUID()}` }).set(ip())
      .send({ hotelId: randomUUID(), period: '2026-03', amountVnd: 1000, memo: 'không có KS' });
    expect(r2.status).toBe(404);
  });

  it('đơn vị chi trả tạm ngưng: đăng nhập bị từ chối 403, hoạt động lại thì đăng nhập được', async () => {
    const roleId = await systemRoleId('payer_staff');
    const email = `nv-${randomUUID().slice(0, 8)}@chitra.mo`;
    const id = await mkAccount({ type: 'HOTEL', email, roleIds: [roleId] });
    await db.query("UPDATE accounts SET type = 'PAYER', payer_id = $2 WHERE id = $1", [id, payerId]);
    const login = (pw = 'Pass12345678!') => request(app).post('/api/v1/auth/login').set(ip()).send({ email, password: pw });
    expect((await login()).status).toBe(200);
    await db.query("UPDATE payers SET status = 'SUSPENDED' WHERE id = $1", [payerId]);
    const r = await login();
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PAYER_SUSPENDED');
    expect((await login('sai-mat-khau')).status).toBe(401); // sai mật khẩu vẫn là lỗi chung, không lộ trạng thái đơn vị
    await db.query("UPDATE payers SET status = 'ACTIVE' WHERE id = $1", [payerId]);
    expect((await login()).status).toBe(200);
  });

  it('seedFleet: tài xế taixe.han01.N (khớp seedAccounts/TAI_KHOAN_THU) nhận xe; chạy lại không nhân đôi', async () => {
    for (const code of ['HAN-01', 'HAN-02', 'SGN-01', 'DAD-01', 'CXR-01', 'PQC-01', 'HPH-01', 'HAN-03']) await mkHotel({ code });
    const r1 = await seedFleet('Pass12345678!');
    const acc = await one<{ id: string }>("SELECT id FROM accounts WHERE email = 'taixe.han01.1@airrest.vn'");
    expect(acc).toBeTruthy();
    expect(await count('vehicles', 'driver_account_id = $1', [acc!.id])).toBe(1);
    expect(await count('accounts', "email LIKE 'taixe.han-%'")).toBe(0);
    const total = await count('vehicles');
    const r2 = await seedFleet('Pass12345678!');
    expect(r2.vehicles).toBe(r1.vehicles);
    expect(await count('vehicles')).toBe(total);
  });
});
