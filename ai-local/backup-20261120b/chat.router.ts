import { Router } from 'express';
import { z } from 'zod';
import { understand } from '../../../services/chat/understand';
import { chatAiRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Công khai (khách chưa đăng nhập). Chỉ trả { intent, params }; AI tắt/lỗi thì intent "other" (không bao giờ 5xx vì AI).
export const chatRouter = Router();

chatRouter.post('/understand', chatAiRateLimit, validate({ body: z.object({ text: z.string().trim().min(1).max(500) }) }), async (req, res) => {
  const { text } = req.valid.body as { text: string };
  res.json(await understand(text));
});
