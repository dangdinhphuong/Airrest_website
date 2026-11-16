import { Router } from 'express';
import { z } from 'zod';
import { idParams } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { confirmOffer, listHotelOffers, rejectOffer } from '../../../services/delay/offers';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Khách sạn xử lý yêu cầu đặt phòng của luồng delay (đăng ký ở modules/index.ts: v1Router.use('/hotel/delay-offers', hotelDelayRouter)).
export const hotelDelayRouter = Router();
hotelDelayRouter.use(authenticate, requirePermission(PERM.BOOKING_DECIDE));

const A = (req: { auth?: unknown }) => req.auth as AuthContext;
const listQuery = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED']).optional(), include: z.literal('extension').optional() });
const confirmBody = z.object({ roomNumbers: z.array(z.string().trim().min(1).max(20)).min(1).max(50) }).strict();
const rejectBody = z.object({ reason: z.string().trim().min(1).max(300) }).strict();

hotelDelayRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query as { status?: string; include?: string };
  res.json({ items: await listHotelOffers(A(req), q.status, q.include === 'extension') });
});
hotelDelayRouter.post('/:id/confirm', validate({ params: idParams, body: confirmBody }), async (req, res) => {
  res.json(await confirmOffer((req.valid.params as { id: string }).id, (req.valid.body as { roomNumbers: string[] }).roomNumbers, A(req), String(req.id)));
});
hotelDelayRouter.post('/:id/reject', validate({ params: idParams, body: rejectBody }), async (req, res) => {
  res.json(await rejectOffer((req.valid.params as { id: string }).id, (req.valid.body as { reason: string }).reason, A(req), String(req.id)));
});
