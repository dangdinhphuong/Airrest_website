import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from '../config/env';
import { logger } from '../lib/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiRateLimit } from './middleware/rateLimit';
import { healthRouter } from './modules/health/health.router';
import { v1Router } from './modules/index';

// Tách khỏi server.ts để test bằng supertest mà không cần mở cổng / kết nối socket.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // đứng sau reverse proxy/LB: lấy IP thật cho rate limit

  app.use(
    pinoHttp({
      logger,
      // Mỗi request một id, trả lại ở header để lần theo log (khớp `requestId` trong lỗi và audit).
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/v1', apiRateLimit, v1Router);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
