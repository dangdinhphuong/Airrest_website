import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { db } from '../../../database/pg';
import { actorOf } from '../../../services/audit';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor, uuid } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { reconcilePayments, retryRefund } from '../../../services/payments/payments.service';

// Admin: xem giao dịch MoMo / lệnh hoàn, đối soát gọi tay, thử lại hoàn. Quyền kiểm ở từng route.
export const adminPaymentsRouter = Router();

const listQuery = z.object({
  status: z.string().max(30).optional(),
  bookingId: uuid.optional(),
  anomaly: z.enum(['true']).optional(), // chỉ giao dịch bất thường
  limit: limitQuery,
  cursor: seqCursor.optional(),
});
type ListQuery = z.infer<typeof listQuery>;

async function list(table: 'payments' | 'refunds', q: ListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (q.status) add('status = ?', q.status);
  if (q.bookingId) add('booking_id = ?', q.bookingId);
  if (q.anomaly && table === 'payments') where.push('anomaly IS NOT NULL');
  if (q.cursor !== undefined) add('seq < ?', q.cursor);
  const rows = (await db.query<{ seq: number }>(`SELECT * FROM ${table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

adminPaymentsRouter.get('/payments', requirePermission(PERM.ADMIN_PAYMENT_READ), validate({ query: listQuery }), async (req, res) => {
  res.json(await list('payments', req.valid.query as ListQuery));
});

adminPaymentsRouter.get('/refunds', requirePermission(PERM.ADMIN_PAYMENT_READ), validate({ query: listQuery }), async (req, res) => {
  res.json(await list('refunds', req.valid.query as ListQuery));
});

adminPaymentsRouter.post('/payments/reconcile', requirePermission(PERM.ADMIN_PAYMENT_MANAGE), async (req, res) => {
  res.json(await reconcilePayments(actorOf(req.auth as AuthContext), String(req.id)));
});

adminPaymentsRouter.post('/refunds/:id/retry', requirePermission(PERM.ADMIN_PAYMENT_MANAGE), validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ refund: await retryRefund(id, actorOf(req.auth as AuthContext), String(req.id)) });
});
