import { Router } from 'express';
import { z } from 'zod';
import { normalize, normalizeBodySchema } from '../../../services/chat/normalize';
import { compose, directiveSchema, historySchema } from '../../../services/chat/reply';
import { extractTicket, ticketBodySchema } from '../../../services/chat/ticket';
import { understand } from '../../../services/chat/understand';
import { chatAiRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Công khai (khách chưa đăng nhập). Chỉ trả { intent, params }; AI tắt/lỗi thì intent "other" (không bao giờ 5xx vì AI).
export const chatRouter = Router();

chatRouter.post('/understand', chatAiRateLimit, validate({ body: z.object({ text: z.string().trim().min(1).max(500) }) }), async (req, res) => {
  const { text } = req.valid.body as { text: string };
  res.json(await understand(text));
});

// Viết câu trả lời tự nhiên cho việc frontend đã quyết định (hỏi mục nào, chào, từ chối...). reply = null: frontend dùng câu mẫu.
chatRouter.post('/reply', chatAiRateLimit, validate({ body: z.object({ directive: directiveSchema, history: historySchema }) }), async (req, res) => {
  const { directive, history } = req.valid.body as { directive: z.infer<typeof directiveSchema>; history: z.infer<typeof historySchema> };
  res.json({ reply: await compose(directive, history) });
});

// Dịch lời khách (en/zh/ko) sang tiếng Việt chuẩn để frontend chạy qua bộ phân tích tiếng Việt. vi = null: dùng nguyên văn; blocked: câu bảo mật/tiêm lệnh.
chatRouter.post('/normalize', chatAiRateLimit, validate({ body: normalizeBodySchema }), async (req, res) => {
  const { text } = req.valid.body as z.infer<typeof normalizeBodySchema>;
  res.json(await normalize(text));
});

// Đọc giúp chữ OCR của thẻ lên tàu (trình duyệt đã bỏ tên/mã đặt chỗ). ticket = null: không đọc được hoặc AI tắt/lỗi (frontend mời nhập tay).
chatRouter.post('/ticket', chatAiRateLimit, validate({ body: ticketBodySchema }), async (req, res) => {
  const { text } = req.valid.body as z.infer<typeof ticketBodySchema>;
  res.json({ ticket: await extractTicket(text) });
});
