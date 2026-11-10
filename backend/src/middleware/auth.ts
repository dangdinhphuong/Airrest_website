import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { resolveAuth } from '../lib/authz';
import { verifyToken } from '../lib/jwt';

// Bắt buộc có Bearer token hợp lệ -> gán req.auth.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Thiếu token xác thực');
  }
  let claims;
  try {
    claims = verifyToken(header.slice(7));
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Token không hợp lệ hoặc đã hết hạn');
  }
  req.auth = await resolveAuth(claims); // nạp quyền từ DB (có cache ngắn)
  next();
};

// Kiểm quyền ở MÁY CHỦ cho mọi hành động (NFR-05). Chỉ tài khoản nội bộ (ACCOUNT) mới có quyền;
// token khách vãng lai (GUEST) không bao giờ qua được middleware này.
export const requirePermission =
  (...needed: string[]): RequestHandler =>
  (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
    if (auth.kind !== 'ACCOUNT' || !needed.every((p) => auth.permissions.includes(p))) {
      throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
    }
    next();
  };
