import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { db, json } from '../../database/pg';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

const TTL_MS = 48 * 3600 * 1000;

// Idempotency-Key (FR-BKG-11, FR-PAY-03): cùng key + cùng body -> trả lại đúng kết quả cũ, không tạo thêm.
// Đặt SAU authenticate/validate, TRƯỚC handler. Lỗi/không-2xx thì xóa key để client thử lại được.
// shortcut: Postgres không có TTL tự động -> dọn key hết hạn của ĐÚNG cặp (scope,key) khi gặp lại; thêm job dọn định kỳ nếu bảng phình.
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

    await db.query('DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2 AND expire_at < now()', [fullScope, key]);
    const ins = await db.query(
      `INSERT INTO idempotency_keys (scope, key, request_hash, status, expire_at) VALUES ($1, $2, $3, 'IN_PROGRESS', $4) ON CONFLICT (scope, key) DO NOTHING`,
      [fullScope, key, requestHash, new Date(Date.now() + TTL_MS)],
    );
    if (ins.rowCount === 0) {
      const existing = (await db.query<{ requestHash: string; status: string; response?: { status: number; body: unknown } }>('SELECT request_hash, status, response FROM idempotency_keys WHERE scope = $1 AND key = $2', [fullScope, key])).rows[0];
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
        ? db.query("UPDATE idempotency_keys SET status = 'DONE', response = $3::jsonb WHERE scope = $1 AND key = $2", [fullScope, key, json({ status: res.statusCode, body })])
        : db.query('DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2', [fullScope, key]);
      op.catch((err) => logger.error({ err }, 'Không cập nhật được idempotency key'));
      return original(body);
    }) as typeof res.json;
    next();
  };
