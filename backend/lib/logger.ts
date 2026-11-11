import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Không bao giờ ghi dữ liệu nhạy cảm vào log.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password', '*.passwordHash'],
});
