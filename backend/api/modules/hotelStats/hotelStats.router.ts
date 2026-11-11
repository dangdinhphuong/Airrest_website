import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { AppError } from '../../../lib/errors';
import type { AuthContext } from '../../../lib/jwt';
import { getHotelStats } from '../../../services/dashboard/hotelStats';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { dateRangeQuery } from '../admin/dashboard.router';

// Thống kê của CHÍNH khách sạn trong token (không nhận hotelId từ tham số).
export const hotelStatsRouter = Router();
hotelStatsRouter.get('/', authenticate, requirePermission(PERM.BOOKING_READ), validate({ query: dateRangeQuery }), async (req, res) => {
  const auth = req.auth as AuthContext;
  if (!auth.hotelId) throw new AppError(422, 'HOTEL_REQUIRED', 'Tài khoản không gắn với khách sạn nào');
  res.json(await getHotelStats(auth.hotelId, req.valid.query as z.infer<typeof dateRangeQuery>));
});
