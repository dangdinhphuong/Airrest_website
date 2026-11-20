import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { env } from '../config/env';
import { signAccountToken } from '../lib/jwt';
import { buildMomoIpn, momoGateway } from '../lib/momo';
import { closeDb, count, db, freshDb, mkAccount, mkHotel, mkRoomType, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: thanh toán MoMo (mock) — link, IPN POST JSON, hoàn, đối soát, danh sách cổng', () => {
  const app = createApp();
  let hotelId: string;
  let roomTypeId: string;
  let fin = '';
  let n = 0;
  const day = 86400_000;

  const book = (method: 'MOMO' | 'VNPAY' = 'MOMO') => {
    const off = 2 + n;
    return request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', `momo-key-${++n}-${Date.now()}`)
      .send({
        hotelId, roomTypeId,
        from: new Date(Date.now() + off * day).toISOString(), to: new Date(Date.now() + (off + 1) * day).toISOString(),
        guest: { fullName: 'Khách MoMo', phone: '0912345678' },
        paymentMethod: method,
      });
  };
  type P = { id: string; method: string; amountVnd: number; gateway: { orderId: string; requestId: string; payUrl?: string }; status: string; anomaly?: { kind: string } };
  const payOf = async (code: string) => {
    const b = (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
    const p = (await one<P>('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id]))!;
    return { b, p };
  };
  const stateOf = async (id: string) => (await one<any>('SELECT * FROM bookings WHERE id = $1', [id]))!;
  const ipnBody = (p: P, amount = p.amountVnd, resultCode = 0) => buildMomoIpn({ orderId: p.gateway.orderId, requestId: p.gateway.requestId, amount, transId: 4242, resultCode });
  const ipn = (body: Record<string, unknown>) => request(app).post('/api/v1/payments/momo/ipn').send(body);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel({ code: 'M1', name: 'KS MoMo' });
    roomTypeId = await mkRoomType(hotelId, 1, 800_000);
    const id = await mkAccount({ type: 'ADMIN', email: 'finm@airrest.vn', roleIds: [await systemRoleId('FINANCE')], adminRole: 'FINANCE' });
    fin = signAccountToken({ sub: id, accountType: 'ADMIN' });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => closeDb());

  it('đặt MoMo: PENDING_PAYMENT, payments method MOMO, link mock đúng dạng', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    expect(res.body.booking.payment.method).toBe('MOMO');
    expect(res.body.paymentLink.payUrl).toMatch(/\?mock=1&gateway=momo&orderId=/);
    const { p } = await payOf(res.body.booking.code);
    expect(p.method).toBe('MOMO');
    expect(p.status).toBe('PENDING');
    expect(res.body.paymentLink.payUrl).toContain(p.gateway.orderId);
  });

  it('IPN thành công qua dev-simulate: CONFIRMED; IPN lặp idempotent', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    const sim = await request(app).post('/api/v1/payments/momo/dev-simulate').send({ orderId: p.gateway.orderId });
    expect(sim.status).toBe(200);
    expect(sim.body.reply.httpStatus).toBe(204);
    expect((await stateOf(b.id)).status).toBe('CONFIRMED');
    const body = ipnBody(p);
    expect((await ipn(body)).status).toBe(204); // lặp: không ghi thêm
    expect((await ipn(body)).status).toBe(204);
    expect(await count('ledger_entries', 'booking_id = $1', [b.id])).toBe(3);
    expect(await count('payments', "booking_id = $1 AND status = 'SUCCEEDED'", [b.id])).toBe(1);
    expect((await stateOf(b.id)).paidVnd).toBe(p.amountVnd);
  });

  it('IPN thất bại: payment FAILED, đơn vẫn chờ, lấy lại link được (cả /link và /momo/link)', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    expect((await request(app).post('/api/v1/payments/momo/dev-simulate').send({ orderId: p.gateway.orderId, resultCode: 1006 })).status).toBe(200);
    expect((await one<P>('SELECT status FROM payments WHERE id = $1', [p.id]))!.status).toBe('FAILED');
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
    const link = await request(app).post('/api/v1/payments/link').send({ code: b.code, phone: '0912345678' });
    expect(link.status).toBe(200);
    expect(link.body.paymentLink.payUrl).toContain('gateway=momo');
    expect((await request(app).post('/api/v1/payments/momo/link').send({ code: b.code, phone: '0912345678' })).status).toBe(200);
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(2);
  });

  it('IPN sai chữ ký / thiếu chữ ký: 400, đơn không đổi', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    expect((await ipn({ ...ipnBody(p), signature: 'f'.repeat(64) })).status).toBe(400);
    expect((await ipn({ ...ipnBody(p), amount: 1 })).status).toBe(400); // sửa body sau khi ký
    expect((await ipn({ ...ipnBody(p), signature: undefined })).status).toBe(400);
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
  });

  it('IPN lệch tiền (chữ ký đúng): không xác nhận, anomaly AMOUNT_MISMATCH', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    expect((await ipn(ipnBody(p, 1000))).status).toBe(204);
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
    expect((await one<P>('SELECT anomaly FROM payments WHERE id = $1', [p.id]))!.anomaly?.kind).toBe('AMOUNT_MISMATCH');
  });

  it('IPN MoMo cho đơn VNPay (orderId không thuộc MoMo) bị bỏ qua', async () => {
    const res = await book('VNPAY');
    const { b, p } = await payOf(res.body.booking.code);
    expect((await ipn(ipnBody(p))).status).toBe(204);
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
  });

  it('thanh toán trễ sau khi hết hạn: EXPIRED, hoàn 100% qua MoMo (refund method MOMO)', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1", [b.id]);
    expect((await ipn(ipnBody(p))).status).toBe(204);
    expect((await stateOf(b.id)).status).toBe('EXPIRED');
    const refund = (await one<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id]))!;
    expect(refund.method).toBe('MOMO');
    expect(refund.status).toBe('REFUNDED');
    expect(refund.reasonCode).toBe('LATE_PAYMENT');
    expect((await one<{ s: number }>("SELECT sum(amount_vnd) AS s FROM ledger_entries WHERE booking_id = $1 AND account = 'CUSTOMER_PAID'", [b.id]))!.s).toBe(0);
  });

  it('hoàn MoMo đang xử lý (resultCode 7000) không phải thất bại: giữ PROCESSING, không tốn lượt', async () => {
    vi.spyOn(momoGateway, 'refund').mockResolvedValue({ resultCode: 7000, message: 'đang xử lý' });
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1", [b.id]);
    await ipn(ipnBody(p));
    const r = (await one<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id]))!;
    expect(r.status).toBe('PROCESSING');
    expect(r.attempts).toHaveLength(0);
  });

  it('đối soát: giao dịch MoMo treo hỏi query ra thành công -> xác nhận', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await db.query("UPDATE payments SET created_at = now() - interval '20 minutes' WHERE id = $1", [p.id]);
    vi.spyOn(momoGateway, 'query').mockImplementation(async ({ orderId }) =>
      orderId === p.gateway.orderId ? { resultCode: 0, message: 'ok', transId: 99, amount: p.amountVnd } : { resultCode: 1000, message: 'chờ' });
    const rec = await request(app).post('/api/v1/admin/payments/reconcile').set({ Authorization: `Bearer ${fin}` });
    expect(rec.status).toBe(200);
    expect((await stateOf(b.id)).status).toBe('CONFIRMED');
  });

  it('live: link không tạo được -> paymentLink.error MOMO_UNAVAILABLE, lấy lại link sau đó được', async () => {
    vi.spyOn(momoGateway, 'create').mockResolvedValueOnce({ resultCode: 99, message: 'lỗi' });
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.paymentLink.error).toBe('MOMO_UNAVAILABLE');
    expect((await request(app).post('/api/v1/payments/link').send({ code: res.body.booking.code, phone: '0912345678' })).status).toBe(200);
  });

  it('lọc admin theo cổng: method=MOMO chỉ trả giao dịch MoMo', async () => {
    const r = await request(app).get('/api/v1/admin/payments?method=MOMO').set({ Authorization: `Bearer ${fin}` });
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((x: { method: string }) => x.method === 'MOMO')).toBe(true);
  });

  it('GET /payments/methods theo cờ env; cổng tắt -> đặt phòng 409', async () => {
    const ids = async () => ((await request(app).get('/api/v1/payments/methods')).body.methods as Array<{ id: string; mode?: string }>).map((m) => m.id);
    expect(await ids()).toEqual(['AT_HOTEL', 'VNPAY', 'MOMO', 'SEPAY']);
    const body = (await request(app).get('/api/v1/payments/methods')).body;
    expect(JSON.stringify(body)).not.toMatch(/partner|secret|key/i);

    const e = env as { MOMO_ENABLED: boolean; VNPAY_ENABLED: boolean; SEPAY_ENABLED: boolean };
    try {
      e.SEPAY_ENABLED = false; // SePay có test riêng (sepay.integration.test.ts)
      e.MOMO_ENABLED = false;
      expect(await ids()).toEqual(['AT_HOTEL', 'VNPAY']);
      const off = await book('MOMO');
      expect(off.status).toBe(409);
      expect(off.body.error.code).toBe('MOMO_DISABLED');
      e.VNPAY_ENABLED = false;
      expect(await ids()).toEqual(['AT_HOTEL']);
      expect((await book('VNPAY')).body.error.code).toBe('VNPAY_DISABLED');
    } finally {
      e.MOMO_ENABLED = true;
      e.VNPAY_ENABLED = true;
      e.SEPAY_ENABLED = true;
    }
  });
});
