import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, type AdminRoleKey } from '../../../config/roles';
import { PERM } from '../../../config/permissions';
import { db, withTransaction, type Db } from '../../../database/pg';
import type { AccountDoc, RoleDoc } from '../../../database/types';
import { actorOf, writeAudit } from '../../../services/audit';
import { AppError, isDuplicateKey } from '../../../lib/errors';
import { forgetAuth } from '../../../services/authz';
import { assertCanGrant, isAdminAssignable, isSystemAdminKey } from '../../../services/adminRoles';
import { hashPassword } from '../../../lib/password';
import { escapeLike, idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-13: tài khoản Admin, gán vai trò hệ thống (OPS / SUPPORT / FINANCE / SYSADMIN) hoặc vai trò tùy chỉnh (roleId). Mọi route cần quyền admin:account:manage.
// Vai trò & quyền: roles.router.ts. Tài khoản khách (PASSENGER) không bao giờ xuất hiện ở đây (mọi truy vấn lọc type = 'ADMIN').
export const accountsRouter = Router();
const need = requirePermission(PERM.ADMIN_ACCOUNT_MANAGE);

const roleKey = z.enum(Object.keys(ADMIN_ROLES) as [AdminRoleKey, ...AdminRoleKey[]]);
const password = z.string().min(12).max(128);

const createBody = z.object({
  email: z.string().email().max(200),
  fullName: z.string().trim().min(2).max(100),
  adminRole: roleKey.optional(),
  roleId: z.string().uuid().optional(),
  password,
}).refine((b) => (b.adminRole === undefined) !== (b.roleId === undefined), 'Chọn đúng một trong adminRole hoặc roleId');
const patchBody = z
  .object({ fullName: z.string().trim().min(2).max(100), adminRole: roleKey, roleId: z.string().uuid(), status: z.enum(['ACTIVE', 'LOCKED']) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật')
  .refine((b) => b.adminRole === undefined || b.roleId === undefined, 'Chỉ gửi một trong adminRole hoặc roleId');
const listQuery = z.object({
  status: z.enum(['ACTIVE', 'LOCKED', 'INVITED']).optional(),
  adminRole: roleKey.optional(),
  roleId: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: limitQuery,
  after: seqCursor.optional(),
});

// Không bao giờ trả passwordHash.
type AdminRow = AccountDoc & { roleId?: string; roleName?: string };
const pub = (a: AdminRow) => ({
  id: a.id,
  seq: a.seq,
  email: a.email,
  fullName: a.fullName,
  type: a.type,
  adminRole: a.adminRole ?? null, // null khi dùng vai trò tùy chỉnh
  roleId: a.roleId ?? null,
  roleName: a.roleName ?? null,
  status: a.status,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const ADMIN_SELECT = 'SELECT a.*, r.id AS role_id, r.name AS role_name FROM accounts a LEFT JOIN roles r ON r.id = a.role_ids[1]';
const loadAdmin = async (id: string, tx: Db = db) => (await tx.query<AdminRow>(`${ADMIN_SELECT} WHERE a.id = $1 AND a.type = 'ADMIN'`, [id])).rows[0];

// Tìm vai trò gán cho tài khoản Admin: theo roleId (hệ thống hoặc tùy chỉnh) hoặc theo khóa 4 vai trò cũ. Khóa FOR SHARE để vai trò không bị xóa giữa chừng.
async function pickRole(tx: Db, by: { adminRole?: string; roleId?: string }): Promise<RoleDoc> {
  const role = (
    await tx.query<RoleDoc>(
      by.roleId ? 'SELECT * FROM roles WHERE id = $1 FOR SHARE' : "SELECT * FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL FOR SHARE",
      [by.roleId ?? by.adminRole],
    )
  ).rows[0];
  if (!role) {
    if (by.roleId) throw new AppError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
    throw new AppError(500, 'ROLE_NOT_SEEDED', `Chưa có vai trò hệ thống ${by.adminRole} (chạy npm run db:seed)`);
  }
  if (!isAdminAssignable(role)) throw new AppError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
  return role;
}
// Chống leo thang qua tài khoản khác: không được sửa/khóa/đặt lại mật khẩu tài khoản có quyền cao hơn mình (đăng nhập bằng mật khẩu mới là chiếm quyền đó).
async function assertCoversTarget(tx: Db, auth: NonNullable<Express.Request['auth']>, targetId: string): Promise<void> {
  const perms = (await tx.query<{ permissions: string[] }>('SELECT r.permissions FROM roles r JOIN accounts a ON r.id = ANY(a.role_ids) WHERE a.id = $1', [targetId])).rows.flatMap((r) => r.permissions);
  assertCanGrant(auth, perms);
}

// admin_role (CHECK 4 giá trị) chỉ ghi cho vai trò hệ thống; vai trò tùy chỉnh -> NULL.
const adminRoleOf = (r: RoleDoc): string | null => (r.system && isSystemAdminKey(r.key) ? r.key : null);

accountsRouter.get('/accounts', need, validate({ query: listQuery }), async (req, res) => {
  const { status, adminRole, roleId, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const where = ["type = 'ADMIN'"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('status = ?', status);
  if (adminRole) add('admin_role = ?', adminRole);
  if (roleId) add('? = ANY(role_ids)', roleId);
  if (q) {
    const n = params.push(escapeLike(q));
    where.push(`(a.email ILIKE '%' || $${n} || '%' OR a.full_name ILIKE '%' || $${n} || '%')`);
  }
  if (after !== undefined) add('seq > ?', after);
  const items = (await db.query<AccountDoc>(`${ADMIN_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.seq LIMIT ${limit + 1}`, params)).rows;
  const page = items.slice(0, limit);
  res.json({ items: page.map(pub), nextCursor: items.length > limit ? page[page.length - 1]?.seq : null });
});

accountsRouter.post('/accounts', need, validate({ body: createBody }), async (req, res) => {
  const body = req.valid.body as z.infer<typeof createBody>;
  const passwordHash = await hashPassword(body.password);
  let doc: AccountDoc;
  try {
    doc = await withTransaction(async (tx) => {
      const role = await pickRole(tx, body);
      assertCanGrant(req.auth!, role.permissions); // không được tạo tài khoản có quyền cao hơn chính mình
      const created = (
        await tx.query<AccountDoc>(
          `INSERT INTO accounts (type, email, password_hash, full_name, status, admin_role, role_ids, created_by)
           VALUES ('ADMIN', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], $6) RETURNING *`,
          [body.email.toLowerCase(), passwordHash, body.fullName, adminRoleOf(role), [role.id], req.auth!.sub],
        )
      ).rows[0]!;
      await writeAudit(
        { actor: actorOf(req.auth), action: 'ACCOUNT.CREATE', entity: { type: 'account', id: created.id }, after: { email: created.email, adminRole: created.adminRole ?? null, roleId: role.id }, requestId: String(req.id) },
        tx,
      );
      return (await loadAdmin(created.id, tx))!;
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

    if (!isSelf) await assertCoversTarget(tx, req.auth!, id);
    const role = patch.adminRole || patch.roleId ? await pickRole(tx, patch) : undefined;
    const roleChanged = !!role && role.id !== before.roleIds?.[0];
    const newAdminRole = role ? adminRoleOf(role) : before.adminRole;
    const losesSysadmin = before.adminRole === 'SYSADMIN' && before.status === 'ACTIVE' && (patch.status === 'LOCKED' || (roleChanged && newAdminRole !== 'SYSADMIN'));
    // Tự khóa/tự hạ quyền dễ khiến hệ thống mất người quản trị; luôn phải còn ít nhất 1 SYSADMIN hoạt động.
    if (isSelf && (patch.status === 'LOCKED' || roleChanged)) {
      throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể tự khóa hoặc tự đổi vai trò của mình');
    }
    if (role) assertCanGrant(req.auth!, role.permissions); // không được gán quyền cao hơn chính mình
    if (losesSysadmin) {
      const others = (await tx.query<{ n: number }>("SELECT count(*) AS n FROM accounts WHERE type = 'ADMIN' AND admin_role = 'SYSADMIN' AND status = 'ACTIVE' AND id <> $1", [id])).rows[0]!.n;
      if (others === 0) throw new AppError(409, 'LAST_SYSADMIN', 'Phải còn ít nhất một Quản trị hệ thống đang hoạt động');
    }

    await tx.query(
      `UPDATE accounts SET full_name = COALESCE($2, full_name), admin_role = CASE WHEN $3::boolean THEN $4 ELSE admin_role END, status = COALESCE($5, status),
         role_ids = COALESCE($6::uuid[], role_ids), updated_at = now() WHERE id = $1`,
      [id, patch.fullName ?? null, !!role, role ? adminRoleOf(role) : null, patch.status ?? null, role ? [role.id] : null],
    );
    const next = (await loadAdmin(id, tx))!;
    await writeAudit(
      {
        actor: actorOf(req.auth),
        action: 'ACCOUNT.UPDATE',
        entity: { type: 'account', id },
        before: { fullName: before.fullName, adminRole: before.adminRole ?? null, roleId: before.roleIds?.[0], status: before.status },
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
    if ((await tx.query("SELECT 1 FROM accounts WHERE id = $1 AND type = 'ADMIN'", [id])).rowCount === 0) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');
    await assertCoversTarget(tx, req.auth!, id);
    const r = await tx.query("UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1 AND type = 'ADMIN'", [id, passwordHash]);
    if (r.rowCount === 0) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Admin');
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: actorOf(req.auth), action: 'ACCOUNT.RESET_PASSWORD', entity: { type: 'account', id }, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});
