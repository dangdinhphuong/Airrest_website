import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, isDuplicateKey } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Không tìm thấy ${req.method} ${req.path}`));
};

// Mọi lỗi trả cùng một dạng: { error: { code, message, details?, requestId } }.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, details, requestId } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return send(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', err.issues);
  if (err?.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Body không phải JSON hợp lệ');
  if (err?.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  if (isDuplicateKey(err)) return send(409, 'DUPLICATE', 'Dữ liệu đã tồn tại');

  // Lỗi không lường trước: ghi log đầy đủ, KHÔNG lộ chi tiết cho client.
  logger.error({ err, requestId }, 'Lỗi không xử lý');
  return send(500, 'INTERNAL_ERROR', 'Lỗi hệ thống, vui lòng thử lại');
};
