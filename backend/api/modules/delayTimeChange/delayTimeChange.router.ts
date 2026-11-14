import { Router } from 'express';
import { idParams } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { acceptExtension, rejectExtension, rejectExtensionBody, requestExtensionBody, requestExtensions } from '../../../services/delay/extensions';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const A = (req: { auth?: unknown }) => req.auth as AuthContext;

// Đăng ký ở modules/index.ts: v1Router.use('/payer', payerExtensionsRouter); v1Router.use('/hotel/delay-offers', hotelExtensionsRouter).
export const payerExtensionsRouter = Router();
payerExtensionsRouter.post('/batches/:id/extensions/request', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ params: idParams, body: requestExtensionBody }), async (req, res) => {
  res.json(await requestExtensions(A(req), (req.valid.params as { id: string }).id, (req.valid.body as { offerIds?: string[] }).offerIds));
});

export const hotelExtensionsRouter = Router();
hotelExtensionsRouter.use(authenticate, requirePermission(PERM.BOOKING_DECIDE));
hotelExtensionsRouter.post('/:id/extension/accept', validate({ params: idParams }), async (req, res) => {
  res.json(await acceptExtension(A(req), (req.valid.params as { id: string }).id, String(req.id)));
});
hotelExtensionsRouter.post('/:id/extension/reject', validate({ params: idParams, body: rejectExtensionBody }), async (req, res) => {
  res.json(await rejectExtension(A(req), (req.valid.params as { id: string }).id, (req.valid.body as { reason?: string }).reason));
});
