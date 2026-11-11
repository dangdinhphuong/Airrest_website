import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../../lib/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

// Validate đầu vào bằng zod ở BIÊN hệ thống. Dữ liệu đã parse nằm ở req.valid (Express 5:
// req.query chỉ đọc nên không ghi đè được).
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      req.valid = {
        body: schemas.body?.parse(req.body),
        query: schemas.query?.parse(req.query),
        params: schemas.params?.parse(req.params),
      };
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return next(new AppError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', e.issues));
      }
      next(e);
    }
  };
