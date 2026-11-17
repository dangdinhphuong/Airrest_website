import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { buildSepayIpn } from '../lib/sepay';
import { closeDb, count, freshDb, mkHotel, mkRoomType, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: thanh toán SePay (mock) — link, trang checkout, IPN, idempotent, lệch tiền', () => {
  const app = createApp();
  let hotelId: string;
  let roomTypeId: string;
  let n = 0;
  const day = 86400_000;

  const book = () => {
    const off = 2 + n;
    return request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `sepay-key-${++n}-${Date.now()}`)
      .send({
        hotelId, roomTypeId,
        from: new Date(Date.now() + off * day).toISOString(), to: new Date(Date.now() + (off + 1) * day).toISOString(),
        guest: { fullName: 'Khách SePay', phone: '0912345678' },
        paymentMethod: 'SEPAY',
      });
  };
  type P = { id: string; amountVnd: number; status: string; gateway: { orderId: string; sepayTransactionId?: string }; anomaly?: { kind: string } };
  const payOf = async (code: string) => {
    const b = (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
    const p = (await one<P>('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id]))!;
    return { b, p };
  };
  const status = async (id: string) => (await one<any>('SELECT * FROM bookings WHERE id = $1', [id]))!.status as string;
  const ipn = (body: object) => request(app).post('/v1/payments/sepay/ipn').send(body);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelId = await mkHotel({ code: 'S1', name: 'KS SePay' });
    roomTypeId = await mkRoomType(hotelId, 1, 800_000);
  });
  afterAll(async () => closeDb());

  it('đặt SePay: PENDING_PAYMENT, payments method SEPAY, có link; /methods có SEPAY', async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    expect(res.body.booking.payment.method).toBe('SEPAY');
    const { p } = await payOf(res.body.booking.code);
    expect(p.status).toBe('PENDING');
    expect(res.body.paymentLink.payUrl).toContain(p.gateway.orderId);
    const m = await request(app).get('/v1/payments/methods');
    expect(m.body.methods.some((x: { id: string }) => x.id === 'SEPAY')).toBe(true);
  });

  it('trang checkout: form POST có chữ ký, CSP riêng; mỗi lần mở dùng mã đơn MỚI; id lạ -> 404', async () => {
    const { p } = await payOf((await book()).body.booking.code);
    const open = () => request(app).get(`/v1/payments/sepay/checkout/${p.id}`);
    const inv = (html: string) => /name="order_invoice_number" value="([^"]+)"/.exec(html)![1]!;
    const a = await open();
    expect(a.status).toBe(200);
    expect(a.text).toContain('name="signature"');
    expect(a.headers['content-security-policy']).toContain('form-action https://pay.sepay.vn');
    const b = await open(); // khách mở lại / bấm lại: SePay không chấp nhận mã trùng
    expect(inv(b.text)).not.toBe(inv(a.text));
    expect((await one<P>('SELECT * FROM payments WHERE id = $1', [p.id]))!.gateway.orderId).toBe(inv(b.text)); // bản ghi giữ mã mới nhất
    expect((await request(app).get('/v1/payments/sepay/checkout/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await request(app).get('/v1/payments/sepay/checkout/khong-phai-uuid')).status).toBe(404);
  });

  it('IPN theo mã ĐÃ DÙNG ở phiên mở trước vẫn khớp giao dịch (khách thanh toán ở tab cũ)', async () => {
    const { b, p } = await payOf((await book()).body.booking.code);
    const first = /name="order_invoice_number" value="([^"]+)"/.exec((await request(app).get(`/v1/payments/sepay/checkout/${p.id}`)).text)![1]!;
    await request(app).get(`/v1/payments/sepay/checkout/${p.id}`); // mở lần 2 -> mã hiện tại đổi, `first` thành mã cũ
    expect((await ipn(buildSepayIpn({ invoice: first, amount: p.amountVnd, success: true, transactionId: 'tx-old' }))).status).toBe(200);
    expect(await status(b.id)).toBe('CONFIRMED');
  });

  it('IPN ORDER_PAID: CONFIRMED, lưu mã giao dịch SePay; IPN lặp idempotent (1 payment SUCCEEDED, 3 dòng sổ cái)', async () => {
    const { b, p } = await payOf((await book()).body.booking.code);
    const body = buildSepayIpn({ invoice: p.gateway.orderId, amount: p.amountVnd, success: true, transactionId: 'tx-123' });
    const r1 = await ipn(body);
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ success: true });
    expect(await status(b.id)).toBe('CONFIRMED');
    expect((await ipn(body)).status).toBe(200);
    expect(await count('ledger_entries', 'booking_id = $1', [b.id])).toBe(3);
    expect(await count('payments', "booking_id = $1 AND status = 'SUCCEEDED'", [b.id])).toBe(1);
    expect((await payOf(b.code)).p.gateway.sepayTransactionId).toBe('tx-123');
  });

  it('lệch tiền: không xác nhận, ghi anomaly AMOUNT_MISMATCH', async () => {
    const { b, p } = await payOf((await book()).body.booking.code);
    expect((await ipn(buildSepayIpn({ invoice: p.gateway.orderId, amount: p.amountVnd - 1000, success: true, transactionId: 'tx-9' }))).status).toBe(200);
    expect(await status(b.id)).toBe('PENDING_PAYMENT');
    expect((await payOf(b.code)).p.anomaly?.kind).toBe('AMOUNT_MISMATCH');
  });

  it('TRANSACTION_VOID, mã đơn lạ, thiếu số tiền: trả 200, không đổi trạng thái', async () => {
    const { b, p } = await payOf((await book()).body.booking.code);
    expect((await ipn(buildSepayIpn({ invoice: p.gateway.orderId, amount: p.amountVnd, success: false, transactionId: 'tx-v' }))).status).toBe(200);
    expect(await status(b.id)).toBe('PENDING_PAYMENT');
    expect((await ipn(buildSepayIpn({ invoice: 'KHONG-TON-TAI', amount: 1, success: true, transactionId: 'x' }))).status).toBe(200);
    expect((await ipn({ notification_type: 'ORDER_PAID', order: { order_invoice_number: p.gateway.orderId } })).status).toBe(200);
    expect(await status(b.id)).toBe('PENDING_PAYMENT');
    expect((await ipn({})).status).toBe(200);
  });
});
