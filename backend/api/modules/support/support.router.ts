import { Router } from 'express';
import { attachmentConfirmBody, attachmentUploadBody, createTicketBody, ticketLookupBody, ticketReplyBody, type AttachmentConfirmBody, type AttachmentUploadBody, type CreateTicketBody, type TicketLookupBody, type TicketReplyBody } from '@airrest/validation';
import { confirmAttachment, createTicket, guestReply, lookupTicket, requestAttachmentUpload } from '../../../services/support/support.service';
import { optionalPassenger } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { attachmentRateLimit, strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Khách gửi/xem/trả lời yêu cầu hỗ trợ bằng mã ticket + SĐT. Tra cứu dùng POST để SĐT không nằm trên URL.
export const supportRouter = Router();
supportRouter.use(strictRateLimit);

// Có Bearer hợp lệ của tài khoản khách -> ticket gắn vào tài khoản đó; không thì vẫn gửi như khách vãng lai.
supportRouter.post('/', optionalPassenger, validate({ body: createTicketBody }), idempotent('support.create'), async (req, res) => {
  res.status(201).json({ ticket: await createTicket(req.valid.body as CreateTicketBody, String(req.id), req.auth?.accountType === 'PASSENGER' ? req.auth.sub : undefined) });
});

supportRouter.post('/lookup', validate({ body: ticketLookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as TicketLookupBody;
  res.json({ ticket: await lookupTicket(code, phone) });
});

supportRouter.post('/reply', validate({ body: ticketReplyBody }), idempotent('support.reply'), async (req, res) => {
  const b = req.valid.body as TicketReplyBody;
  res.status(201).json({ ticket: await guestReply(b.code, b.phone, b.message, String(req.id)) });
});

// Ảnh/video làm bằng chứng: xin URL PUT ký sẵn (tải thẳng lên R2) rồi xác nhận để server kiểm tra kích thước/loại thật.
supportRouter.post('/attachments/upload-url', attachmentRateLimit, validate({ body: attachmentUploadBody }), idempotent('support.attachment'), async (req, res) => {
  const b = req.valid.body as AttachmentUploadBody;
  res.status(201).json(await requestAttachmentUpload(b.code, b.phone, b, String(req.id)));
});

supportRouter.post('/attachments/confirm', validate({ body: attachmentConfirmBody }), async (req, res) => {
  const b = req.valid.body as AttachmentConfirmBody;
  res.json({ attachment: await confirmAttachment(b.code, b.phone, b.attachmentId, String(req.id)) });
});
