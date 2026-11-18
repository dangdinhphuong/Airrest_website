import { PERM } from '../config/permissions';
import { HOTEL_OWNER_ROLE, HOTEL_STAFF_SYSTEM_KEYS } from '../config/roles';
import { db } from '../database/pg';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { emitToRoom, rooms } from '../api/realtime/socket';

// Loại thông báo cho nhân sự khách sạn. `perm` = quyền mặc định: vai trò có quyền này thì nhận, trừ khi cấu hình ghi đè (notification_settings).
export const NOTIFICATION_TYPES = {
  BOOKING_NEW: { label: 'Đơn mới', perm: PERM.BOOKING_READ },
  BOOKING_PENDING: { label: 'Đơn chờ duyệt', perm: PERM.BOOKING_DECIDE },
  BOOKING_PAID: { label: 'Khách đã thanh toán', perm: PERM.BOOKING_READ },
  BOOKING_CANCELLED: { label: 'Khách hủy / đổi đơn', perm: PERM.BOOKING_READ },
  BOOKING_NO_SHOW: { label: 'Khách không đến', perm: PERM.BOOKING_CHECKIN },
  CHECKIN_SOON: { label: 'Sắp đến giờ nhận phòng', perm: PERM.BOOKING_CHECKIN },
  SHUTTLE_EXTERNAL: { label: 'Hết xe, cần gọi xe ngoài', perm: PERM.FLEET_MANAGE },
  SHUTTLE_UPDATE: { label: 'Chuyến xe thay đổi', perm: PERM.SHUTTLE_HANDLE },
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

type RoleRow = { id: string; key: string; name: string; permissions: string[] };
/** Vai trò của khách sạn: chủ, lễ tân/quản lý hệ thống + vai trò tự tạo. */
export const hotelRoles = async (hotelId: string): Promise<RoleRow[]> =>
  (await db.query<RoleRow>(
    `SELECT id, key, name, permissions FROM roles
      WHERE (hotel_id IS NULL AND scope = 'SYSTEM' AND key = ANY($2::text[])) OR (scope = 'HOTEL' AND hotel_id = $1 AND key LIKE 'custom\\_%')
      ORDER BY system DESC, name`, [hotelId, [HOTEL_OWNER_ROLE.key, ...HOTEL_STAFF_SYSTEM_KEYS]])).rows;

const overrides = async (hotelId: string) =>
  new Map((await db.query<{ roleId: string; type: string; enabled: boolean }>('SELECT role_id, type, enabled FROM notification_settings WHERE hotel_id = $1', [hotelId])).rows.map((r) => [`${r.roleId}|${r.type}`, r.enabled]));

/** Ma trận vai trò × loại (đã áp mặc định theo quyền + ghi đè). */
export async function getMatrix(hotelId: string) {
  const [roles, ov] = await Promise.all([hotelRoles(hotelId), overrides(hotelId)]);
  const types = Object.entries(NOTIFICATION_TYPES).map(([key, t]) => ({ key, label: t.label, permission: t.perm }));
  return { types, roles: roles.map((r) => ({ id: r.id, name: r.name, enabled: Object.fromEntries(types.map((t) => [t.key, ov.get(`${r.id}|${t.key}`) ?? r.permissions.includes(t.permission)])) })) };
}

export async function saveMatrix(hotelId: string, cells: { roleId: string; type: string; enabled: boolean }[]) {
  const roles = new Set((await hotelRoles(hotelId)).map((r) => r.id));
  for (const c of cells) if (!roles.has(c.roleId) || !(c.type in NOTIFICATION_TYPES)) throw new AppError(422, 'INVALID_NOTIFICATION_SETTING', 'Vai trò hoặc loại thông báo không hợp lệ', { roleId: c.roleId, type: c.type });
  for (const c of cells) await db.query(
    `INSERT INTO notification_settings (hotel_id, role_id, type, enabled) VALUES ($1,$2,$3,$4)
     ON CONFLICT (hotel_id, role_id, type) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`, [hotelId, c.roleId, c.type, c.enabled]);
}

/** Tạo thông báo (idempotent theo dedupeKey) rồi báo realtime. Lỗi chỉ ghi log: không được làm hỏng nghiệp vụ gốc. */
export async function notify(hotelId: string, type: NotificationType, n: { title: string; body?: string; refCode?: string; dedupeKey: string }): Promise<void> {
  try {
    const t = NOTIFICATION_TYPES[type];
    const [roles, ov] = await Promise.all([hotelRoles(hotelId), overrides(hotelId)]);
    const roleIds = roles.filter((r) => ov.get(`${r.id}|${type}`) ?? r.permissions.includes(t.perm)).map((r) => r.id);
    if (!roleIds.length) return;
    const ins = await db.query('INSERT INTO notifications (hotel_id, type, title, body, ref_code, dedupe_key, role_ids) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (hotel_id, dedupe_key) DO NOTHING RETURNING id', [hotelId, type, n.title, n.body ?? null, n.refCode ?? null, n.dedupeKey, roleIds]);
    if (ins.rows[0]) emitToRoom(rooms.hotelNotify(hotelId), 'notify:new', { id: (ins.rows[0] as { id: string }).id, type }); // không kèm nội dung: client gọi REST để lấy theo quyền
  } catch (err) { logger.error({ err, type, hotelId }, 'Tạo thông báo lỗi'); }
}

type Who = { sub: string; hotelId?: string; roleIds?: string[] };
export async function listNotifications(who: Who, q: { limit: number; unreadOnly?: boolean }) {
  if (!who.hotelId || !who.roleIds?.length) return { items: [], unread: 0 };
  const rows = (await db.query<{ id: string; type: string; title: string; body: string | null; refCode: string | null; createdAt: Date; readAt: Date | null }>(
    `SELECT n.id, n.type, n.title, n.body, n.ref_code, n.created_at, r.read_at FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.account_id = $1
      WHERE n.hotel_id = $2 AND n.role_ids && $3::uuid[] AND ($4::boolean = false OR r.read_at IS NULL)
      ORDER BY n.created_at DESC LIMIT $5`, [who.sub, who.hotelId, who.roleIds, !!q.unreadOnly, q.limit])).rows;
  const unread = (await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notifications n WHERE n.hotel_id = $2 AND n.role_ids && $3::uuid[] AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.account_id = $1)`, [who.sub, who.hotelId, who.roleIds])).rows[0]!.n;
  return { items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, refCode: r.refCode, createdAt: r.createdAt, read: !!r.readAt })), unread };
}

/** id rỗng = đọc hết. Chỉ đánh dấu thông báo mà người này được thấy. */
export async function markRead(who: Who, id?: string) {
  if (!who.hotelId || !who.roleIds?.length) return;
  await db.query(
    `INSERT INTO notification_reads (notification_id, account_id) SELECT n.id, $1 FROM notifications n WHERE n.hotel_id = $2 AND n.role_ids && $3::uuid[] AND ($4::uuid IS NULL OR n.id = $4) ON CONFLICT DO NOTHING`, [who.sub, who.hotelId, who.roleIds, id ?? null]);
}

/** Nhắc các đơn đã xác nhận sắp tới giờ nhận phòng (trong 2 giờ tới). Idempotent nhờ dedupeKey; nhiều bản API cùng quét vẫn an toàn. */
export async function sweepCheckinSoon(now = new Date()): Promise<void> {
  const rows = (await db.query<{ code: string; hotelId: string }>(
    "SELECT code, hotel_id FROM bookings WHERE status = 'CONFIRMED' AND stay_from > $1 AND stay_from <= $1::timestamptz + interval '2 hours' LIMIT 500", [now])).rows;
  for (const r of rows) await notify(r.hotelId, 'CHECKIN_SOON', { title: `Đơn ${r.code} sắp tới giờ nhận phòng`, refCode: r.code, dedupeKey: `CHECKIN_SOON:${r.code}` });
}
