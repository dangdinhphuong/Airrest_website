import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, type AdminRoleKey } from '../../../config/roles';
import { PERM } from '../../../config/permissions';
import { db, withTransaction, type Db } from '../../../database/pg';
import type { AccountDoc, RoleDoc } from '../../../database/types';
import { actorOf, writeAudit } from '../../../services/audit';
import { AppError, isDuplicateKey } from '../../../lib/errors';
import { forgetAuth } from '../../../services/authz';
import { hashPassword } from '../../../lib/password';
import { escapeLike, idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-13: tài khoản + vai trò Admin (OPS / SUPPORT / FINANCE / SYSADMIN). Mọi route cần quyền admin:account:manage.
export const accountsRouter = Router();
const need = requirePermission(PERM.ADMIN_ACCOUNT_MANAGE);

const roleKey = z.enum(Object.keys(ADMIN_ROLES) as [AdminRoleKey, ...AdminRoleKey[]]);
const password = z.string().min(12).max(128);

const createBody = z.object({
  email: z.string().email().max(200),
  fullName: z.string().trim().min(2).max(100),
  adminRole: roleKey,
  password,
});
const patchBody = z
  .object({ fullName: z.string().trim().min(2).max(100), adminRole: roleKey, status: z.enum(['ACTIVE', 'LOCKED']) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const listQuery = z.object({
  status: z.enum(['ACTIVE', 'LOCKED', 'INVITED']).optional(),
  adminRole: roleKey.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: limitQuery,
  after: seqCursor.optional(),
});

// Không bao giờ trả passwordHash.
const pub = (a: AccountDoc) => ({
  id: a.id,
  seq: a.seq,
  email: a.email,
  fullName: a.fullName,
  type: a.type,
  adminRole: a.adminRole,
  status: a.status,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const systemRole = async (key: string, tx: Db = db) => (await tx.query<RoleDoc>("SELECT * FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL", [key])).rows[0];

accountsRouter.get('/roles', need, async (_req, res) => {
  const roles = (await db.query<RoleDoc>("SELECT * FROM roles WHERE scope = 'SYSTEM' AND key = ANY($1::text[])", [Object.keys(ADMIN_ROLES)])).rows;
  res.json({ items: roles.map((r) => ({ key: r.key, name: r.name, permissions: r.permissions })) });
});

accountsRouter.get('/accounts', need, validate({ query: listQuery }), async (req, res) => {
  const { status, adminRole, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const where = ["type = 'ADMIN'"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('status = ?', status);
  if (adminRole) add('admin_role = ?', adminRole);
  if (q) {
    const n = params.push(escapeLike(q));
    where.push(`(email ILIKE '%' || $${n} || '%' OR full_name ILIKE '%' || $${n} || '%')`);
  }
  if (after !== undefined) add('seq > ?', after);
  const items = (await db.query<AccountDoc>(`SELECT * FROM accounts WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ${limit + 1}`, params)).rows;
  const page = items.slice(0, limit);
  res.json({ items: page.map(pub), nextCursor: items.length > limit ? page[page.length - 1]?.seq : null });
});

accountsRouter.post('/accounts', need, validate({ body: createBody }), async (req, res) => {
  const body = req.valid.body as z.infer<typeof createBody>;
  const role = await systemRole(body.adminRole);
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', `Chưa có vai trò hệ thống ${body.adminRole} (chạy npm run db:seed)`);
  const passwordHash = await hashPassword(body.password);
  let doc: AccountDoc;
  try {
    doc = await withTransaction(async (tx) => {
      const created = (
        await tx.query<AccountDoc>(
          `INSERT INTO accounts (type, email, password_hash, full_name, status, admin_role, role_ids, created_by)
           VALUES ('ADMIN', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], $6) RETURNING *`,
          [body.email.toLowerCase(), passwordHash, body.fullName, body.adminRole, [role.id], req.auth!.sub],
        )
      ).rows[0]!;
      await writeAudit(
        { actor: actorOf(req.auth), action: 'ACCOUNT.CREATE', entity: { type: 'account', id: created.id }, after: { email: created.email, adminRole: created.adminRole }, requestId: String(req.id) },
        tx,
      );
      return created;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được dùng');
    throw e;
  }
  res.status(201).json({ account: pub(doc) });
});

accountsRouter.patch('/accounts/:id', need, validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchBody>;
  const isSelf = req.auth!.sub === id;

  const updated = await withTransaction(async (tx) => {
    const before = (await tx.query<AccountDoc>("SELECT * FROM accounts WHERE id = $1 AND type = 'ADMIN' FOR UPDATE", [id])).rows[0];
    if (!before) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');

    const losesSysadmin =
      before.adminRole === 'SYSADMIN' &&
      before.status === 'ACTIVE' &&
      (patch.status === 'LOCKED' || (patch.adminRole !== undefined && patch.adminRole !== 'SYSADMIN'));
    // Tự khóa/tự hạ quyền dễ khiến hệ thống mất người quản trị; luôn phải còn ít nhất 1 SYSADMIN hoạt động.
    if (isSelf && (patch.status === 'LOCKED' || (patch.adminRole && patch.adminRole !== before.adminRole))) {
      throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể tự khóa hoặc tự đổi vai trò của mình');
    }
    if (losesSysadmin) {
      const others = (await tx.query<{ n: number }>("SELECT count(*) AS n FROM accounts WHERE type = 'ADMIN' AND admin_role = 'SYSADMIN' AND status = 'ACTIVE' AND id <> $1", [id])).rows[0]!.n;
      if (others === 0) throw new AppError(409, 'LAST_SYSADMIN', 'Phải còn ít nhất một Quản trị hệ thống đang hoạt động');
    }

    const role = patch.adminRole ? await systemRole(patch.adminRole, tx) : undefined;
    if (patch.adminRole && !role) throw new AppError(500, 'ROLE_NOT_SEEDED', `Chưa có vai trò hệ thống ${patch.adminRole}`);
    const next = (
      await tx.query<AccountDoc>(
        `UPDATE accounts SET full_name = COALESCE($2, full_name), admin_role = COALESCE($3, admin_role), status = COALESCE($4, status),
           role_ids = COALESCE($5::uuid[], role_ids), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, patch.fullName ?? null, patch.adminRole ?? null, patch.status ?? null, role ? [role.id] : null],
      )
    ).rows[0]!;
    await writeAudit(
      {
        actor: actorOf(req.auth),
        action: 'ACCOUNT.UPDATE',
        entity: { type: 'account', id },
        before: { fullName: before.fullName, adminRole: before.adminRole, status: before.status },
        after: patch,
        requestId: String(req.id),
      },
      tx,
    );
    return next;
  });
  forgetAuth(id); // khóa / đổi vai trò có hiệu lực ngay trên bản API này
  res.json({ account: pub(updated) });
});

const resetBody = z.object({ password });
accountsRouter.post('/accounts/:id/reset-password', need, validate({ params: idParams, body: resetBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { password: pw } = req.valid.body as z.infer<typeof resetBody>;
  const passwordHash = await hashPassword(pw);
  await withTransaction(async (tx) => {
    const r = await tx.query("UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1 AND type = 'ADMIN'", [id, passwordHash]);
    if (r.rowCount === 0) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: actorOf(req.auth), action: 'ACCOUNT.RESET_PASSWORD', entity: { type: 'account', id }, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});
