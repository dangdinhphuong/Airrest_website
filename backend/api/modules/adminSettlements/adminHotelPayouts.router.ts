import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor, uuid } from '../../../lib/zod';
import { MAX_ADJUSTMENT_VND } from '../../../services/settlement/calc';
import * as svc from '../../../services/settlement/payouts';
import type { Ctx } from '../../../services/settlement/statements';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';

// Bảng chi trả khách sạn theo tháng. Mount: v1Router.use('/admin/hotel-payouts', adminHotelPayoutsRouter) TRƯỚC '/admin'.
// Đọc: admin:payment:read · tạo/điều chỉnh: admin:payer:manage · khóa/ghi nhận đã trả: admin:payment:manage. POST đều cần Idempotency-Key.
export const adminHotelPayoutsRouter = Router();
const read = [authenticate, requirePermission(PERM.ADMIN_PAYMENT_READ)];
const manage = [authenticate, requirePermission(PERM.ADMIN_PAYER_MANAGE)];
const finance = [authenticate, requirePermission(PERM.ADMIN_PAYMENT_MANAGE)];
const ctx = (req: { auth?: unknown; id?: unknown }): Ctx => ({ auth: req.auth as AuthContext, requestId: String(req.id) });
const idOf = (req: { valid: { params?: unknown } }) => (req.valid.params as { id: string }).id;

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Kỳ phải có dạng 'YYYY-MM'");
const listQuery = z.object({ hotelId: uuid.optional(), period: period.optional(), status: z.enum(['DRAFT', 'LOCKED', 'PAID']).optional(), limit: limitQuery, after: seqCursor.optional() });
const adjustBody = z.object({ hotelId: uuid, period, amountVnd: z.number().int().refine((n) => n !== 0, 'Số tiền phải khác 0').refine((n) => Math.abs(n) <= MAX_ADJUSTMENT_VND, `Tối đa ${MAX_ADJUSTMENT_VND} VND mỗi lần`), memo: z.string().trim().min(3).max(300), bookingId: uuid.optional() }).strict();

adminHotelPayoutsRouter.get('/', ...read, validate({ query: listQuery }), async (req, res) => {
  res.json(await svc.listHotelPayouts(req.valid.query as z.infer<typeof listQuery>));
});
adminHotelPayoutsRouter.post('/generate', ...manage, validate({ body: z.object({ period }).strict() }), idempotent('payout-generate'), async (req, res) => {
  res.json(await svc.generateHotelPayouts(ctx(req), (req.valid.body as { period: string }).period));
});
adminHotelPayoutsRouter.post('/adjustments', ...manage, validate({ body: adjustBody }), idempotent('payout-adjust'), async (req, res) => {
  res.status(201).json({ payout: await svc.addHotelAdjustment(ctx(req), req.valid.body as z.infer<typeof adjustBody>) });
});
adminHotelPayoutsRouter.get('/:id', ...read, validate({ params: idParams }), async (req, res) => {
  res.json(await svc.getHotelPayout(idOf(req)));
});
adminHotelPayoutsRouter.post('/:id/lock', ...finance, validate({ params: idParams }), idempotent('payout-lock'), async (req, res) => {
  res.json({ payout: await svc.lockHotelPayout(ctx(req), idOf(req)) });
});
adminHotelPayoutsRouter.post('/:id/paid', ...finance, validate({ params: idParams, body: z.object({ paymentRef: z.string().trim().min(3).max(200) }).strict() }), idempotent('payout-paid'), async (req, res) => {
  res.json({ payout: await svc.markPaid(ctx(req), idOf(req), (req.valid.body as { paymentRef: string }).paymentRef) });
});
