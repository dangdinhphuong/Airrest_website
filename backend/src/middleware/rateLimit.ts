import { rateLimit } from 'express-rate-limit';

const tooMany = {
  error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau' },
};

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
