import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, withTransaction } from '../../database/pg';
import { bookingFromRow, type AccountDoc, type BookingStatus } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import { signAccountToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { toGuestView } from '../bookings/bookings.service';
import { writeAudit } from '../audit';

// Luật tên đăng nhập khớp mock FE (apps/web/src/mock/users.js): tối đa 50 ký tự, không giống email/SĐT (BR-002: không chứa "@" hoặc dãy ≥ 6 chữ số).
export const USERNAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const usernameSchema = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1, 'Nhập tên đăng nhập.')
      .max(USERNAME_MAX, `Tên đăng nhập tối đa ${USERNAME_MAX} ký tự.`)
      .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Tên đăng nhập chứa ký tự không hợp lệ.')
      .refine((s) => !/@|\d{6,}/.test(s), 'Không nhập email hoặc số điện thoại. Airrest không thu thông tin liên hệ (BR-002).'),
  );
export const passengerPassword = z.string().min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`).max(PASSWORD_MAX);

export const registerBody = z.object({
  username: usernameSchema,
  password: passengerPassword,
  fullName: z.string().trim().max(100).optional(),
});
export const loginBody = z.object({ username: z.string().max(200), password: z.string().min(1).max(PASSWORD_MAX) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: passengerPassword });
export const meBookingsQuery = z.object({
  status: z.enum(['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().min(0).optional(),
});

// Băm giả (tính một lần) để đăng nhập tên không tồn tại tốn thời gian tương đương -> không dò được username qua độ trễ.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomUUID()));

export const passengerView = (a: Pick<AccountDoc, 'id' | 'username' | 'fullName'>) => ({
  id: a.id,
  type: 'PASSENGER' as const,
  username: a.username,
  fullName: a.fullName,
  permissions: [] as string[],
});

export async function registerPassenger(input: z.infer<typeof registerBody>, requestId?: string) {
  const fullName = input.fullName?.trim() || input.username;
  const passwordHash = await hashPassword(input.password);
  let acc: AccountDoc;
  try {
    acc = await withTransaction(async (tx) => {
      const created = (
        await tx.query<AccountDoc>(
          `INSERT INTO accounts (type, username, password_hash, full_name, status, role_ids) VALUES ('PASSENGER', $1, $2, $3, 'ACTIVE', '{}'::uuid[]) RETURNING *`,
          [input.username, passwordHash, fullName],
        )
      ).rows[0]!;
      await writeAudit({ actor: { type: 'PASSENGER', id: created.id }, action: 'PASSENGER.REGISTER', entity: { type: 'account', id: created.id }, requestId }, tx);
      return created;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'USERNAME_TAKEN', 'Tên đăng nhập này đã được dùng. Chọn tên khác.');
    throw e;
  }
  return { token: signAccountToken({ sub: acc.id, accountType: 'PASSENGER' }), user: passengerView(acc) };
}

export async function loginPassenger(input: z.infer<typeof loginBody>) {
  const acc = (await db.query<AccountDoc>("SELECT * FROM accounts WHERE type = 'PASSENGER' AND lower(username) = lower($1)", [input.username.normalize('NFC').trim()])).rows[0];
  const ok = await verifyPassword(input.password, acc?.passwordHash ?? (await getDummyHash()));
  // Cùng một lỗi cho "không có tài khoản", "sai mật khẩu" và "tài khoản bị khóa" để không lộ username nào tồn tại.
  if (!acc || !ok || acc.status !== 'ACTIVE') throw new AppError(401, 'INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
  return { token: signAccountToken({ sub: acc.id, accountType: 'PASSENGER' }), user: passengerView(acc) };
}

export async function changePassengerPassword(accountId: string, input: z.infer<typeof changePasswordBody>, requestId?: string) {
  const acc = (await db.query<AccountDoc>("SELECT * FROM accounts WHERE id = $1 AND type = 'PASSENGER'", [accountId])).rows[0];
  if (!acc) throw new AppError(401, 'ACCOUNT_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa');
  if (!(await verifyPassword(input.currentPassword, acc.passwordHash))) throw new AppError(400, 'WRONG_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
  if (input.newPassword === input.currentPassword) throw new AppError(422, 'SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  const passwordHash = await hashPassword(input.newPassword);
  await withTransaction(async (tx) => {
    await tx.query('UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1', [accountId, passwordHash]);
    // Không ghi mật khẩu vào nhật ký.
    await writeAudit({ actor: { type: 'PASSENGER', id: accountId }, action: 'PASSENGER.CHANGE_PASSWORD', entity: { type: 'account', id: accountId }, requestId }, tx);
  });
}

// Đơn của chính người gọi (account_id = sub). Keyset theo seq giảm dần, nextCursor = seq cuối của trang. Chỉ trả trường khách được phép thấy.
export async function listPassengerBookings(accountId: string, q: z.infer<typeof meBookingsQuery>) {
  const params: unknown[] = [accountId];
  const where = ['account_id = $1'];
  if (q.status) where.push(`status = $${params.push(q.status as BookingStatus)}`);
  if (q.cursor !== undefined) where.push(`seq < $${params.push(q.cursor)}`);
  const rows = (await db.query(`SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)).rows.map(bookingFromRow);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((b) => ({ ...toGuestView(b), guest: { fullName: b.guest.fullName, phone: b.guest.phone }, createdAt: b.createdAt })),
    nextCursor: rows.length > q.limit ? page[page.length - 1]?.seq : null,
  };
}

