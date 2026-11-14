import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { payerScope } from '../../../services/delay/queries';
import * as svc from '../../../services/settlement/statements';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';

// Nhân viên đơn vị chi trả xem bảng kê CỦA ĐƠN VỊ MÌNH (không thấy bản nháp) và gửi khiếu nại. Mount: v1Router.use('/payer/statements', payerStatementsRouter) TRƯỚC '/payer'.
// Quyền payer:delay:read; đơn vị khác -> 404.
export const payerStatementsRouter = Router();
const base = [authenticate, requirePermission(PERM.PAYER_DELAY_READ)];
const A = (req: { auth?: unknown }) => req.auth as AuthContext;
const idOf = (req: { valid: { params?: unknown } }) => (req.valid.params as { id: string }).id;
const listQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), limit: limitQuery, after: seqCursor.optional() });

payerStatementsRouter.get('/', ...base, validate({ query: listQuery }), async (req, res) => {
  res.json(await svc.listStatements({ ...(req.valid.query as z.infer<typeof listQuery>), payerId: payerScope(A(req)).payerId, excludeDraft: true }));
});
payerStatementsRouter.get('/:id', ...base, validate({ params: idParams }), async (req, res) => {
  res.json(await svc.getStatement(idOf(req), payerScope(A(req)).payerId));
});
payerStatementsRouter.get('/:id/csv', ...base, validate({ params: idParams }), async (req, res) => {
  const f = await svc.statementCsv(idOf(req), payerScope(A(req)).payerId);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${f.filename}"` }).send(f.csv);
});
payerStatementsRouter.post('/:id/dispute', ...base, validate({ params: idParams, body: z.object({ reason: z.string().trim().min(5).max(1000) }).strict() }), idempotent('payer-statement-dispute'), async (req, res) => {
  const a = A(req);
  res.json({ statement: await svc.disputeStatement({ auth: a, requestId: String(req.id) }, payerScope(a).payerId, idOf(req), (req.valid.body as { reason: string }).reason) });
});
