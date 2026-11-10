import { ObjectId } from 'mongodb';
import { col } from '../db/collections';
import { AppError } from './errors';
import type { AuthContext } from './jwt';

// Quyền KHÔNG nằm trong JWT (token chỉ ~200 byte, không phình theo số quyền -> không vượt giới hạn header).
// Mỗi request đọc lại tài khoản + vai trò, cache ngắn trong bộ nhớ: đổi vai trò/khóa tài khoản có hiệu lực sau tối đa TTL.
// shortcut: cache theo từng tiến trình; chạy nhiều bản API thì bản khác chờ hết TTL (30s), nâng lên Redis/Change Stream khi cần.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Pick<AuthContext, 'permissions' | 'hotelId' | 'accountType'> | null }>();

// Gọi ngay sau khi sửa/khóa tài khoản để bản API này áp dụng tức thì.
export const forgetAuth = (sub: string): void => void cache.delete(sub);

async function load(sub: string) {
  if (!ObjectId.isValid(sub)) return null;
  const a = await col.accounts().findOne({ _id: new ObjectId(sub) });
  if (!a || a.status !== 'ACTIVE') return null;
  const roles = await col.roles().find({ _id: { $in: a.roleIds } }).toArray();
  return { accountType: a.type, hotelId: a.hotelId?.toHexString(), permissions: [...new Set(roles.flatMap((r) => r.permissions))] };
}

// Token khách vãng lai không có quyền. Token tài khoản: tài khoản phải còn ACTIVE.
export async function resolveAuth(ctx: AuthContext): Promise<AuthContext> {
  if (ctx.kind === 'GUEST') return { ...ctx, permissions: [] };
  let hit = cache.get(ctx.sub);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    hit = { at: Date.now(), value: await load(ctx.sub) };
    cache.set(ctx.sub, hit);
  }
  if (!hit.value) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa');
  return { ...ctx, ...hit.value };
}
