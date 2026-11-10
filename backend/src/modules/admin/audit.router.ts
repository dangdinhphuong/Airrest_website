import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../config/permissions';
import { col } from '../../db/collections';
import type { AuditLogDoc } from '../../db/types';
import { AppError } from '../../lib/errors';
import { limitQuery, oid } from '../../lib/zod';
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
    hotelId: oid.optional(),
    bookingId: oid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: limitQuery,
    cursor: z.string().max(100).optional(),
  })
  .refine((q) => !q.entityId || q.entityType, { message: 'entityId cần đi kèm entityType', path: ['entityType'] });

// Con trỏ keyset (ts, _id) -> trang sau ổn định kể cả khi có bản ghi mới chen vào.
const encode = (d: AuditLogDoc) => Buffer.from(`${d.ts.getTime()}_${d._id.toHexString()}`).toString('base64url');
const decode = (c: string): { ts: Date; id: ObjectId } => {
  const [t, id] = Buffer.from(c, 'base64url').toString().split('_');
  if (!t || !id || !/^\d+$/.test(t) || !/^[a-f\d]{24}$/i.test(id)) throw new AppError(422, 'INVALID_CURSOR', 'Con trỏ phân trang không hợp lệ');
  return { ts: new Date(Number(t)), id: new ObjectId(id) };
};

auditRouter.get('/audit-logs', requirePermission(PERM.AUDIT_READ), validate({ query: auditQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof auditQuery>;
  const and: object[] = [];
  if (q.entityType) and.push({ 'entity.type': q.entityType });
  if (q.entityId) and.push({ 'entity.id': q.entityId });
  if (q.actorId) and.push({ 'actor.id': q.actorId });
  if (q.action) and.push({ action: q.action });
  if (q.hotelId) and.push({ hotelId: new ObjectId(q.hotelId) });
  if (q.bookingId) and.push({ bookingId: new ObjectId(q.bookingId) });
  if (q.from) and.push({ ts: { $gte: q.from } });
  if (q.to) and.push({ ts: { $lt: q.to } });
  if (q.cursor) {
    const c = decode(q.cursor);
    and.push({ $or: [{ ts: { $lt: c.ts } }, { ts: c.ts, _id: { $lt: c.id } }] });
  }

  const rows = await col
    .auditLogs()
    .find(and.length ? { $and: and } : {})
    .sort({ ts: -1, _id: -1 })
    .limit(q.limit + 1)
    .toArray();
  const items = rows.slice(0, q.limit);
  res.json({ items, nextCursor: rows.length > q.limit ? encode(items[items.length - 1]!) : null });
});
