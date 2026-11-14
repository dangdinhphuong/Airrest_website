import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor, uuid } from '../../../lib/zod';
import * as svc from '../../../services/settlement/statements';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';

// Bảng kê tháng (đơn vị chi trả). Mount: v1Router.use('/admin/payer-statements', adminPayerStatementsRouter) TRƯỚC '/admin'.
// Đọc: admin:payer:read · tạo/gửi/điều chỉnh: admin:payer:manage · khóa/mở lại: admin:payment:manage (vai trò tài chính). POST đều cần Idempotency-Key.
export const adminPayerStatementsRouter = Router();
const read = [authenticate, requirePermission(PERM.ADMIN_PAYER_READ)];
const manage = [authenticate, requirePermission(PERM.ADMIN_PAYER_MANAGE)];
const finance = [authenticate, requirePermission(PERM.ADMIN_PAYMENT_MANAGE)];
const ctx = (req: { auth?: unknown; id?: unknown }): svc.Ctx => ({ auth: req.auth as AuthContext, requestId: String(req.id) });
const idOf = (req: { valid: { params?: unknown } }) => (req.valid.params as { id: string }).id;

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Kỳ phải có dạng 'YYYY-MM'");
const listQuery = z.object({ payerId: uuid.optional(), period: period.optional(), status: z.enum(['DRAFT', 'SENT', 'DISPUTED', 'LOCKED']).optional(), limit: limitQuery, after: seqCursor.optional() });
const generateBody = z.object({ payerId: uuid, period }).strict();
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const adjustBody = z.object({ payerId: uuid, period, amountVnd: z.number().int().refine((n) => n !== 0, 'Số tiền phải khác 0'), memo: z.string().trim().min(3).max(300), hotelId: uuid.optional(), bookingId: uuid.optional() }).strict();

adminPayerStatementsRouter.get('/', ...read, validate({ query: listQuery }), async (req, res) => {
  res.json(await svc.listStatements(req.valid.query as z.infer<typeof listQuery>));
});
adminPayerStatementsRouter.post('/generate', ...manage, validate({ body: generateBody }), idempotent('statement-generate'), async (req, res) => {
  const b = req.valid.body as z.infer<typeof generateBody>;
  res.json(await svc.generateStatement(ctx(req), b.payerId, b.period));
});
adminPayerStatementsRouter.post('/adjustments', ...manage, validate({ body: adjustBody }), idempotent('statement-adjust'), async (req, res) => {
  res.status(201).json({ statement: await svc.addPayerAdjustment(ctx(req), req.valid.body as z.infer<typeof adjustBody>) });
});
adminPayerStatementsRouter.get('/:id', ...read, validate({ params: idParams }), async (req, res) => {
  res.json(await svc.getStatement(idOf(req)));
});
adminPayerStatementsRouter.get('/:id/csv', ...read, validate({ params: idParams }), async (req, res) => {
  const f = await svc.statementCsv(idOf(req));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${f.filename}"` }).send(f.csv);
});
adminPayerStatementsRouter.post('/:id/send', ...manage, validate({ params: idParams }), idempotent('statement-send'), async (req, res) => {
  res.json({ statement: await svc.sendStatement(ctx(req), idOf(req)) });
});
adminPayerStatementsRouter.post('/:id/lock', ...finance, validate({ params: idParams }), idempotent('statement-lock'), async (req, res) => {
  res.json({ statement: await svc.lockStatement(ctx(req), idOf(req)) });
});
adminPayerStatementsRouter.post('/:id/reopen', ...finance, validate({ params: idParams, body: reasonBody }), idempotent('statement-reopen'), async (req, res) => {
  res.json({ statement: await svc.reopenStatement(ctx(req), idOf(req), (req.valid.body as { reason: string }).reason) });
});
