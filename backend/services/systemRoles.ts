import { ADMIN_ROLES, HOTEL_OWNER_ROLE } from '../config/roles';
import { db } from '../database/pg';

// Seed/cập nhật vai trò hệ thống (không gắn hotel_id). Chạy lại an toàn: quyền luôn đồng bộ theo config/roles.ts.
export async function ensureSystemRoles(): Promise<void> {
  const defs = [...Object.entries(ADMIN_ROLES).map(([key, r]) => ({ key, ...r })), { ...HOTEL_OWNER_ROLE }];
  for (const r of defs) {
    await db.query(
      `INSERT INTO roles (key, name, scope, permissions, system) VALUES ($1, $2, 'SYSTEM', $3, true)
       ON CONFLICT (key) WHERE hotel_id IS NULL DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions, scope = 'SYSTEM', system = true`,
      [r.key, r.name, r.permissions],
    );
  }
}
