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

// ?hotelId: xem vai trò của khách sạn KHÁC trong phạm vi người gọi (để gán nhân viên làm nhiều khách sạn); ngoài phạm vi -> 404.
const rolesQuery = z.object({ hotelId: z.string().uuid().optional() });
hotelRolesRouter.get('/', readAny, validate({ query: rolesQuery }), async (req, res) => {
  const asked = (req.valid.query as z.infer<typeof rolesQuery>).hotelId;
  if (asked && !(await reach(db, req.auth!)).includes(asked)) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const hotelId = asked ?? hotelOf(req.auth!);
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
// Mỗi khách sạn một vai trò (vai trò tùy chỉnh gắn theo khách sạn). Không gửi `hotels` thì dùng khách sạn đang làm việc + roleId.
const hotelRole = z.object({ hotelId: z.string().uuid(), roleId: z.string().uuid() });
const createStaffBody = z.object({ email: z.string().email().max(200), fullName: z.string().trim().min(2).max(100), phone: phone.optional(), roleId: z.string().uuid().optional(), hotels: z.array(hotelRole).min(1).max(30).optional(), password })
  .refine((b) => b.roleId || b.hotels?.length, 'Cần roleId hoặc hotels');
const patchStaffBody = z
  .object({ fullName: z.string().trim().min(2).max(100), phone: phone.nullable(), roleId: z.string().uuid(), hotels: z.array(hotelRole).min(1).max(30), status: z.enum(['ACTIVE', 'LOCKED']) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const resetBody = z.object({ password });
const listQuery = z.object({ status: z.enum(['ACTIVE', 'LOCKED', 'INVITED']).optional(), roleId: z.string().uuid().optional(), q: z.string().trim().min(1).max(100).optional(), limit: limitQuery, after: seqCursor.optional() });

type StaffHotel = { hotelId: string; code: string; name: string; roleId: string; roleName: string };
type StaffRow = AccountDoc & { roleId?: string; roleName?: string; hotels?: StaffHotel[] };
// Không bao giờ trả passwordHash.
const staffView = (a: StaffRow) => ({ id: a.id, seq: a.seq, email: a.email, fullName: a.fullName, phone: a.phone ?? null, status: a.status, isOwner: !!a.isOwner, roleId: a.roleId ?? null, roleName: a.roleName ?? null, hotels: a.hotels ?? [], createdAt: a.createdAt, updatedAt: a.updatedAt });
// Vai trò hiển thị = vai trò ở khách sạn đang làm việc ($1) theo account_hotels (không có thì vai trò mặc định của tài khoản). `hotels` = các khách sạn của nhân viên mà người xem được thấy (tham số allowed).
const selectSql = (allowedParam: string) => `SELECT a.*, r.id AS role_id, r.name AS role_name,
  (SELECT COALESCE(json_agg(json_build_object('hotelId', h2.id, 'code', h2.code, 'name', h2.name, 'roleId', r2.id, 'roleName', r2.name) ORDER BY h2.name), '[]'::json)
     FROM account_hotels ah2 JOIN hotels h2 ON h2.id = ah2.hotel_id JOIN roles r2 ON r2.id = ah2.role_id WHERE ah2.account_id = a.id AND ah2.hotel_id = ANY(${allowedParam}::uuid[])) AS hotels
  FROM accounts a LEFT JOIN account_hotels ah ON ah.account_id = a.id AND ah.hotel_id = $1 LEFT JOIN roles r ON r.id = COALESCE(ah.role_id, a.role_ids[1])`;
// Khách sạn người gọi được thao tác: chủ doanh nghiệp = mọi khách sạn của doanh nghiệp; nhân viên = các khách sạn được gán; luôn gồm khách sạn đang làm việc.
async function reach(tx: Db, auth: Auth): Promise<string[]> {
  const rows = auth.businessId
    ? (await tx.query<{ id: string }>('SELECT id FROM hotels WHERE business_id = $1', [auth.businessId])).rows.map((r) => r.id)
    : (await tx.query<{ hotelId: string }>('SELECT hotel_id FROM account_hotels WHERE account_id = $1', [auth.sub])).rows.map((r) => r.hotelId);
  return [...new Set([...rows, hotelOf(auth)])];
}
// Nhân viên của khách sạn H = tài khoản HOTEL gắn H (không phải chủ doanh nghiệp), hoặc chủ của doanh nghiệp sở hữu H (chỉ để hiển thị, bị bảo vệ).
const MINE = "a.type = 'HOTEL' AND ((a.business_id IS NULL AND (a.hotel_id = $1 OR EXISTS (SELECT 1 FROM account_hotels x WHERE x.account_id = a.id AND x.hotel_id = $1))) OR (a.is_owner AND a.business_id IS NOT NULL AND a.business_id = (SELECT business_id FROM hotels WHERE id = $1)))";
const loadStaff = async (tx: Db, auth: Auth, id: string, lock = false) =>
  (await tx.query<StaffRow>(`${selectSql('$3')} WHERE a.id = $2 AND ${MINE}${lock ? ' FOR UPDATE OF a' : ''}`, [hotelOf(auth), id, await reach(tx, auth)])).rows[0];

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
  const t = await loadStaff(tx, auth, id, true);
  if (!t) throw new AppError(404, 'STAFF_NOT_FOUND', 'Không tìm thấy nhân viên');
  if (t.isOwner) throw new AppError(403, 'OWNER_PROTECTED', 'Không thể thao tác lên tài khoản chủ');
  if (t.id !== auth.sub) assertCovers(auth, await permsOf(tx, id));
  return t;
}

hotelStaffRouter.get('/', manageStaff, validate({ query: listQuery }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const { status, roleId, q, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const params: unknown[] = [hotelId, await reach(db, req.auth!)];
  const where = [MINE];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('a.status = ?', status);
  if (roleId) add('? = ANY(a.role_ids)', roleId);
  if (q) {
    const n = params.push(escapeLike(q));
    where.push(`(a.email ILIKE '%' || $${n} || '%' OR a.full_name ILIKE '%' || $${n} || '%')`);
  }
  if (after !== undefined) add('a.seq < ?', after);
  const rows = (await db.query<StaffRow>(`${selectSql('$2')} WHERE ${where.join(' AND ')} ORDER BY a.seq DESC LIMIT ${limit + 1}`, params)).rows;
  const page = rows.slice(0, limit);
  res.json({ items: page.map(staffView), nextCursor: rows.length > limit ? page[page.length - 1]?.seq : null });
});

// Kiểm khách sạn đích nằm trong phạm vi người gọi (khác -> 404, không lộ khách sạn khác) và vai trò hợp lệ + không vượt quyền người gọi.
async function checkTargets(tx: Db, auth: Auth, targets: { hotelId: string; roleId: string }[]) {
  const allowed = await reach(tx, auth);
  const seen = new Set<string>();
  for (const t of targets) {
    if (!allowed.includes(t.hotelId) || seen.has(t.hotelId)) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    seen.add(t.hotelId);
    assertCovers(auth, (await pickRole(tx, t.hotelId, t.roleId)).permissions);
  }
}
// Đồng bộ cột mặc định của tài khoản (khách sạn + vai trò) với danh sách liên kết: giữ nếu còn, không thì lấy liên kết đầu tiên.
const syncDefault = (tx: Db, accountId: string) =>
  tx.query(
    `UPDATE accounts a SET hotel_id = d.hotel_id, role_ids = ARRAY[d.role_id], updated_at = now()
       FROM (SELECT DISTINCT ON (account_id) account_id, hotel_id, role_id FROM account_hotels WHERE account_id = $1
             ORDER BY account_id, (hotel_id = (SELECT hotel_id FROM accounts WHERE id = $1)) DESC, created_at) d
      WHERE a.id = d.account_id`, [accountId]);

hotelStaffRouter.post('/', manageStaff, validate({ body: createStaffBody }), async (req, res) => {
  const hotelId = hotelOf(req.auth!);
  const body = req.valid.body as z.infer<typeof createStaffBody>;
  const passwordHash = await hashPassword(body.password);
  const targets = body.hotels ?? [{ hotelId, roleId: body.roleId! }];
  try {
    const staff = await withTransaction(async (tx) => {
      await checkTargets(tx, req.auth!, targets);
      const first = targets.find((t) => t.hotelId === hotelId) ?? targets[0]!;
      const id = (
        await tx.query<{ id: string }>(
          `INSERT INTO accounts (type, email, password_hash, full_name, phone, status, hotel_id, role_ids, is_owner, created_by) VALUES ('HOTEL', $1, $2, $3, $4, 'ACTIVE', $5, $6::uuid[], false, $7) RETURNING id`,
          [body.email.toLowerCase(), passwordHash, body.fullName, body.phone ?? null, first.hotelId, [first.roleId], req.auth!.sub],
        )
      ).rows[0]!.id;
      for (const t of targets) await tx.query('INSERT INTO account_hotels (account_id, hotel_id, role_id) VALUES ($1, $2, $3)', [id, t.hotelId, t.roleId]);
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL_STAFF.CREATE', entity: { type: 'account', id }, hotelId, after: { email: body.email.toLowerCase(), fullName: body.fullName, hotels: targets }, requestId: String(req.id) }, tx);
      return (await loadStaff(tx, req.auth!, id))!;
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
    const roleChanged = !!role && role.id !== before.roleId;
    // Tự khóa/tự đổi vai trò/tự đổi khách sạn dễ làm khách sạn mất người quản lý.
    if (id === req.auth!.sub && (patch.status === 'LOCKED' || roleChanged || patch.hotels)) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'Không thể tự khóa hoặc tự đổi vai trò của mình');
    if (role) assertCovers(req.auth!, role.permissions);
    await tx.query(
      `UPDATE accounts SET full_name = COALESCE($2, full_name), phone = CASE WHEN $3::boolean THEN $4 ELSE phone END, status = COALESCE($5, status), updated_at = now() WHERE id = $1`,
      [id, patch.fullName ?? null, patch.phone !== undefined, patch.phone ?? null, patch.status ?? null],
    );
    // Đổi vai trò ở khách sạn đang làm việc (liên kết + cột mặc định nếu đây là khách sạn mặc định).
    if (role) {
      await tx.query('UPDATE account_hotels SET role_id = $3 WHERE account_id = $1 AND hotel_id = $2', [id, hotelId, role.id]);
      await tx.query('UPDATE accounts SET role_ids = ARRAY[$2::uuid] WHERE id = $1 AND (hotel_id = $3 OR NOT EXISTS (SELECT 1 FROM account_hotels WHERE account_id = $1))', [id, role.id, hotelId]);
    }
    // Đặt lại danh sách khách sạn trong phạm vi người gọi; liên kết ngoài phạm vi giữ nguyên; luôn còn ít nhất một khách sạn.
    if (patch.hotels) {
      await checkTargets(tx, req.auth!, patch.hotels);
      const allowed = await reach(tx, req.auth!);
      const keep = patch.hotels.map((h) => h.hotelId);
      await tx.query('DELETE FROM account_hotels WHERE account_id = $1 AND hotel_id = ANY($2::uuid[]) AND NOT hotel_id = ANY($3::uuid[])', [id, allowed, keep]);
      for (const t of patch.hotels) {
        await tx.query('INSERT INTO account_hotels (account_id, hotel_id, role_id) VALUES ($1, $2, $3) ON CONFLICT (account_id, hotel_id) DO UPDATE SET role_id = EXCLUDED.role_id', [id, t.hotelId, t.roleId]);
      }
      await syncDefault(tx, id);
    }
    await writeAudit(
      { actor: actorOf(req.auth), action: 'HOTEL_STAFF.UPDATE', entity: { type: 'account', id }, hotelId, before: { fullName: before.fullName, status: before.status, roleId: before.roleId, hotels: before.hotels?.map((h) => h.hotelId) }, after: patch, requestId: String(req.id) },
      tx,
    );
    // Vừa gỡ khỏi khách sạn đang làm việc thì không còn khớp MINE: vẫn trả bản ghi vừa sửa.
    return (await loadStaff(tx, req.auth!, id)) ?? (await tx.query<StaffRow>(`${selectSql('$3')} WHERE a.id = $2`, [hotelId, id, await reach(tx, req.auth!)])).rows[0]!;
  });
  forgetAuth(id); // khóa / đổi vai trò / đổi khách sạn có hiệu lực ngay trên bản API này
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
