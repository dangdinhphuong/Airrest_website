import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { signAccountToken } from '../lib/jwt';
import { buildVnpayIpn, vnpayGateway } from '../lib/vnpay';
import { closeDb, count, db, freshDb, mkAccount, mkHotel, mkRoomType, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: thanh toán VNPay (mock) — tạo link, IPN, hoàn, đối soát', () => {
  const app = createApp();
  let hotelId: string;
  let roomTypeId: string;
  let fin = '';
  let sup = '';
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const day = 86400_000;

  const book = async (opts: { online?: boolean; phone?: string; dayOffset?: number } = {}) => {
    const off = opts.dayOffset ?? 2 + n; // mỗi lần đặt một ngày khác nhau để khỏi hết phòng
    const res = await request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `pay-key-${++n}-${Date.now()}`)
      .send({
        hotelId, roomTypeId,
        from: new Date(Date.now() + off * day).toISOString(), to: new Date(Date.now() + (off + 1) * day).toISOString(),
        guest: { fullName: 'Khách VNPay', phone: opts.phone ?? '0912345678' },
        ...(opts.online !== false && { paymentMethod: 'VNPAY' }),
      });
    return res;
  };
  type P = { id: string; amountVnd: number; gateway: { orderId: string; requestId: string }; status: string; anomaly?: { kind: string } };
  const bookingByCode = async (code: string) => (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
  const payOf = async (code: string) => {
    const b = await bookingByCode(code);
    const p = (await one<P>('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id]))!;
    return { b, p };
  };
  const stateOf = async (id: string) => (await one<any>('SELECT * FROM bookings WHERE id = $1', [id]))!;
  const ipn = (p: { gateway: { orderId: string } }, amount: number, resultCode = 0) =>
    request(app).get('/v1/payments/vnpay/ipn').query(buildVnpayIpn({ txnRef: p.gateway.orderId, amount, transId: 999, success: resultCode === 0 }));

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel({ code: 'P1', name: 'KS Pay' });
    roomTypeId = await mkRoomType(hotelId, 1, 800_000);
    for (const [k, role] of [['fin', 'FINANCE'], ['sup', 'SUPPORT']] as const) {
      const id = await mkAccount({ type: 'ADMIN', email: `${k}@airrest.vn`, roleIds: [await systemRoleId(role)], adminRole: role });
      const t = signAccountToken({ sub: id, accountType: 'ADMIN' });
      if (k === 'fin') fin = t; else sup = t;
    }
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => closeDb());

  const resv = async (bookingId: string) => (await one<{ state: string }>('SELECT state FROM room_reservations WHERE booking_id = $1', [bookingId]))!;
  const expire = (bookingId: string) => db.query("UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1", [bookingId]);

  it('đặt VNPay: đơn PENDING_PAYMENT, giữ phòng, có link', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    expect(res.body.booking.expiresAt).toBeTruthy();
    expect(res.body.paymentLink.payUrl).toContain('orderId=');
    const { b, p } = await payOf(res.body.booking.code);
    expect(p.status).toBe('PENDING');
    expect(p.amountVnd).toBe(b.pricing.totalVnd);
    expect((await resv(b.id)).state).toBe('HOLD');
  });

  it('IPN sai chữ ký -> RspCode 97, đơn không đổi', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    const bad = buildVnpayIpn({ txnRef: p.gateway.orderId, amount: p.amountVnd, transId: 1, success: true });
    const r = await request(app).get('/v1/payments/vnpay/ipn').query({ ...bad, vnp_SecureHash: 'f'.repeat(128) });
    expect(r.body.RspCode).toBe('97');
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
  });

  it('IPN thành công: đơn CONFIRMED, phòng CONFIRMED, sổ cái cân bằng; IPN lặp (kể cả đồng thời) không ghi thêm', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    const amount = p.amountVnd;
    const both = await Promise.all([ipn(p, amount), ipn(p, amount)]); // hai IPN cùng lúc
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect((await ipn(p, amount)).body.RspCode).toBe('02'); // lặp: đã xác nhận
    const after = await stateOf(b.id);
    expect(after.status).toBe('CONFIRMED');
    expect(after.paymentStatus).toBe('PAID');
    expect(after.paidVnd).toBe(amount);
    expect(after.expiresAt).toBeUndefined();
    expect((await resv(b.id)).state).toBe('CONFIRMED');
    const entries = (await db.query<{ account: string; amountVnd: number }>('SELECT * FROM ledger_entries WHERE booking_id = $1', [b.id])).rows;
    expect(entries).toHaveLength(3); // lặp không sinh thêm
    const by = Object.fromEntries(entries.map((e) => [e.account, e.amountVnd]));
    expect(by.CUSTOMER_PAID).toBe(by.HOTEL_PAYABLE! + by.AIRREST_REVENUE!);
    expect(await count('payments', "booking_id = $1 AND status = 'SUCCEEDED'", [b.id])).toBe(1);
  });

  it('IPN lệch số tiền: không xác nhận, ghi anomaly AMOUNT_MISMATCH, admin thấy trong danh sách bất thường', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    expect((await ipn(p, 1000)).body.RspCode).toBe('04');
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
    const list = await request(app).get('/v1/admin/payments?anomaly=true').set(auth(fin));
    expect(list.status).toBe(200);
    expect(list.body.items.some((x: { anomaly?: { kind: string } }) => x.anomaly?.kind === 'AMOUNT_MISMATCH')).toBe(true);
  });

  it('IPN thất bại (khách hủy ở VNPay): payment FAILED, đơn vẫn chờ, lấy được link mới', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await ipn(p, p.amountVnd, 1006);
    expect((await one<P>('SELECT status FROM payments WHERE id = $1', [p.id]))!.status).toBe('FAILED');
    expect((await stateOf(b.id)).status).toBe('PENDING_PAYMENT');
    const link = await request(app).post('/v1/payments/vnpay/link').send({ code: b.code, phone: '0912345678' });
    expect(link.status).toBe(200);
    expect(link.body.paymentLink.payUrl).toContain('orderId=');
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(2);
    // gọi lại khi còn link hợp lệ -> trả link cũ, không tạo thêm
    await request(app).post('/v1/payments/vnpay/link').send({ code: b.code, phone: '0912345678' });
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(2);
    // sai SĐT -> 404
    expect((await request(app).post('/v1/payments/vnpay/link').send({ code: b.code, phone: '0999999999' })).status).toBe(404);
  });

  it('VNPay lỗi lúc tạo đơn: đơn vẫn giữ chỗ, trả paymentLink.error; lấy lại link sau đó được', async () => {
    vi.spyOn(vnpayGateway, 'create').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.paymentLink.error).toBe('VNPAY_UNAVAILABLE');
    const code = res.body.booking.code;
    const retry = await request(app).post('/v1/payments/vnpay/link').send({ code, phone: '0912345678' });
    expect(retry.status).toBe(200);
  });

  it('IPN đến sau khi đơn hết hạn: đơn EXPIRED, phòng nhả, tự hoàn 100% qua VNPay, sổ cái về 0', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await expire(b.id);
    const amount = p.amountVnd;
    expect((await ipn(p, amount)).body.RspCode).toBe('00');
    const after = await stateOf(b.id);
    expect(after.status).toBe('EXPIRED');
    expect((await resv(b.id)).state).toBe('RELEASED');
    const refund = (await one<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id]))!;
    expect(refund.status).toBe('REFUNDED');
    expect(refund.reasonCode).toBe('LATE_PAYMENT');
    expect(refund.amountVnd).toBe(amount);
    expect(after.paymentStatus).toBe('REFUNDED');
    expect((await one<P>('SELECT anomaly FROM payments WHERE id = $1', [p.id]))!.anomaly?.kind).toBe('LATE_SUCCESS');
    const sum = (await one<{ s: number }>("SELECT sum(amount_vnd) AS s FROM ledger_entries WHERE booking_id = $1 AND account = 'CUSTOMER_PAID'", [b.id]))!.s;
    expect(sum).toBe(0);
  });

  it('hai giao dịch cùng thanh toán một đơn: giao dịch thứ hai bị hoàn 100% (DUPLICATE)', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await ipn(p, p.amountVnd, 1006); // payment 1 thất bại -> FAILED
    const second = await request(app).post('/v1/payments/vnpay/link').send({ code: b.code, phone: '0912345678' });
    expect(second.status).toBe(200);
    const all = (await db.query<P>('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at', [b.id])).rows;
    await ipn(all[1]!, all[1]!.amountVnd); // thanh toán link mới
    await ipn(all[0]!, all[0]!.amountVnd); // link cũ cũng bị trả tiền (success muộn)
    expect((await stateOf(b.id)).status).toBe('CONFIRMED');
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0].reasonCode).toBe('DUPLICATE_PAYMENT');
    expect(refunds[0].status).toBe('REFUNDED');
    expect((await stateOf(b.id)).paymentStatus).toBe('PAID'); // đơn vẫn PAID: hoàn một giao dịch trong hai
  });

  it('hoàn thất bại: thử lại tới hết lượt rồi MANUAL_REQUIRED; admin thử lại lệnh thành công', async () => {
    const spy = vi.spyOn(vnpayGateway, 'refund').mockResolvedValue({ ok: false, code: '10', message: 'ví khách đóng' });
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    await expire(b.id);
    await ipn(p, p.amountVnd);
    let r = (await one<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id]))!;
    expect(r.status).toBe('PENDING');
    expect(r.attempts).toHaveLength(1);
    // 3 lần thử lại (cấu hình refund.gatewayRetries) rồi hết lượt
    for (let i = 0; i < 3; i++) {
      await db.query("UPDATE refunds SET due_at = now() - interval '1 second' WHERE id = $1", [r.id]);
      const rec = await request(app).post('/v1/admin/payments/reconcile').set(auth(fin));
      expect(rec.status).toBe(200);
    }
    r = (await one<any>('SELECT * FROM refunds WHERE id = $1', [r.id]))!;
    expect(r.status).toBe('MANUAL_REQUIRED');
    expect(r.attempts).toHaveLength(4);
    expect(spy.mock.calls.every((c) => c[0].requestId === r.gateway.requestId)).toBe(true); // luôn cùng requestId -> không hoàn kép
    // thiếu quyền -> 403
    expect((await request(app).post(`/v1/admin/refunds/${r.id}/retry`).set(auth(sup))).status).toBe(403);
    vi.spyOn(vnpayGateway, 'refund').mockResolvedValue({ ok: true, code: '00', message: 'ok', transId: 5 });
    const retry = await request(app).post(`/v1/admin/refunds/${r.id}/retry`).set(auth(fin));
    expect(retry.status).toBe(200);
    expect(retry.body.refund.status).toBe('REFUNDED');
    expect((await request(app).post(`/v1/admin/refunds/${r.id}/retry`).set(auth(fin))).status).toBe(409);
  });

  it('đối soát: đơn quá hạn thanh toán -> EXPIRED + nhả phòng; giao dịch treo hỏi VNPay ra thành công -> xác nhận', async () => {
    const a = await book();
    const expired = (await payOf(a.body.booking.code)).b;
    await expire(expired.id);

    const c = await book();
    const { b: stuck, p: stuckP } = await payOf(c.body.booking.code);
    await db.query("UPDATE payments SET created_at = now() - interval '20 minutes' WHERE id = $1", [stuckP.id]);
    vi.spyOn(vnpayGateway, 'query').mockImplementation(async ({ txnRef }) =>
      txnRef === stuckP.gateway.orderId ? { status: 'SUCCESS', message: 'ok', transId: 77, amount: stuckP.amountVnd } : { status: 'PENDING', message: 'chờ' });

    const rec = await request(app).post('/v1/admin/payments/reconcile').set(auth(fin));
    expect(rec.status).toBe(200);
    expect(rec.body.settled).toBeGreaterThanOrEqual(1);
    expect(rec.body.expiredBookings).toBeGreaterThanOrEqual(1);
    expect((await stateOf(expired.id)).status).toBe('EXPIRED');
    expect((await resv(expired.id)).state).toBe('RELEASED');
    expect((await one<P>('SELECT status FROM payments WHERE booking_id = $1', [expired.id]))!.status).toBe('EXPIRED');
    expect((await stateOf(stuck.id)).status).toBe('CONFIRMED');
    expect((await request(app).post('/v1/admin/payments/reconcile').set(auth(sup))).status).toBe(403);
  });

  it('simulate IPN (mock) đi qua đường thật; đơn AT_HOTEL không đổi', async () => {
    const res = await book();
    const { b, p } = await payOf(res.body.booking.code);
    const sim = await request(app).post('/v1/payments/vnpay/dev-simulate').send({ orderId: p.gateway.orderId });
    expect(sim.status).toBe(200);
    expect((await stateOf(b.id)).status).toBe('CONFIRMED');

    const hotel = await book({ online: false });
    expect(hotel.status).toBe(201);
    expect(hotel.body.booking.payment.method).toBe('AT_HOTEL');
    expect(hotel.body.paymentLink).toBeUndefined();
  });
});
