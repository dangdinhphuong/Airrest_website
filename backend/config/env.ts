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
  GUEST_TOKEN_EXPIRES_IN: z.string().default('2h'), // đủ cho một phiên xem chuyến xe; khách tra cứu lại khi hết hạn
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_PASSWORD: z.string().default('ChangeMe123!'),
  // Chu kỳ quét đơn chờ khách sạn xác nhận quá hạn (giây). 0 = tắt (khi đó chỉ đối soát tay /reconcile và tra cứu mới làm hết hạn đơn).
  BOOKING_EXPIRY_SWEEP_SEC: z.coerce.number().int().min(0).default(60),

  // --- Xe đưa đón có điều phối (đội xe của khách sạn)
  SHUTTLE_DISPATCH_SWEEP_SEC: z.coerce.number().int().min(0).default(60), // chu kỳ quét điều phối yêu cầu xe sắp tới giờ; 0 = tắt
  SHUTTLE_STALE_TRIP_HOURS: z.coerce.number().int().min(0).default(6), // vòng quét tự đóng chuyến chưa xong khi giờ đón và lần cập nhật cuối đều quá số giờ này; 0 = tắt
  SHUTTLE_DISPATCH_LEAD_MIN: z.coerce.number().int().min(0).default(30), // điều phối khi còn <= số phút này tới giờ đón
  SHUTTLE_VEHICLE_WINDOW_MIN: z.coerce.number().int().min(1).default(90), // xe bận nếu có chuyến khác lệch giờ đón < số phút này
  SHUTTLE_EXTERNAL_OVERDUE_MIN: z.coerce.number().int().min(0).default(10), // chuyến NEEDS_EXTERNAL "quá hạn" khi còn <= số phút này tới giờ đón
  SHUTTLE_CALL_NOW_MIN: z.coerce.number().int().min(1).default(15), // "Gọi xe ngay": giờ đón = bây giờ + số phút này
  // Mô phỏng vị trí xe (chỉ chuyến OWN). SIM_AUTO mặc định: bật ngoài production (tự đổi trạng thái để demo), tắt ở production.
  SHUTTLE_SIM_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  SHUTTLE_SIM_AUTO: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  SHUTTLE_SIM_SPEED_KMH: z.coerce.number().min(1).max(300).default(40),
  SHUTTLE_SIM_TIME_SCALE: z.coerce.number().min(0.1).max(100000).default(1), // tua nhanh: thời gian mô phỏng = thời gian thật x hệ số
  SHUTTLE_SIM_TICK_MS: z.coerce.number().int().min(200).default(2000),
  // Nút "Tạo chuyến bay delay" (mô phỏng, đi qua cổng kết nối): mặc định bật ngoài production, tắt ở production.
  DELAY_SIM_ENABLED: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  OSRM_URL: z.string().url().default('https://router.project-osrm.org'), // máy chủ demo công cộng; lỗi/timeout 5s -> đường thẳng
  // Tên miền được phép cho liên kết chia sẻ chuyến xe ngoài (khớp hậu tố theo nhãn: 'grab.com' khớp 'r.grab.com', không khớp 'evilgrab.com').
  // Mặc định là phỏng đoán: PHẢI kiểm tra tên miền chia sẻ thực tế của Grab / Xanh SM trước khi chạy thật.
  EXTERNAL_RIDE_LINK_HOSTS: z.string().default('grab.com,xanhsm.com'),

  // --- Email giao dịch (outbox + nodemailer). Thiếu SMTP_URL: chỉ ghi log, KHÔNG gửi (dev). Production thiếu SMTP_URL không chặn khởi động; transport cảnh báo khi dùng.
  SMTP_URL: z.string().min(1).optional(), // vd smtps://user:pass@smtp.example.com:465
  EMAIL_FROM: z.string().min(3).default('Airrest <no-reply@airrest.vn>'),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'), // base dựng link tra cứu trong email, không có dấu / cuối

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

  // --- MoMo v2 (captureWallet). mock = không gọi mạng; live = gọi MOMO_ENDPOINT (mặc định sandbox). MOMO_ENABLED=false: đặt phòng từ chối paymentMethod=MOMO.
  MOMO_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MOMO_MODE: z.enum(['mock', 'live']).default('mock'),
  MOMO_PARTNER_CODE: z.string().optional(),
  MOMO_ACCESS_KEY: z.string().optional(),
  MOMO_SECRET_KEY: z.string().optional(),
  MOMO_ENDPOINT: z.string().url().default('https://test-payment.momo.vn'),
  MOMO_RETURN_URL: z.string().url().default('http://localhost:5174/payment/result'), // MoMo đưa khách về trang FE này
  MOMO_IPN_URL: z.string().url().default('http://localhost:3000/v1/payments/momo/ipn'), // API công khai MoMo gọi POST JSON
});

const parsed = schema
  .superRefine((e, ctx) => {
    if (e.VNPAY_MODE === 'live') {
      for (const k of ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} bắt buộc khi VNPAY_MODE=live` });
      }
    }
    // Mock dùng khóa sandbox công khai: ai cũng giả mạo được IPN -> cấm bật ở production.
    if (e.MOMO_ENABLED && e.MOMO_MODE === 'mock' && e.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['MOMO_MODE'], message: 'MOMO_ENABLED ở production yêu cầu MOMO_MODE=live' });
    }
    // Xe ngoài mô phỏng tạo liên kết GIẢ cho khách bấm: cấm bật tường minh ở production.
    if (e.NODE_ENV === 'production' && e.SHUTTLE_SIM_AUTO === true) {
      ctx.addIssue({ code: 'custom', path: ['SHUTTLE_SIM_AUTO'], message: 'SHUTTLE_SIM_AUTO=true không được dùng ở production (tự đặt xe ngoài với liên kết giả)' });
    }
    // Chuyến/hành khách mô phỏng lẫn vào dữ liệu thật của đơn vị chi trả: cấm bật tường minh ở production.
    if (e.NODE_ENV === 'production' && e.DELAY_SIM_ENABLED === true) {
      ctx.addIssue({ code: 'custom', path: ['DELAY_SIM_ENABLED'], message: 'DELAY_SIM_ENABLED=true không được dùng ở production (tạo chuyến/hành khách mô phỏng)' });
    }
    if (e.MOMO_MODE === 'live') {
      for (const k of ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} bắt buộc khi MOMO_MODE=live` });
      }
    }
  })
  .transform((e) => ({ ...e, SHUTTLE_SIM_AUTO: e.SHUTTLE_SIM_AUTO ?? e.NODE_ENV !== 'production', DELAY_SIM_ENABLED: e.DELAY_SIM_ENABLED ?? e.NODE_ENV !== 'production' }))
  .parse(process.env);

// Fail-fast: thiếu/sai biến môi trường thì dừng ngay khi khởi động.
export const env = parsed;
export const publicWebUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
