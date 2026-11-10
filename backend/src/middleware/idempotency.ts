import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { col } from '../db/collections';
import { AppError, isDuplicateKey } from '../lib/errors';
import { logger } from '../lib/logger';

const TTL_MS = 48 * 3600 * 1000;

// Idempotency-Key (FR-BKG-11, FR-PAY-03): cùng key + cùng body -> trả lại đúng kết quả cũ, không tạo thêm.
// Đặt SAU authenticate/validate, TRƯỚC handler. Lỗi/không-2xx thì xóa key để client thử lại được.
export const idempotent =
  (scope: string): RequestHandler =>
  async (req, res, next) => {
    const key = req.header('Idempotency-Key');
    if (!key || key.length < 8 || key.length > 128) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key (8–128 ký tự)');
    }
    const fullScope = `${scope}:${req.auth?.sub ?? req.ip}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');
    const keys = col.idempotencyKeys();

    try {
      await keys.insertOne({
        scope: fullScope,
        key,
        requestHash,
        status: 'IN_PROGRESS',
        createdAt: new Date(),
        expireAt: new Date(Date.now() + TTL_MS),
      } as never);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      const existing = await keys.findOne({ scope: fullScope, key });
      if (!existing) throw new AppError(409, 'REQUEST_IN_PROGRESS', 'Yêu cầu đang được xử lý');
      if (existing.requestHash !== requestHash) {
        throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã dùng cho nội dung khác');
      }
      if (existing.status === 'DONE' && existing.response) {
        res.setHeader('Idempotent-Replay', 'true');
        return void res.status(existing.response.status).json(existing.response.body);
      }
      throw new AppError(409, 'REQUEST_IN_PROGRESS', 'Yêu cầu đang được xử lý');
    }

    // Bọc res.json để lưu kết quả (2xx) hoặc nhả key (lỗi).
    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const op = ok
        ? keys.updateOne({ scope: fullScope, key }, { $set: { status: 'DONE', response: { status: res.statusCode, body } } })
        : keys.deleteOne({ scope: fullScope, key });
      op.catch((err) => logger.error({ err }, 'Không cập nhật được idempotency key'));
      return original(body);
    }) as typeof res.json;
    next();
  };
