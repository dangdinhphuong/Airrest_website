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

  // --- Cloudflare R2 (lưu media, tương thích S3). Thiếu thì API media trả 503, phần còn lại vẫn chạy.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(), // URL công khai của bucket (r2.dev hoặc domain riêng), không có dấu / cuối

  // --- VNPay (thanh toán thu tiền + hoàn). mock = cổng giả lập cục bộ, live = gọi VNPay thật (sandbox/production).
  // VNPAY_ENABLED=false: API đặt phòng từ chối paymentMethod=VNPAY.
  VNPAY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  VNPAY_MODE: z.enum(['mock', 'live']).default('mock'),
  VNPAY_TMN_CODE: z.string().optional(),
  VNPAY_HASH_SECRET: z.string().optional(),
  VNPAY_URL: z.string().url().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'), // trang thanh toán
  VNPAY_API_URL: z.string().url().default('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'), // querydr + refund
  VNPAY_RETURN_URL: z.string().url().default('http://localhost:5174/payment/result'), // VNPay đưa khách về trang FE này
  // IPN URL (https://<api>/v1/payments/vnpay/ipn) KHÔNG gửi trong request: khai báo trên cổng quản trị VNPay của merchant.
});

const parsed = schema
  .superRefine((e, ctx) => {
    if (e.VNPAY_MODE !== 'live') return;
    for (const k of ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'] as const) {
      if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} bắt buộc khi VNPAY_MODE=live` });
    }
  })
  .parse(process.env);

// Fail-fast: thiếu/sai biến môi trường thì dừng ngay khi khởi động.
export const env = parsed;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
