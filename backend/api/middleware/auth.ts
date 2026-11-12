import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { resolveAuth } from '../../services/authz';
import { verifyToken } from '../../lib/jwt';

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

// Đặt req.auth CHỈ khi có Bearer hợp lệ của tài khoản khách (PASSENGER) còn hoạt động; mọi trường hợp khác
// (không token, token sai/hết hạn, token nhân sự, token khách vãng lai, tài khoản khóa) coi như khách vãng lai, không báo lỗi.
export const optionalPassenger: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const claims = verifyToken(header.slice(7));
      if (claims.kind === 'ACCOUNT' && claims.accountType === 'PASSENGER') req.auth = await resolveAuth(claims);
    } catch {
      // bỏ qua: đặt phòng như khách vãng lai
    }
  }
  next();
};

// Cổng Admin: tài khoản khách bị chặn ngay từ cửa (403), trước khi kiểm quyền từng route.
export const denyPassenger: RequestHandler = (req, _res, next) => {
  if (req.auth?.accountType === 'PASSENGER') throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
  next();
};

// Chỉ tài khoản khách (PASSENGER) — dùng cho /v1/me/*.
export const requirePassenger: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  if (auth.kind !== 'ACCOUNT' || auth.accountType !== 'PASSENGER') throw new AppError(403, 'FORBIDDEN', 'Chỉ dành cho tài khoản khách');
  next();
};

// Kiểm quyền ở MÁY CHỦ cho mọi hành động (NFR-05). Chỉ tài khoản nội bộ (ACCOUNT) mới có quyền;
// token khách vãng lai (GUEST) không bao giờ qua được middleware này.
export const requirePermission =
  (...needed: string[]): RequestHandler =>
  (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
    // Tài khoản khách (PASSENGER) không có quyền nào: chặn tường minh, kể cả khi route khai báo thiếu quyền.
    if (auth.kind !== 'ACCOUNT' || auth.accountType === 'PASSENGER' || !needed.every((p) => auth.permissions.includes(p))) {
      throw new AppError(403, 'FORBIDDEN', 'Không đủ quyền thực hiện thao tác này');
    }
    next();
  };
