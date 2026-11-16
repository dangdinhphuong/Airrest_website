import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { db, withTransaction } from '../../../database/pg';
import type { BusinessDoc } from '../../../database/types';
import { actorOf, writeAudit } from '../../../services/audit';
import { AppError } from '../../../lib/errors';
import { escapeLike, idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Duyệt hồ sơ doanh nghiệp đăng ký công khai. Quyền: xem = admin:hotel:read, duyệt/từ chối = admin:hotel:manage (cùng nhóm duyệt khách sạn).
export const adminBusinessesRouter = Router();
const read = requirePermission(PERM.ADMIN_HOTEL_READ);
const manage = requirePermission(PERM.ADMIN_HOTEL_MANAGE);

const listQuery = z.object({
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: limitQuery,
  after: seqCursor.optional(),
});
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

adminBusinessesRouter.get('/businesses', read, validate({ query: listQuery }), async (req, res) => {
  const { status, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) where.push(`b.status = $${params.push(status)}`);
  if (q) {
    const n = params.push(escapeLike(q));
    where.push(`(b.name ILIKE '%' || $${n} || '%' OR b.tax_code ILIKE '%' || $${n} || '%' OR b.email ILIKE '%' || $${n} || '%')`);
  }
  if (after !== undefined) where.push(`b.seq < $${params.push(after)}`);
  const rows = (
    await db.query<BusinessDoc & { hotelCount: number }>(
      `SELECT b.*, (SELECT count(*) FROM hotels h WHERE h.business_id = b.id) AS hotel_count FROM businesses b ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.seq DESC LIMIT ${limit + 1}`,
      params,
    )
  ).rows;
  const page = rows.slice(0, limit);
  res.json({ items: page.map((b) => ({ ...b, hotelCount: b.hotelCount ?? 0 })), nextCursor: rows.length > limit ? page[page.length - 1]?.seq : null });
});

adminBusinessesRouter.get('/businesses/:id', read, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const business = (await db.query<BusinessDoc>('SELECT * FROM businesses WHERE id = $1', [id])).rows[0];
  if (!business) throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Không tìm thấy doanh nghiệp');
  const hotels = (await db.query('SELECT id, code, name, status, created_at FROM hotels WHERE business_id = $1 ORDER BY seq', [id])).rows;
  const owner = (await db.query('SELECT id, email, full_name, phone, status FROM accounts WHERE business_id = $1 AND is_owner ORDER BY seq LIMIT 1', [id])).rows[0];
  res.json({ business, owner, hotels });
});

// Cập nhật có điều kiện theo trạng thái hiện tại: hai admin bấm cùng lúc chỉ một bên thành công.
async function decide(req: Request, to: 'ACTIVE' | 'REJECTED', reason?: string) {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await withTransaction(async (tx) => {
    const b = (await tx.query<{ status: string }>('SELECT status FROM businesses WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!b) throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Không tìm thấy doanh nghiệp');
    if (b.status !== 'PENDING_APPROVAL') throw new AppError(409, 'INVALID_STATE', 'Chỉ duyệt/từ chối được hồ sơ đang chờ duyệt');
    const now = new Date();
    if (to === 'ACTIVE') {
      await tx.query("UPDATE businesses SET status = 'ACTIVE', approved_at = $2, approved_by = $3, updated_at = $2 WHERE id = $1", [id, now, req.auth!.sub]);
      await tx.query("UPDATE accounts SET status = 'ACTIVE', updated_at = $2 WHERE business_id = $1 AND is_owner AND status = 'INVITED'", [id, now]);
    } else {
      await tx.query("UPDATE businesses SET status = 'REJECTED', reject_reason = $2, rejected_at = $3, rejected_by = $4, updated_at = $3 WHERE id = $1", [id, reason, now, req.auth!.sub]);
    }
    await writeAudit({ actor: actorOf(req.auth), action: to === 'ACTIVE' ? 'BUSINESS.APPROVE' : 'BUSINESS.REJECT', entity: { type: 'business', id }, before: { status: b.status }, after: { status: to }, ...(reason && { reasonNote: reason }), requestId: String(req.id) }, tx);
  });
  return (await db.query<BusinessDoc>('SELECT * FROM businesses WHERE id = $1', [id])).rows[0];
}

adminBusinessesRouter.post('/businesses/:id/approve', manage, validate({ params: idParams }), async (req, res) => {
  res.json({ business: await decide(req, 'ACTIVE') });
});
adminBusinessesRouter.post('/businesses/:id/reject', manage, validate({ params: idParams, body: reasonBody }), async (req, res) => {
  res.json({ business: await decide(req, 'REJECTED', (req.valid.body as z.infer<typeof reasonBody>).reason) });
});
