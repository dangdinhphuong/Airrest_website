import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthContext {
  kind: 'ACCOUNT' | 'GUEST';
  sub: string;
  accountType?: 'HOTEL' | 'DRIVER' | 'ADMIN' | 'PASSENGER';
  hotelId?: string;
  permissions: string[];
  bookingCode?: string; // chỉ với kind = GUEST
}

type Expires = SignOptions['expiresIn'];

// Token chỉ chứa định danh. Quyền + hotelId được nạp lại ở máy chủ (lib/authz.ts) để token luôn nhỏ và quyền luôn mới.
export const signAccountToken = (ctx: { sub: string; accountType: NonNullable<AuthContext['accountType']> }): string =>
  jwt.sign({ ...ctx, kind: 'ACCOUNT' }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as Expires });

// Token ngắn hạn cho khách vãng lai sau khi tra cứu đơn đúng (mã + SĐT) -> dùng cho Socket.io.
export const signGuestToken = (bookingCode: string): string =>
  jwt.sign({ kind: 'GUEST', sub: bookingCode, bookingCode }, env.JWT_SECRET, {
    expiresIn: env.GUEST_TOKEN_EXPIRES_IN as Expires,
  });

// Trả claims thô (chưa có permissions) — dùng resolveAuth() để nạp quyền.
export const verifyToken = (token: string): AuthContext =>
  ({ permissions: [], ...(jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as object) }) as unknown as AuthContext;
