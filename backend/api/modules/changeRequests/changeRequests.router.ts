import { Router } from 'express';
import { createChangeRequestBody, decideBody, idParams, lookupBody, rejectRequestBody, staffRequestsQuery, type CreateChangeRequestBody, type LookupBody, type StaffRequestsQuery } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { approveRequest, createChangeRequest, listGuestRequests, listStaffRequests, quoteCancellation, rejectRequest } from '../../../services/changeRequests/changeRequests.service';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Khách (không cần tài khoản) gửi yêu cầu hủy/đổi ngày bằng mã booking + SĐT. Mọi route chặn dò mã (strictRateLimit).
export const guestChangeRequestsRouter = Router();
guestChangeRequestsRouter.use(strictRateLimit);

guestChangeRequestsRouter.post('/quote', validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  res.json({ quote: await quoteCancellation(code, phone) });
});

guestChangeRequestsRouter.post('/', validate({ body: createChangeRequestBody }), idempotent('changeRequest.create'), async (req, res) => {
  const request = await createChangeRequest(req.valid.body as CreateChangeRequestBody, String(req.id));
  const { hotelId: _h, requestedBy: _r, decidedBy: _d, ...view } = request;
  res.status(201).json({ request: view });
});

guestChangeRequestsRouter.post('/lookup', validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  res.json({ requests: await listGuestRequests(code, phone) });
});

// Nhân sự khách sạn (hoặc admin có hotel:scope:all) xử lý yêu cầu. Khách sạn khác -> 404 (không lộ tồn tại).
export const hotelChangeRequestsRouter = Router();
hotelChangeRequestsRouter.use(authenticate, requirePermission(PERM.REQUEST_HANDLE));

hotelChangeRequestsRouter.get('/', validate({ query: staffRequestsQuery }), async (req, res) => {
  res.json(await listStaffRequests(req.auth as AuthContext, req.valid.query as StaffRequestsQuery));
});

hotelChangeRequestsRouter.post('/:id/approve', validate({ params: idParams, body: decideBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ request: await approveRequest(req.auth as AuthContext, id, (req.valid.body as { note?: string }).note, String(req.id)) });
});

hotelChangeRequestsRouter.post('/:id/reject', validate({ params: idParams, body: rejectRequestBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ request: await rejectRequest(req.auth as AuthContext, id, (req.valid.body as { note: string }).note, String(req.id)) });
});
