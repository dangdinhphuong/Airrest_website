import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_CATALOG, SENSITIVE_PERMISSIONS } from '../../../config/permissionCatalog';
import { PERM } from '../../../config/permissions';
import { ADMIN_ROLES } from '../../../config/roles';
import { db, withTransaction, type Db } from '../../../database/pg';
import type { RoleDoc } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { idParams } from '../../../lib/zod';
import { actorOf, writeAudit } from '../../../services/audit';
import { accountIdsUsingRole, assertCanGrant, CUSTOM_KEY_PREFIX, forgetAll, isAdminAssignable, normalizePermissions } from '../../../services/adminRoles';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Vai trò & quyền Admin. Cùng quyền admin:account:manage với quản lý tài khoản (mức Quản trị hệ thống; không tạo mã quyền mới).
export const rolesRouter = Router();
const need = requirePermission(PERM.ADMIN_ACCOUNT_MANAGE);

const name = z.string().trim().min(2).max(60);
const description = z.string().trim().max(200);
const createBody = z.object({ name, description: description.optional(), permissions: z.array(z.string().min(1).max(100)).min(1).max(100) });
const patchBody = z
  .object({ name, description, permissions: z.array(z.string().min(1).max(100)).min(1).max(100) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');

type RoleRow = RoleDoc & { accountCount: number };
const view = (r: RoleRow) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description ?? null,
  system: r.system,
  permissions: r.permissions,
  accountCount: r.accountCount,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const COUNT = '(SELECT count(*) FROM accounts a WHERE r.id = ANY(a.role_ids))::int AS account_count';
const adminRoleWhere = "r.scope = 'SYSTEM' AND r.hotel_id IS NULL AND ((r.system AND r.key = ANY($1::text[])) OR (NOT r.system AND r.key LIKE 'custom\\_%'))";
const sysKeys = Object.keys(ADMIN_ROLES);

const loadView = async (id: string, tx: Db = db): Promise<RoleRow | undefined> =>
  (await tx.query<RoleRow>(`SELECT r.*, ${COUNT} FROM roles r WHERE r.id = $1 AND ${adminRoleWhere.replace('$1::text[]', '$2::text[]')}`, [id, sysKeys])).rows[0];

// Khóa tuần tự theo tên vai trò để hai request song song không tạo trùng tên (không có unique index vì dữ liệu cũ/test có thể trùng).
const lockNames = (tx: Db) => tx.query("SELECT pg_advisory_xact_lock(hashtext('admin-role-name'))");
const assertNameFree = async (tx: Db, n: string, exceptId?: string) => {
  const dup = (await tx.query("SELECT 1 FROM roles WHERE scope = 'SYSTEM' AND hotel_id IS NULL AND lower(name) = lower($1) AND ($2::uuid IS NULL OR id <> $2)", [n, exceptId ?? null])).rows[0];
  if (dup) throw new AppError(409, 'ROLE_NAME_TAKEN', 'Tên vai trò đã được dùng');
};

// Cũ: [{key,name,permissions}] -> nay thêm id, description, system, accountCount, createdAt, updatedAt (tương thích ngược).
rolesRouter.get('/roles', need, async (_req, res) => {
  const rows = (await db.query<RoleRow>(`SELECT r.*, ${COUNT} FROM roles r WHERE ${adminRoleWhere} ORDER BY r.system DESC, r.created_at, r.name`, [sysKeys])).rows;
  const order = (r: RoleRow) => (r.system ? sysKeys.indexOf(r.key) : sysKeys.length);
  res.json({ items: rows.sort((a, b) => order(a) - order(b)).map(view) });
});

rolesRouter.get('/permissions', need, (_req, res) => {
  res.json({ items: Object.entries(PERMISSION_CATALOG).map(([key, v]) => ({ key, group: v.group, description: v.description, sensitive: SENSITIVE_PERMISSIONS.includes(key) })) });
});

rolesRouter.post('/roles', need, validate({ body: createBody }), async (req, res) => {
  const body = req.valid.body as z.infer<typeof createBody>;
  const permissions = normalizePermissions(body.permissions);
  assertCanGrant(req.auth!, permissions);
  const id = randomUUID();
  const created = await withTransaction(async (tx) => {
    await lockNames(tx);
    await assertNameFree(tx, body.name);
    await tx.query(
      `INSERT INTO roles (id, key, name, description, scope, permissions, system, created_by) VALUES ($1, $2, $3, $4, 'SYSTEM', $5::text[], false, $6)`,
      [id, `${CUSTOM_KEY_PREFIX}${id.replace(/-/g, '').slice(0, 12)}`, body.name, body.description || null, permissions, req.auth!.sub],
    );
    await writeAudit({ actor: actorOf(req.auth), action: 'ROLE.CREATE', entity: { type: 'role', id }, after: { name: body.name, permissions }, requestId: String(req.id) }, tx);
    return (await loadView(id, tx))!;
  });
  res.status(201).json({ role: view(created) });
});

// Kiểm tra chung cho sửa/xóa: tồn tại, không phải vai trò hệ thống, không phải vai trò của chính người gọi, người gọi phủ hết quyền hiện có của vai trò.
async function loadMutable(tx: Db, id: string, auth: NonNullable<Express.Request['auth']>): Promise<RoleRow> {
  const role = (await tx.query<RoleRow>(`SELECT r.*, ${COUNT} FROM roles r WHERE r.id = $1 FOR UPDATE OF r`, [id])).rows[0];
  if (!role || !isAdminAssignable(role)) throw new AppError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
  if (role.system) throw new AppError(409, 'ROLE_SYSTEM_IMMUTABLE', 'Vai trò hệ thống không thể sửa hoặc xóa');
  const own = (await tx.query<{ roleIds: string[] }>('SELECT role_ids FROM accounts WHERE id = $1', [auth.sub])).rows[0];
  if (own?.roleIds?.includes(id)) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể sửa hoặc xóa vai trò đang gán cho chính mình');
  assertCanGrant(auth, role.permissions);
  return role;
}

rolesRouter.patch('/roles/:id', need, validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchBody>;
  const permissions = patch.permissions ? normalizePermissions(patch.permissions) : undefined;
  if (permissions) assertCanGrant(req.auth!, permissions);
  const { next, users } = await withTransaction(async (tx) => {
    const before = await loadMutable(tx, id, req.auth!);
    if (patch.name !== undefined) {
      await lockNames(tx);
      await assertNameFree(tx, patch.name, id);
    }
    await tx.query(
      `UPDATE roles SET name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END, permissions = COALESCE($5::text[], permissions), updated_at = now() WHERE id = $1`,
      [id, patch.name ?? null, patch.description !== undefined, patch.description || null, permissions ?? null],
    );
    await writeAudit(
      {
        actor: actorOf(req.auth),
        action: 'ROLE.UPDATE',
        entity: { type: 'role', id },
        before: { name: before.name, description: before.description, permissions: before.permissions },
        after: { name: patch.name, description: patch.description, permissions },
        requestId: String(req.id),
      },
      tx,
    );
    return { next: (await loadView(id, tx))!, users: await accountIdsUsingRole(id, tx) };
  });
  forgetAll(users); // đổi quyền có hiệu lực ngay trên bản API này
  res.json({ role: view(next) });
});

rolesRouter.delete('/roles/:id', need, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await withTransaction(async (tx) => {
    const role = await loadMutable(tx, id, req.auth!);
    if (role.accountCount > 0) throw new AppError(409, 'ROLE_IN_USE', 'Vai trò đang được gán cho tài khoản, hãy chuyển các tài khoản sang vai trò khác trước', { accountCount: role.accountCount });
    await tx.query('DELETE FROM roles WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(req.auth), action: 'ROLE.DELETE', entity: { type: 'role', id }, before: { name: role.name, permissions: role.permissions }, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});
