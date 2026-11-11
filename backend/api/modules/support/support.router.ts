import { Router } from 'express';
import { createTicketBody, ticketLookupBody, ticketReplyBody, type CreateTicketBody, type TicketLookupBody, type TicketReplyBody } from '@airrest/validation';
import { createTicket, guestReply, lookupTicket } from '../../../services/support/support.service';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Khách gửi/xem/trả lời yêu cầu hỗ trợ bằng mã ticket + SĐT. Tra cứu dùng POST để SĐT không nằm trên URL.
export const supportRouter = Router();
supportRouter.use(strictRateLimit);

supportRouter.post('/', validate({ body: createTicketBody }), idempotent('support.create'), async (req, res) => {
  res.status(201).json({ ticket: await createTicket(req.valid.body as CreateTicketBody, String(req.id)) });
});

supportRouter.post('/lookup', validate({ body: ticketLookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as TicketLookupBody;
  res.json({ ticket: await lookupTicket(code, phone) });
});

supportRouter.post('/reply', validate({ body: ticketReplyBody }), idempotent('support.reply'), async (req, res) => {
  const b = req.valid.body as TicketReplyBody;
  res.status(201).json({ ticket: await guestReply(b.code, b.phone, b.message, String(req.id)) });
});
