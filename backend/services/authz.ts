import { db } from '../database/pg';
import type { AccountDoc, RoleDoc } from '../database/types';
import { AppError } from '../lib/errors';
import type { AuthContext } from '../lib/jwt';

// Quyền KHÔNG nằm trong JWT (token chỉ ~200 byte, không phình theo số quyền -> không vượt giới hạn header).
// Mỗi request đọc lại tài khoản + vai trò, cache ngắn trong bộ nhớ: đổi vai trò/khóa tài khoản có hiệu lực sau tối đa TTL.
// shortcut: cache theo từng tiến trình; chạy nhiều bản API thì bản khác chờ hết TTL (30s), nâng lên Redis/Change Stream khi cần.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Pick<AuthContext, 'permissions' | 'hotelId' | 'businessId' | 'accountType' | 'payerId' | 'payerStationId'> | null }>();

// Gọi ngay sau khi sửa/khóa tài khoản để bản API này áp dụng tức thì.
// Khóa cache = sub|khách sạn đang làm việc (chủ nhiều khách sạn có nhiều token cùng lúc).
export const forgetAuth = (sub: string): void => { for (const k of cache.keys()) if (k.startsWith(sub)) cache.delete(k); };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(sub: string, claimedHotel?: string) {
  if (!UUID.test(sub)) return null;
  const a = (await db.query<AccountDoc>('SELECT type, status, hotel_id, business_id, payer_id, payer_station_id, role_ids FROM accounts WHERE id = $1', [sub])).rows[0];
  if (!a || a.status !== 'ACTIVE') return null;
  // Đơn vị chi trả bị tạm ngưng thì nhân viên của nó cũng bị khóa.
  if (a.payerId && !(await db.query("SELECT 1 FROM payers WHERE id = $1 AND status = 'ACTIVE'", [a.payerId])).rows[0]) return null;
  let hotelId = a.hotelId;
  if (a.businessId) {
    // Chủ doanh nghiệp: doanh nghiệp phải còn ACTIVE; khách sạn đang làm việc (claim trong token) phải thuộc doanh nghiệp, nếu không từ chối.
    if (!(await db.query("SELECT 1 FROM businesses WHERE id = $1 AND status = 'ACTIVE'", [a.businessId])).rows[0]) return null;
    if (claimedHotel && claimedHotel !== a.hotelId) {
      if (!UUID.test(claimedHotel) || !(await db.query('SELECT 1 FROM hotels WHERE id = $1 AND business_id = $2', [claimedHotel, a.businessId])).rows[0]) return null;
      hotelId = claimedHotel;
    }
  }
  const roles = (await db.query<RoleDoc>('SELECT permissions FROM roles WHERE id = ANY($1::uuid[])', [a.roleIds])).rows;
  return { accountType: a.type, hotelId, businessId: a.businessId, payerId: a.payerId, payerStationId: a.payerStationId, permissions: [...new Set(roles.flatMap((r) => r.permissions))] };
}

// Token khách vãng lai không có quyền. Token tài khoản: tài khoản phải còn ACTIVE.
export async function resolveAuth(ctx: AuthContext): Promise<AuthContext> {
  if (ctx.kind === 'GUEST') return { ...ctx, permissions: [] };
  const key = `${ctx.sub}|${ctx.hotelId ?? ''}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    hit = { at: Date.now(), value: await load(ctx.sub, ctx.hotelId) };
    cache.set(key, hit);
  }
  if (!hit.value) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa');
  return { ...ctx, ...hit.value };
}
