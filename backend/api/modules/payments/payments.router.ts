import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env';
import { db } from '../../../database/pg';
import type { PaymentDoc } from '../../../database/types';
import { buildMomoIpn } from '../../../lib/momo';
import { AppError } from '../../../lib/errors';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { lookupBody, type LookupBody } from '@airrest/validation';
import { lookupBooking } from '../../../services/bookings/bookings.service';
import { ensureMomoLink, handleMomoIpn } from '../../../services/payments/payments.service';

// Công khai (không đăng nhập): MoMo gọi IPN; khách lấy/làm mới link bằng mã đơn + SĐT.
export const paymentsRouter = Router();

// MoMo yêu cầu phản hồi HTTP 204 khi đã nhận IPN. Chữ ký là cơ chế xác thực duy nhất -> không rate limit riêng.
paymentsRouter.post('/momo/ipn', async (req, res) => {
  await handleMomoIpn(req.body as Record<string, unknown>, String(req.id));
  res.status(204).end();
});

// Khách lấy lại link khi lần tạo đầu lỗi hoặc link cũ đã hỏng. Cùng cơ chế xác minh như tra cứu đơn (mã + SĐT).
paymentsRouter.post('/momo/link', strictRateLimit, validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ paymentLink: await ensureMomoLink(booking.id) });
});

// Chỉ môi trường mock + không production: giả lập MoMo gọi IPN (đi qua ĐÚNG đường xử lý và kiểm chữ ký như thật).
if (env.MOMO_MODE === 'mock' && env.NODE_ENV !== 'production') {
  const simulate = z.object({ orderId: z.string().min(5).max(60), resultCode: z.number().int().default(0), amount: z.number().int().positive().optional() });
  paymentsRouter.post('/momo/dev-simulate', validate({ body: simulate }), async (req, res) => {
    const b = req.valid.body as z.infer<typeof simulate>;
    const p = (await db.query<PaymentDoc>('SELECT * FROM payments WHERE momo_order_id = $1', [b.orderId])).rows[0];
    if (!p) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không có giao dịch với orderId này');
    const ipn = buildMomoIpn({ orderId: p.momo.orderId, requestId: p.momo.requestId, amount: b.amount ?? p.amountVnd, transId: Date.now(), resultCode: b.resultCode });
    await handleMomoIpn(ipn, String(req.id));
    res.json({ sent: true });
  });
}
