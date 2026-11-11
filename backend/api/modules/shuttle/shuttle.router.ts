import { Router } from 'express';
import { assignShuttleBody, createShuttleBody, idParams, lookupBody, shuttleCancelBody, shuttleListQuery, shuttleQuoteBody, shuttleStaffCancelBody, type AssignShuttleBody, type CreateShuttleBody, type LookupBody, type ShuttleListQuery, type ShuttleQuoteBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { assignShuttle, cancelShuttleByGuest, cancelShuttleByStaff, completeShuttle, createShuttleRequest, listGuestShuttles, listStaffShuttles, quoteShuttle } from '../../../services/shuttle/shuttle.service';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Khách: xe đưa đón gắn booking, xác thực bằng mã booking + SĐT.
export const guestShuttleRouter = Router();
guestShuttleRouter.use(strictRateLimit);

guestShuttleRouter.post('/quote', validate({ body: shuttleQuoteBody }), async (req, res) => {
  res.json({ quote: await quoteShuttle(req.valid.body as ShuttleQuoteBody) });
});
guestShuttleRouter.post('/', validate({ body: createShuttleBody }), idempotent('shuttle.create'), async (req, res) => {
  res.status(201).json({ shuttle: await createShuttleRequest(req.valid.body as CreateShuttleBody, String(req.id)) });
});
guestShuttleRouter.post('/lookup', validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  res.json({ shuttles: await listGuestShuttles(code, phone) });
});
guestShuttleRouter.post('/:id/cancel', validate({ params: idParams, body: shuttleCancelBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { code, phone } = req.valid.body as LookupBody;
  res.json({ shuttle: await cancelShuttleByGuest(id, code, phone, String(req.id)) });
});

// Nhân sự khách sạn / OPS (shuttle:handle). Xe của khách sạn khác -> 404.
export const hotelShuttleRouter = Router();
hotelShuttleRouter.use(authenticate, requirePermission(PERM.SHUTTLE_HANDLE));

hotelShuttleRouter.get('/', validate({ query: shuttleListQuery }), async (req, res) => {
  res.json(await listStaffShuttles(req.auth as AuthContext, req.valid.query as ShuttleListQuery));
});
hotelShuttleRouter.post('/:id/assign', validate({ params: idParams, body: assignShuttleBody }), async (req, res) => {
  res.json({ shuttle: await assignShuttle(req.auth as AuthContext, (req.valid.params as { id: string }).id, req.valid.body as AssignShuttleBody, String(req.id)) });
});
hotelShuttleRouter.post('/:id/complete', validate({ params: idParams }), async (req, res) => {
  res.json({ shuttle: await completeShuttle(req.auth as AuthContext, (req.valid.params as { id: string }).id, String(req.id)) });
});
hotelShuttleRouter.post('/:id/cancel', validate({ params: idParams, body: shuttleStaffCancelBody }), async (req, res) => {
  res.json({ shuttle: await cancelShuttleByStaff(req.auth as AuthContext, (req.valid.params as { id: string }).id, (req.valid.body as { note: string }).note, String(req.id)) });
});
