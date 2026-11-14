import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env';
import { db } from '../../../database/pg';
import type { PaymentDoc } from '../../../database/types';
import { buildMomoIpn } from '../../../lib/momo';
import { buildVnpayIpn } from '../../../lib/vnpay';
import { AppError } from '../../../lib/errors';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { lookupBody, type LookupBody } from '@airrest/validation';
import { lookupBooking } from '../../../services/bookings/bookings.service';
import { ensurePaymentLink, handleMomoIpn, handleVnpayIpn } from '../../../services/payments/payments.service';

// Công khai (không đăng nhập): MoMo gọi IPN; khách lấy/làm mới link bằng mã đơn + SĐT.
export const paymentsRouter = Router();

// VNPay gọi GET kèm query; phản hồi JSON {RspCode, Message}. Chữ ký là cơ chế xác thực duy nhất -> không rate limit riêng.
paymentsRouter.get('/vnpay/ipn', async (req, res) => {
  res.json(await handleVnpayIpn(req.query, String(req.id)));
});

// MoMo gọi POST JSON; chữ ký trong body là cơ chế xác thực duy nhất -> không rate limit riêng. 204 = đã nhận, 400 = sai chữ ký.
paymentsRouter.post('/momo/ipn', async (req, res) => {
  res.sendStatus(await handleMomoIpn(req.body ?? {}, String(req.id)));
});

// Cổng đang bật cho FE (AT_HOTEL luôn có). Không lộ khóa/partnerCode.
paymentsRouter.get('/methods', (_req, res) => {
  res.json({
    methods: [
      { id: 'AT_HOTEL', label: 'Thanh toán tại khách sạn' },
      ...(env.VNPAY_ENABLED ? [{ id: 'VNPAY', label: 'VNPay', mode: env.VNPAY_MODE }] : []),
      ...(env.MOMO_ENABLED ? [{ id: 'MOMO', label: 'MoMo', mode: env.MOMO_MODE }] : []),
    ],
  });
});

// Khách lấy lại link (cổng theo đơn) khi lần tạo đầu lỗi hoặc link cũ đã hỏng. Cùng cơ chế xác minh như tra cứu đơn (mã + SĐT).
// /vnpay/link và /momo/link giữ để tương thích, cùng một handler.
paymentsRouter.post(['/link', '/vnpay/link', '/momo/link'], strictRateLimit, validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ paymentLink: await ensurePaymentLink(booking.id) });
});

// Chỉ môi trường mock + không production: giả lập VNPay gọi IPN (đi qua ĐÚNG đường xử lý và kiểm chữ ký như thật).
// resultCode: 0 = thanh toán thành công, khác 0 = thất bại.
if (env.VNPAY_MODE === 'mock' && env.NODE_ENV !== 'production') {
  const simulate = z.object({ orderId: z.string().min(5).max(60), resultCode: z.number().int().default(0), amount: z.number().int().positive().optional() });
  paymentsRouter.post('/vnpay/dev-simulate', validate({ body: simulate }), async (req, res) => {
    const b = req.valid.body as z.infer<typeof simulate>;
    const p = (await db.query<PaymentDoc>('SELECT * FROM payments WHERE txn_ref = $1', [b.orderId])).rows[0];
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không có giao dịch với orderId này');
    const ipn = buildVnpayIpn({ txnRef: p.gateway.orderId, amount: b.amount ?? p.amountVnd, transId: Date.now(), success: b.resultCode === 0 });
    res.json({ sent: true, reply: await handleVnpayIpn(ipn, String(req.id)) });
  });
}

// Như trên cho MoMo: dựng đúng gói IPN có chữ ký rồi đi qua handleMomoIpn.
if (env.MOMO_MODE === 'mock' && env.NODE_ENV !== 'production') {
  const simulate = z.object({ orderId: z.string().min(5).max(60), resultCode: z.number().int().default(0), amount: z.number().int().positive().optional() });
  paymentsRouter.post('/momo/dev-simulate', validate({ body: simulate }), async (req, res) => {
    const b = req.valid.body as z.infer<typeof simulate>;
    const p = (await db.query<PaymentDoc>("SELECT * FROM payments WHERE txn_ref = $1 AND method = 'MOMO'", [b.orderId])).rows[0];
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không có giao dịch MoMo với orderId này');
    const ipn = buildMomoIpn({ orderId: p.gateway.orderId, requestId: p.gateway.requestId, amount: b.amount ?? p.amountVnd, transId: Date.now(), resultCode: b.resultCode });
    res.json({ sent: true, reply: { httpStatus: await handleMomoIpn(ipn, String(req.id)) } });
  });
}
