import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_CATALOG } from '../../../config/permissionCatalog';
import { PERM } from '../../../config/permissions';
import { HOTEL_ASSIGNABLE_PERMISSIONS, HOTEL_OWNER_ROLE, HOTEL_STAFF_SYSTEM_KEYS } from '../../../config/roles';
import { db, withTransaction, type Db } from '../../../database/pg';
import type { AccountDoc, RoleDoc } from '../../../database/types';
import { AppError, isDuplicateKey } from '../../../lib/errors';
import { hashPassword } from '../../../lib/password';
import { escapeLike, idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { actorOf, writeAudit } from '../../../services/audit';
import { forgetAuth } from '../../../services/authz';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Nhân viên + vai trò RIÊNG của khách sạn đang làm việc (hotelId trong token). Tách hẳn cổng Admin:
// vai trò khách sạn là scope 'HOTEL' + hotel_id (admin/roles.router.ts chỉ thấy scope 'SYSTEM'), nhân viên là accounts type 'HOTEL' (admin/accounts.router.ts chỉ thấy type 'ADMIN').
export const hotelPermissionsRouter = Router();
export const hotelRolesRouter = Router();
export const hotelStaffRouter = Router();
const manageRoles = requirePermission(PERM.HOTEL_ROLE_MANAGE);
const manageStaff = requirePermission(PERM.HOTEL_STAFF_MANAGE);
const readAny = requireAnyPermission(PERM.HOTEL_ROLE_MANAGE, PERM.HOTEL_STAFF_MANAGE);
for (const r of [hotelPermissionsRouter, hotelRolesRouter, hotelStaffRouter]) r.use(authenticate);

type Auth = NonNullable<Express.Request['auth']>;
// Luôn khóa theo khách sạn trong token (kể cả người có hotel:scope:all phải gắn khách sạn).
const hotelOf = (auth: Auth): string => {
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return auth.hotelId;
};
// Chống leo thang: chỉ được gán/đụng tới quyền chính mình đang có.
const assertCovers = (auth: Auth, perms: readonly string[]) => {
  const missing = perms.filter((p) => !auth.permissions.includes(p));
  if (missing.length) throw new AppError(403, 'PERMISSION_ESCALATION', 'Không thể gán quyền mà chính bạn không có', { missing });
};
const CUSTOM = 'custom_';
const password = z.string().min(12).max(128);
const phone = z.string().trim().regex(/^\+?[0-9][0-9\s.-]{7,18}$/, 'Số điện thoại không hợp lệ');

// ---------- Danh mục quyền (chỉ phạm vi khách sạn) ----------
hotelPermissionsRouter.get('/', readAny, (_req, res) => {
  res.json({ items: HOTEL_ASSIGNABLE_PERMISSIONS.map((key) => ({ key, group: PERMISSION_CATALOG[key as keyof typeof PERMISSION_CATALOG].group, description: PERMISSION_CATALOG[key as keyof typeof PERMISSION_CATALOG].description })) });
});

// ---------- Vai trò ----------
const roleName = z.string().trim().min(2).max(60);
const createRoleBody = z.object({ name: roleName, description: z.string().trim().max(200).optional(), permissions: z.array(z.string().min(1).max(100)).min(1).max(50) });
const patchRoleBody = z
  .object({ name: roleName, description: z.string().trim().max(200), permissions: z.array(z.string().min(1).max(100)).min(1).max(50) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');

type RoleRow = RoleDoc & { accountCount: number };
const COUNT = '(SELECT count(*) FROM accounts a WHERE r.id = ANY(a.role_ids))::int AS account_count';
const roleView = (r: RoleRow) => ({
  id: r.id, key: r.key, name: r.name, description: r.description ?? null, system: r.system, assignable: !r.system || HOTEL_STAFF_SYSTEM_KEYS.includes(r.key),
  permissions: r.permissions, accountCount: r.accountCount, createdAt: r.createdAt, updatedAt: r.updatedAt,
});
// Vai trò khách sạn nhìn thấy: mẫu hệ thống (hotel_owner chỉ xem, lễ tân/quản lý) + vai trò tùy chỉnh CỦA khách sạn này.
const visibleWhere = (hotelParam: string) =>
  `((r.system AND r.scope = 'SYSTEM' AND r.hotel_id IS NULL AND r.key = ANY(ARRAY['${HOTEL_OWNER_ROLE.key}', ${HOTEL_STAFF_SYSTEM_KEYS.map((k) => `'${k}'`).join(', ')}])) OR (NOT r.system AND r.scope = 'HOTEL' AND r.hotel_id = ${hotelParam} AND r.key LIKE 'custom\\_%'))`;
const loadRole = async (tx: Db, id: string, hotelId: string, lock = false) =>
  (await tx.query<RoleRow>(`SELECT r.*, ${COUNT} FROM roles r WHERE r.id = $1 AND ${visibleWhere('$2')}${lock ? ' FOR UPDATE OF r' : ''}`, [id, hotelId])).rows[0];
const perms = (input: string[]): string[] => {
  const unique = [...new Set(input)];
  const out = unique.filter((p) => !HOTEL_ASSIGNABLE_PERMISSIONS.includes(p));
  if (out.length) throw new AppError(422, 'PERMISSION_OUT_OF_SCOPE', 'Có quyền không thuộc phạm vi khách sạn', { invalid: out });
  return unique;
};
const lockNames = (tx: Db, hotelId: string) => tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`hotel-role-name:${hotelId}`]);
const assertNameFree = async (tx: Db, hotelId: string, n: string, exceptId?: string) => {
  const dup = (await tx.query("SELECT 1 FROM roles WHERE scope = 'HOTEL' AND hotel_id = $1 AND lower(name) = lower($2) AND ($3::uuid IS NULL OR id <> $3)", [hotelId, n, exceptId ?? null])).rows[0];
  if (dup) throw new AppError(409, 'ROLE_NAME_TAKEN', 'Tên vai trò đã được dùng trong khách sạn');
};

hotelRolesRouter.get('/', readAny, async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const rows = (await db.query<RoleRow>(`SELECT r.*, ${COUNT} FROM roles r WHERE ${visibleWhere('$1')} ORDER BY r.system DESC, r.created_at, r.name`, [hotelId])).rows;
  res.json({ items: rows.map(roleView) });
});

