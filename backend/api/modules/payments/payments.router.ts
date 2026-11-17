import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env';
import { db } from '../../../database/pg';
import type { PaymentDoc } from '../../../database/types';
import { buildSepayIpn } from '../../../lib/sepay';
import { AppError } from '../../../lib/errors';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { lookupBody, type LookupBody } from '@airrest/validation';
import { lookupBooking } from '../../../services/bookings/bookings.service';
import { ensurePaymentLink, handleSepayIpn, sepayCheckoutFor } from '../../../services/payments/payments.service';

// Công khai (không đăng nhập): SePay gọi IPN; khách lấy/làm mới link bằng mã đơn + SĐT.
export const paymentsRouter = Router();

// SePay gọi POST JSON, header X-Secret-Key là cơ chế xác thực duy nhất -> không rate limit riêng. 200 = đã nhận, 401 = sai khóa.
paymentsRouter.post('/sepay/ipn', async (req, res) => {
  const r = await handleSepayIpn(req.header('x-secret-key'), req.body ?? {}, String(req.id));
  res.status(r.status).json(r.body);
});

// Trang tự gửi form có chữ ký sang SePay (link thanh toán của đơn SePay). 404 chung cho mọi trường hợp không dùng được.
paymentsRouter.get('/sepay/checkout/:paymentId', async (req, res) => {
  const page = await sepayCheckoutFor(String(req.params.paymentId));
  if (!page) { res.status(404).type('text/plain').send('Liên kết thanh toán không còn hiệu lực.'); return; }
  res.setHeader('Content-Security-Policy', page.csp);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(page.html);
});

// Cổng đang bật cho FE (AT_HOTEL luôn có). Không lộ khóa/partnerCode.
paymentsRouter.get('/methods', (_req, res) => {
  res.json({
    methods: [
      { id: 'AT_HOTEL', label: 'Thanh toán tại khách sạn' },
      ...(env.SEPAY_ENABLED ? [{ id: 'SEPAY', label: 'SePay', mode: env.SEPAY_MODE }] : []),
    ],
  });
});

// Khách lấy lại link (cổng theo đơn) khi lần tạo đầu lỗi hoặc link cũ đã hỏng. Cùng cơ chế xác minh như tra cứu đơn (mã + SĐT).
paymentsRouter.post('/link', strictRateLimit, validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ paymentLink: await ensurePaymentLink(booking.id) });
});

// Chỉ môi trường mock + không production: giả lập SePay gọi IPN. Dựng đúng gói IPN rồi đi qua handleSepayIpn (mock không đòi X-Secret-Key).
if (env.SEPAY_MODE === 'mock' && env.NODE_ENV !== 'production') {
  const simulate = z.object({ orderId: z.string().min(5).max(60), resultCode: z.number().int().default(0), amount: z.number().int().positive().optional() });
  paymentsRouter.post('/sepay/dev-simulate', validate({ body: simulate }), async (req, res) => {
    const b = req.valid.body as z.infer<typeof simulate>;
    const p = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE txn_ref = $1 AND method = 'SEPAY'", [b.orderId])).rows[0];
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không có giao dịch SePay với orderId này');
    const ipn = buildSepayIpn({ invoice: p.gateway.orderId, amount: b.amount ?? p.amountVnd, success: b.resultCode === 0, transactionId: `mock-${Date.now()}` });
    res.json({ sent: true, reply: await handleSepayIpn(undefined, ipn, String(req.id)) });
  });
}
