import { Router } from 'express';
import { db } from '../../db/mongo';

export const healthRouter = Router();

// Liveness: tiến trình còn sống (không đụng DB).
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: sẵn sàng nhận request (DB phản hồi). Dùng cho load balancer / k8s.
healthRouter.get('/ready', async (_req, res) => {
  try {
    await db().command({ ping: 1 });
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});
