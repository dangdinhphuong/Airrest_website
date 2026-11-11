import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { db } from '../../../database/pg';
import { limitQuery, seqCursor, uuid } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-09: tra cứu nhật ký. Chỉ đọc — không có API sửa/xóa nhật ký.
export const auditRouter = Router();

const auditQuery = z
  .object({
    entityType: z.string().min(1).max(50).optional(),
    entityId: z.string().min(1).max(50).optional(),
    actorId: z.string().min(1).max(50).optional(),
    action: z.string().min(1).max(80).optional(),
    hotelId: uuid.optional(),
    bookingId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: limitQuery,
    cursor: seqCursor.optional(), // id của dòng cuối trang trước (tăng dần theo thời điểm ghi)
  })
  .refine((q) => !q.entityId || q.entityType, { message: 'entityId cần đi kèm entityType', path: ['entityType'] });

auditRouter.get('/audit-logs', requirePermission(PERM.AUDIT_READ), validate({ query: auditQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof auditQuery>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (q.entityType) add('entity_type = ?', q.entityType);
  if (q.entityId) add('entity_id = ?', q.entityId);
  if (q.actorId) add("actor->>'id' = ?", q.actorId);
  if (q.action) add('action = ?', q.action);
  if (q.hotelId) add('hotel_id = ?', q.hotelId);
  if (q.bookingId) add('booking_id = ?', q.bookingId);
  if (q.from) add('ts >= ?', q.from);
  if (q.to) add('ts < ?', q.to);
  if (q.cursor !== undefined) add('id < ?', q.cursor);

  const rows = (
    await db.query<{ id: number; entityType: string; entityId: string }>(
      `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${q.limit + 1}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, q.limit).map(({ entityType, entityId, ...r }) => ({ ...r, entity: { type: entityType, id: entityId } }));
  res.json({ items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null });
});
