import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { normalize } from './normalize';
import { compose, directiveSchema } from './reply';
import { understand } from './understand';

// Làm nóng model lúc API khởi động: chờ Ollama sẵn sàng rồi chạy thử cả ba loại prompt (hiểu ý, viết câu, dịch lời khách nước ngoài) để mỗi loại có sẵn bộ nhớ đệm;
// không thì câu chat đầu tiên của khách phải đọc lại ~1000 token prompt (10-15 giây). Chạy nền, không bao giờ làm API lỗi.
export async function warmUpChat(): Promise<void> {
  if (!env.AI_CHAT_ENABLED) return;
  try {
    for (let i = 0; i < 40; i += 1) {
      const up = await fetch(`${env.OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
      if (up) break;
      if (i === 39) return logger.warn('chat.warmup: Ollama chưa sẵn sàng, bỏ qua');
      await new Promise((r) => setTimeout(r, 3000));
    }
    const t0 = Date.now();
    await understand('xin chào');
    await compose(directiveSchema.parse({ type: 'greet', userText: 'xin chào', template: 'Xin chào!' }), []);
    await normalize('hello, I need a room near the airport'); // câu tiếng nước ngoài đầu tiên không phải đọc lại cả prompt dịch (8 giây+ khi nguội)
    logger.info({ ms: Date.now() - t0 }, 'chat.warmup xong');
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'chat.warmup lỗi (bỏ qua)');
  }
}
