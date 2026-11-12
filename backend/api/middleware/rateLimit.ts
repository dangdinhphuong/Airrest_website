import { rateLimit } from 'express-rate-limit';

// Cùng dạng lỗi chuẩn { error: { code, message, details, requestId } } như errorHandler.
const tooMany = (req: { id?: unknown }) => ({
  error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau', details: undefined, requestId: String(req.id ?? '') },
});

// Giới hạn chung cho toàn bộ /v1.
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Chặt hơn cho endpoint dò thông tin (đăng nhập, tra cứu đơn): chống dò mã/SĐT.
export const strictRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Riêng cho đăng ký/đăng nhập/đổi mật khẩu của khách: bộ đếm tách khỏi strictRateLimit để không ảnh hưởng đăng nhập nhân sự / tra cứu đơn.
export const passengerAuthRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});
