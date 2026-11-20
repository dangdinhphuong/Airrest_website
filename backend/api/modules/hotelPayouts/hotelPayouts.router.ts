import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { AppError } from '../../../lib/errors';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor } from '../../../lib/zod';
import * as svc from '../../../services/settlement/payouts';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Bảng chi trả của CHÍNH khách sạn trong token (chỉ đọc, không nhận hotelId từ tham số). Chỉ hiện bảng đã khóa/đã trả.
export const hotelPayoutsRouter = Router();
const read = [authenticate, requirePermission(PERM.HOTEL_FINANCE_READ)];
const hotelOf = (req: { auth?: unknown }) => {
  const id = (req.auth as AuthContext).hotelId;
  if (!id) throw new AppError(422, 'HOTEL_REQUIRED', 'Tài khoản không gắn với khách sạn nào');
  return id;
};
const listQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Kỳ phải có dạng 'YYYY-MM'").optional(), limit: limitQuery, cursor: seqCursor.optional() });

hotelPayoutsRouter.get('/', ...read, validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof listQuery>;
  res.json(await svc.listOwnPayouts(hotelOf(req), { period: q.period, limit: q.limit, after: q.cursor }));
});
hotelPayoutsRouter.get('/:id', ...read, validate({ params: idParams }), async (req, res) => {
  res.json(await svc.getOwnPayout(hotelOf(req), (req.valid.params as { id: string }).id));
});
