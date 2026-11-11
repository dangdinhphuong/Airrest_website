import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  // Chuỗi kết nối Postgres (Supabase: Project Settings -> Database -> Connection string; nên dùng Session pooler, port 5432).
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/airrest'),
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'), // auto: bật TLS trừ khi host là localhost
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET phải >= 16 ký tự'),
  DATA_ENC_KEY: z.string().min(16, 'DATA_ENC_KEY phải >= 16 ký tự'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  GUEST_TOKEN_EXPIRES_IN: z.string().default('30m'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_PASSWORD: z.string().default('ChangeMe123!'),

  // --- MoMo (thanh toán thu tiền + hoàn). mock = cổng giả lập cục bộ, live = gọi MoMo thật (sandbox/production).
  // MOMO_ENABLED=false: API đặt phòng từ chối paymentMethod=MOMO (BA OQ-2-10: MoMo bật khi qua cổng pháp lý).
  MOMO_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MOMO_MODE: z.enum(['mock', 'live']).default('mock'),
  MOMO_PARTNER_CODE: z.string().optional(),
  MOMO_ACCESS_KEY: z.string().optional(),
  MOMO_SECRET_KEY: z.string().optional(),
  MOMO_PUBLIC_KEY: z.string().optional(), // chỉ cần cho API mã hóa RSA (chi hộ); thu tiền/hoàn không dùng
  MOMO_ENDPOINT: z.string().url().default('https://test-payment.momo.vn'),
  MOMO_REDIRECT_URL: z.string().url().default('http://localhost:5174/payment/result'), // MoMo đưa khách về trang FE này
  MOMO_IPN_URL: z.string().url().default('http://localhost:3000/v1/payments/momo/ipn'), // phải là URL công khai khi live
});

const parsed = schema
  .superRefine((e, ctx) => {
    if (e.MOMO_MODE !== 'live') return;
    for (const k of ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'] as const) {
      if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} bắt buộc khi MOMO_MODE=live` });
    }
  })
  .parse(process.env);

// Fail-fast: thiếu/sai biến môi trường thì dừng ngay khi khởi động.
export const env = parsed;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
