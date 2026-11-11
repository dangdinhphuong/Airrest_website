import { Router } from 'express';
import { idParams, staffMessageBody, ticketListQuery, ticketPatchBody, type StaffMessageBody, type TicketListQuery, type TicketPatchBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { addStaffMessage, getTicketAdmin, listTickets, updateTicket } from '../../../services/support/support.service';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Hàng đợi hỗ trợ cho CSKH (quyền support:handle). Tài khoản khách sạn không có quyền này.
export const adminSupportRouter = Router();
const need = requirePermission(PERM.SUPPORT_HANDLE);

adminSupportRouter.get('/support', need, validate({ query: ticketListQuery }), async (req, res) => {
  res.json(await listTickets(req.valid.query as TicketListQuery, req.auth as AuthContext));
});

adminSupportRouter.get('/support/:id', need, validate({ params: idParams }), async (req, res) => {
  res.json(await getTicketAdmin((req.valid.params as { id: string }).id));
});

adminSupportRouter.patch('/support/:id', need, validate({ params: idParams, body: ticketPatchBody }), async (req, res) => {
  const id = (req.valid.params as { id: string }).id;
  res.json({ ticket: await updateTicket(req.auth as AuthContext, id, req.valid.body as TicketPatchBody, String(req.id)) });
});

adminSupportRouter.post('/support/:id/messages', need, validate({ params: idParams, body: staffMessageBody }), async (req, res) => {
  const id = (req.valid.params as { id: string }).id;
  res.status(201).json({ message: await addStaffMessage(req.auth as AuthContext, id, req.valid.body as StaffMessageBody, String(req.id)) });
});
