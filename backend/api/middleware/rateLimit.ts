import { rateLimit } from 'express-rate-limit';

// Cùng dạng lỗi chuẩn { error: { code, message, details, requestId } } như errorHandler.
const tooMany = (req: { id?: unknown }) => ({
  error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau', details: undefined, requestId: String(req.id ?? '') },
});

// Giới hạn chung cho toàn bộ /api/v1.
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Chặt hơn cho endpoint dò thông tin (đăng nhập, tra cứu đơn): chống dò mã/SĐT.
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
export const strictRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isDev ? 100 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Riêng cho đăng ký/đăng nhập/đổi mật khẩu của khách: bộ đếm tách khỏi strictRateLimit để không ảnh hưởng đăng nhập nhân sự / tra cứu đơn.
export const passengerAuthRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isDev ? 100 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Xin URL tải tệp đính kèm hỗ trợ (endpoint công khai nhận file): chặn spam dung lượng.
export const attachmentRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Riêng cho tra cứu nhóm delay: cùng mức 10/phút/IP nhưng bộ đếm tách khỏi strictRateLimit (không khóa chéo đăng nhập/tra cứu đơn).
export const groupLookupRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Đăng ký doanh nghiệp công khai (ghi DB + băm mật khẩu): chặn spam hồ sơ theo IP.
export const businessRegisterRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Đổi mật khẩu nhân sự: bộ đếm riêng (10/phút/IP), tách khỏi đăng nhập để không khóa chéo.
export const staffPasswordRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Trợ lý chat AI: mỗi câu lạ gọi model trên CPU nên chặt theo IP; bộ đếm tách riêng để không khóa chéo tra cứu đơn/đăng nhập.
export const chatAiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isDev ? 100 : 40, // mỗi lượt chat có thể gọi 2 lần (hiểu ý + viết câu)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});