hotelRolesRouter.post('/', manageRoles, validate({ body: createRoleBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const body = req.valid.body as z.infer<typeof createRoleBody>;
  const permissions = perms(body.permissions);
  assertCovers(req.auth!, permissions);
  const id = randomUUID();
  const created = await withTransaction(async (tx) => {
    await lockNames(tx, hotelId);
    await assertNameFree(tx, hotelId, body.name);
    await tx.query(
      `INSERT INTO roles (id, key, name, description, scope, hotel_id, permissions, system, created_by) VALUES ($1, $2, $3, $4, 'HOTEL', $5, $6::text[], false, $7)`,
      [id, `${CUSTOM}${id.replace(/-/g, '').slice(0, 12)}`, body.name, body.description || null, hotelId, permissions, req.auth!.sub],
    );
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL_ROLE.CREATE', entity: { type: 'role', id }, hotelId, after: { name: body.name, permissions }, requestId: String(req.id) }, tx);
    return (await loadRole(tx, id, hotelId))!;
  });
  res.status(201).json({ role: roleView(created) });
});

// Sửa/xóa: phải là vai trò tùy chỉnh của khách sạn mình, không phải vai trò đang gán cho chính mình, và mình phủ hết quyền của nó.
async function loadMutable(tx: Db, id: string, auth: Auth): Promise<RoleRow> {
  const role = await loadRole(tx, id, hotelOf(auth), true);
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
  if (role.system) throw new AppError(409, 'ROLE_SYSTEM_IMMUTABLE', 'Vai trò hệ thống không thể sửa hoặc xóa');
  const own = (await tx.query<{ roleIds: string[] }>('SELECT role_ids FROM accounts WHERE id = $1', [auth.sub])).rows[0];
  if (own?.roleIds?.includes(id)) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể sửa hoặc xóa vai trò đang gán cho chính mình');
  assertCovers(auth, role.permissions);
  return role;
}
const usersOf = async (tx: Db, roleId: string) => (await tx.query<{ id: string }>('SELECT id FROM accounts WHERE $1 = ANY(role_ids)', [roleId])).rows.map((r) => r.id);

hotelRolesRouter.patch('/:id', manageRoles, validate({ params: idParams, body: patchRoleBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchRoleBody>;
  const permissions = patch.permissions ? perms(patch.permissions) : undefined;
  if (permissions) assertCovers(req.auth!, permissions);
  const { next, users } = await withTransaction(async (tx) => {
    const before = await loadMutable(tx, id, req.auth!);
    if (patch.name !== undefined) {
      await lockNames(tx, hotelId);
      await assertNameFree(tx, hotelId, patch.name, id);
    }
    await tx.query(
      `UPDATE roles SET name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END, permissions = COALESCE($5::text[], permissions), updated_at = now() WHERE id = $1`,
      [id, patch.name ?? null, patch.description !== undefined, patch.description || null, permissions ?? null],
    );
    await writeAudit(
      { actor: actorOf(req.auth), action: 'HOTEL_ROLE.UPDATE', entity: { type: 'role', id }, hotelId, before: { name: before.name, description: before.description, permissions: before.permissions }, after: patch, requestId: String(req.id) },
      tx,
    );
    return { next: (await loadRole(tx, id, hotelId))!, users: await usersOf(tx, id) };
  });
  users.forEach(forgetAuth); // đổi quyền có hiệu lực ngay trên bản API này
  res.json({ role: roleView(next) });
});

hotelRolesRouter.delete('/:id', manageRoles, validate({ params: idParams }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await withTransaction(async (tx) => {
    const role = await loadMutable(tx, id, req.auth!);
    if (role.accountCount > 0) throw new AppError(409, 'ROLE_IN_USE', 'Vai trò đang được gán cho nhân viên, hãy chuyển họ sang vai trò khác trước', { accountCount: role.accountCount });
    await tx.query('DELETE FROM roles WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL_ROLE.DELETE', entity: { type: 'role', id }, hotelId, before: { name: role.name, permissions: role.permissions }, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});

// ---------- Nhân viên ----------
const createStaffBody = z.object({ email: z.string().email().max(200), fullName: z.string().trim().min(2).max(100), phone: phone.optional(), roleId: z.string().uuid(), password });
const patchStaffBody = z
  .object({ fullName: z.string().trim().min(2).max(100), phone: phone.nullable(), roleId: z.string().uuid(), status: z.enum(['ACTIVE', 'LOCKED']) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const resetBody = z.object({ password });
const listQuery = z.object({ status: z.enum(['ACTIVE', 'LOCKED', 'INVITED']).optional(), roleId: z.string().uuid().optional(), q: z.string().trim().min(1).max(100).optional(), limit: limitQuery, after: seqCursor.optional() });

type StaffRow = AccountDoc & { roleId?: string; roleName?: string };
// Không bao giờ trả passwordHash.
const staffView = (a: StaffRow) => ({ id: a.id, seq: a.seq, email: a.email, fullName: a.fullName, phone: a.phone ?? null, status: a.status, isOwner: !!a.isOwner, roleId: a.roleId ?? null, roleName: a.roleName ?? null, createdAt: a.createdAt, updatedAt: a.updatedAt });
const SELECT = 'SELECT a.*, r.id AS role_id, r.name AS role_name FROM accounts a LEFT JOIN roles r ON r.id = a.role_ids[1]';
// Nhân viên của khách sạn H = tài khoản HOTEL gắn H (không phải chủ doanh nghiệp), hoặc chủ của doanh nghiệp sở hữu H (chỉ để hiển thị, bị bảo vệ).
const MINE = "a.type = 'HOTEL' AND ((a.hotel_id = $1 AND a.business_id IS NULL) OR (a.is_owner AND a.business_id IS NOT NULL AND a.business_id = (SELECT business_id FROM hotels WHERE id = $1)))";
const loadStaff = async (tx: Db, hotelId: string, id: string, lock = false) =>
  (await tx.query<StaffRow>(`${SELECT} WHERE a.id = $2 AND ${MINE}${lock ? ' FOR UPDATE OF a' : ''}`, [hotelId, id])).rows[0];

// Vai trò gán được cho nhân viên: mẫu lễ tân/quản lý + vai trò tùy chỉnh của chính khách sạn. Khác -> 404 (không lộ vai trò admin / khách sạn khác).
async function pickRole(tx: Db, hotelId: string, roleId: string): Promise<RoleDoc> {
  const role = (await tx.query<RoleDoc>(`SELECT r.* FROM roles r WHERE r.id = $1 AND ${visibleWhere('$2')} FOR SHARE OF r`, [roleId, hotelId])).rows[0];
  if (!role || (role.system && !HOTEL_STAFF_SYSTEM_KEYS.includes(role.key))) throw new AppError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
  return role;
}
const permsOf = async (tx: Db, accountId: string) =>
  (await tx.query<{ permissions: string[] }>('SELECT r.permissions FROM roles r JOIN accounts a ON r.id = ANY(a.role_ids) WHERE a.id = $1', [accountId])).rows.flatMap((r) => r.permissions);
// Điều kiện chung để sửa/khóa/đặt lại mật khẩu một nhân viên: tồn tại trong khách sạn mình (IDOR -> 404), không phải chủ, quyền của họ không vượt quá mình.
async function loadTarget(tx: Db, auth: Auth, id: string): Promise<StaffRow> {
  const t = await loadStaff(tx, hotelOf(auth), id, true);
  if (!t) throw new AppError(404, 'STAFF_NOT_FOUND', 'Không tìm thấy nhân viên');
  if (t.isOwner) throw new AppError(403, 'OWNER_PROTECTED', 'Không thể thao tác lên tài khoản chủ');
  if (t.id !== auth.sub) assertCovers(auth, await permsOf(tx, id));
  return t;
}

hotelStaffRouter.get('/', manageStaff, validate({ query: listQuery }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { status, roleId, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const params: unknown[] = [hotelId];
  const where = [MINE];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('a.status = ?', status);
  if (roleId) add('? = ANY(a.role_ids)', roleId);
  if (q) {
    const n = params.push(escapeLike(q));
    where.push(`(a.email ILIKE '%' || $${n} || '%' OR a.full_name ILIKE '%' || $${n} || '%')`);
  }
  if (after !== undefined) add('a.seq < ?', after);
  const rows = (await db.query<StaffRow>(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY a.seq DESC LIMIT ${limit + 1}`, params)).rows;
  const page = rows.slice(0, limit);
  res.json({ items: page.map(staffView), nextCursor: rows.length > limit ? page[page.length - 1]?.seq : null });
});

hotelStaffRouter.post('/', manageStaff, validate({ body: createStaffBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const body = req.valid.body as z.infer<typeof createStaffBody>;
  const passwordHash = await hashPassword(body.password);
  try {
    const staff = await withTransaction(async (tx) => {
      const role = await pickRole(tx, hotelId, body.roleId);
      assertCovers(req.auth!, role.permissions);
      const id = (
        await tx.query<{ id: string }>(
          `INSERT INTO accounts (type, email, password_hash, full_name, phone, status, hotel_id, role_ids, is_owner, created_by) VALUES ('HOTEL', $1, $2, $3, $4, 'ACTIVE', $5, $6::uuid[], false, $7) RETURNING id`,
          [body.email.toLowerCase(), passwordHash, body.fullName, body.phone ?? null, hotelId, [role.id], req.auth!.sub],
        )
      ).rows[0]!.id;
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL_STAFF.CREATE', entity: { type: 'account', id }, hotelId, after: { email: body.email.toLowerCase(), fullName: body.fullName, roleId: role.id }, requestId: String(req.id) }, tx);
      return (await loadStaff(tx, hotelId, id))!;
    });
    res.status(201).json({ staff: staffView(staff) });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được dùng');
    throw e;
  }
});

hotelStaffRouter.patch('/:id', manageStaff, validate({ params: idParams, body: patchStaffBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchStaffBody>;
  const next = await withTransaction(async (tx) => {
    const before = await loadTarget(tx, req.auth!, id);
    const role = patch.roleId ? await pickRole(tx, hotelId, patch.roleId) : undefined;
    const roleChanged = !!role && role.id !== before.roleIds?.[0];
    // Tự khóa/tự đổi vai trò dễ làm khách sạn mất người quản lý.
    if (id === req.auth!.sub && (patch.status === 'LOCKED' || roleChanged)) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể tự khóa hoặc tự đổi vai trò của mình');
    if (role) assertCovers(req.auth!, role.permissions);
    await tx.query(
      `UPDATE accounts SET full_name = COALESCE($2, full_name), phone = CASE WHEN $3::boolean THEN $4 ELSE phone END, status = COALESCE($5, status), role_ids = COALESCE($6::uuid[], role_ids), updated_at = now() WHERE id = $1`,
      [id, patch.fullName ?? null, patch.phone !== undefined, patch.phone ?? null, patch.status ?? null, role ? [role.id] : null],
    );
    await writeAudit(
      { actor: actorOf(req.auth), action: 'HOTEL_STAFF.UPDATE', entity: { type: 'account', id }, hotelId, before: { fullName: before.fullName, status: before.status, roleId: before.roleIds?.[0] }, after: patch, requestId: String(req.id) },
      tx,
    );
    return (await loadStaff(tx, hotelId, id))!;
  });
  forgetAuth(id); // khóa / đổi vai trò có hiệu lực ngay trên bản API này
  res.json({ staff: staffView(next) });
});

hotelStaffRouter.post('/:id/reset-password', manageStaff, validate({ params: idParams, body: resetBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { password: pw } = req.valid.body as z.infer<typeof resetBody>;
  const passwordHash = await hashPassword(pw);
  await withTransaction(async (tx) => {
    await loadTarget(tx, req.auth!, id);
    if (id === req.auth!.sub) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Hãy dùng chức năng đổi mật khẩu của chính mình');
    await tx.query('UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL_STAFF.RESET_PASSWORD', entity: { type: 'account', id }, hotelId, requestId: String(req.id) }, tx);
  });
  res.status(204).end();
});
