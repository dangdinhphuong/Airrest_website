import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  MONGO_URI: z.string().default('mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'),
  MONGO_DB: z.string().default('airrest'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET phải >= 16 ký tự'),
  DATA_ENC_KEY: z.string().min(16, 'DATA_ENC_KEY phải >= 16 ký tự'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  GUEST_TOKEN_EXPIRES_IN: z.string().default('30m'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_PASSWORD: z.string().default('ChangeMe123!'),
});

// Fail-fast: thiếu/sai biến môi trường thì dừng ngay khi khởi động.
export const env = schema.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
