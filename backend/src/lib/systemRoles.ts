import { ADMIN_ROLES, HOTEL_OWNER_ROLE } from '../config/roles';
import { col } from '../db/collections';

// Seed/cập nhật vai trò hệ thống (không gắn hotelId). Chạy lại an toàn: quyền luôn đồng bộ theo config/roles.ts.
export async function ensureSystemRoles(): Promise<void> {
  const defs = [
    ...Object.entries(ADMIN_ROLES).map(([key, r]) => ({ key, ...r })),
    { ...HOTEL_OWNER_ROLE },
  ];
  for (const r of defs) {
    await col.roles().updateOne(
      { key: r.key, hotelId: { $exists: false } },
      { $set: { name: r.name, permissions: r.permissions, scope: 'SYSTEM', system: true } },
      { upsert: true },
    );
  }
}
