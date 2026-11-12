import { PERMISSION_CATALOG, SENSITIVE_PERMISSIONS } from '../config/permissionCatalog';
import { PERM } from '../config/permissions';
import { ADMIN_ROLES } from '../config/roles';
import { db, type Db } from '../database/pg';
import type { RoleDoc } from '../database/types';
import { AppError } from '../lib/errors';
import type { AuthContext } from '../lib/jwt';
import { forgetAuth } from './authz';

// Vai trò dùng được cho tài khoản Admin = 4 vai trò hệ thống (ADMIN_ROLES) + vai trò tùy chỉnh (key 'custom_<mã>', scope SYSTEM, system=false).
// hotel_owner (scope SYSTEM nhưng dành cho khách sạn) và vai trò riêng của khách sạn KHÔNG nằm trong tập này.
export const CUSTOM_KEY_PREFIX = 'custom_';
export const isSystemAdminKey = (key: string): boolean => Object.hasOwn(ADMIN_ROLES, key);
export const isAdminAssignable = (r: Pick<RoleDoc, 'key' | 'scope' | 'hotelId' | 'system'>): boolean =>
  r.scope === 'SYSTEM' && !r.hotelId && (r.system ? isSystemAdminKey(r.key) : r.key.startsWith(CUSTOM_KEY_PREFIX));

export const ALL_PERMISSIONS: readonly string[] = Object.keys(PERMISSION_CATALOG);

// Mọi permission phải có trong danh mục (lạ -> 422); khử trùng lặp, giữ thứ tự.
export function normalizePermissions(input: string[]): string[] {
  const unique = [...new Set(input)];
  const unknown = unique.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (unknown.length) throw new AppError(422, 'UNKNOWN_PERMISSION', 'Có quyền không tồn tại trong hệ thống', { unknown });
  return unique;
}

// Chống leo thang đặc quyền: người gán chỉ được gán quyền chính họ đang có (quyền lấy từ DB ở mỗi request, xem resolveAuth).
// Quyền nhạy cảm còn đòi người gán có admin:account:manage (mức Quản trị hệ thống).
// Ngoại lệ: người có ĐỦ bộ quyền của vai trò Quản trị hệ thống (mức SYSADMIN, xét theo quyền chứ không theo tên vai trò) được gán mọi quyền trong danh mục,
// vì 4 vai trò hệ thống có quyền mà SYSADMIN không có (vd. admin:config:shuttle của OPS) và SYSADMIN vẫn phải gán được vai trò đó.
const isSysadminLevel = (actor: AuthContext): boolean => ADMIN_ROLES.SYSADMIN.permissions.every((p) => actor.permissions.includes(p));

export function assertCanGrant(actor: AuthContext, permissions: readonly string[]): void {
  if (isSysadminLevel(actor)) return;
  const missing = permissions.filter((p) => !actor.permissions.includes(p));
  const sensitive = permissions.filter((p) => SENSITIVE_PERMISSIONS.includes(p));
  if (missing.length || (sensitive.length && !actor.permissions.includes(PERM.ADMIN_ACCOUNT_MANAGE))) {
    throw new AppError(403, 'PERMISSION_ESCALATION', 'Không thể gán quyền mà chính bạn không có', { missing });
  }
}

// Tài khoản đang dùng một vai trò (để làm mới cache quyền ngay khi vai trò đổi/xóa).
export async function accountIdsUsingRole(roleId: string, tx: Db = db): Promise<string[]> {
  return (await tx.query<{ id: string }>('SELECT id FROM accounts WHERE $1 = ANY(role_ids)', [roleId])).rows.map((r) => r.id);
}
export const forgetAll = (ids: string[]): void => ids.forEach(forgetAuth);
