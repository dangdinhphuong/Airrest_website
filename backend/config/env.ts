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
  SHUTTLE_SIM_ACCEPT_DELAY_S: z.coerce.number().int().min(0).default(15), // SIM_AUTO: tài xế mô phỏng tự nhận chuyến OFFERED sau số giây này (0 = tắt, để tự thử bằng app tài xế)
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

  // --- Trợ lý chat dùng AI local (Ollama). Tắt (mặc định) hoặc lỗi/quá hạn thì /v1/chat/understand trả intent "other" và chatbot chạy bản từ khóa.
  AI_CHAT_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'), // Ollama chỉ nghe localhost; KHÔNG đưa cổng này qua tunnel
  OLLAMA_MODEL: z.string().default('qwen2.5:3b-instruct'),
  AI_CHAT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),

  // --- Cloudflare R2 (lưu media, tương thích S3). Thiếu thì API media trả 503, phần còn lại vẫn chạy.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(), // URL công khai của bucket (r2.dev hoặc domain riêng), không có dấu / cuối

  // --- SePay (cổng thanh toán, https://developer.sepay.vn). Khách được chuyển sang trang SePay bằng form POST có chữ ký HMAC-SHA256 (khóa SEPAY_SECRET_KEY);
  // SePay gọi IPN (POST JSON, header X-Secret-Key = SEPAY_IPN_SECRET, khai báo ở Cổng thanh toán > Cấu hình > IPN, kiểu xác thực SECRET_KEY).
  // mock = không gọi mạng (dev/test). SEPAY_ENABLED=false: đặt phòng từ chối paymentMethod=SEPAY.
  SEPAY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SEPAY_MODE: z.enum(['mock', 'live']).default('mock'),
  SEPAY_MERCHANT_ID: z.string().optional(),
  SEPAY_SECRET_KEY: z.string().optional(), // khóa merchant: ký form checkout
  SEPAY_IPN_SECRET: z.string().optional(), // khóa IPN (KHÁC khóa merchant): SePay gửi trong header X-Secret-Key
  SEPAY_PAYMENT_METHOD: z.enum(['BANK_TRANSFER', 'CARD', 'NAPAS_BANK_TRANSFER']).default('BANK_TRANSFER'), // SePay bắt buộc payment_method: BANK_TRANSFER = QR chuyển khoản, CARD = thẻ quốc tế
  SEPAY_CHECKOUT_URL: z.string().url().default('https://pay.sepay.vn/v1/checkout/init'), // sandbox: dùng URL sandbox trong tài liệu SePay
  SEPAY_RETURN_URL: z.string().url().default('http://localhost:5174/payment/result'), // SePay đưa khách về trang FE này (kèm status=success|error|cancel)
  SEPAY_IPN_URL: z.string().url().default('http://localhost:3000/v1/payments/sepay/ipn'), // API công khai SePay gọi; origin của nó cũng là nơi phục vụ trang chuyển hướng checkout
});

const parsed = schema
  .superRefine((e, ctx) => {
    // Xe ngoài mô phỏng tạo liên kết GIẢ cho khách bấm: cấm bật tường minh ở production.
    if (e.NODE_ENV === 'production' && e.SHUTTLE_SIM_AUTO === true) {
      ctx.addIssue({ code: 'custom', path: ['SHUTTLE_SIM_AUTO'], message: 'SHUTTLE_SIM_AUTO=true không được dùng ở production (tự đặt xe ngoài với liên kết giả)' });
    }
    // Chuyến/hành khách mô phỏng lẫn vào dữ liệu thật của đơn vị chi trả: cấm bật tường minh ở production.
    if (e.NODE_ENV === 'production' && e.DELAY_SIM_ENABLED === true) {
      ctx.addIssue({ code: 'custom', path: ['DELAY_SIM_ENABLED'], message: 'DELAY_SIM_ENABLED=true không được dùng ở production (tạo chuyến/hành khách mô phỏng)' });
    }
    // Không có SEPAY_IPN_SECRET thì IPN không xác thực được -> ai cũng giả mạo "đã thanh toán": bắt buộc khi live, và cấm mock ở production.
    if (e.SEPAY_MODE === 'live') {
      for (const k of ['SEPAY_MERCHANT_ID', 'SEPAY_SECRET_KEY', 'SEPAY_IPN_SECRET'] as const) {
        if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} bắt buộc khi SEPAY_MODE=live` });
      }
    }
    if (e.SEPAY_ENABLED && e.SEPAY_MODE === 'mock' && e.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['SEPAY_MODE'], message: 'SEPAY_ENABLED ở production yêu cầu SEPAY_MODE=live' });
    }
  })
  .transform((e) => ({ ...e, SHUTTLE_SIM_AUTO: e.SHUTTLE_SIM_AUTO ?? e.NODE_ENV !== 'production', DELAY_SIM_ENABLED: e.DELAY_SIM_ENABLED ?? e.NODE_ENV !== 'production' }))
  .parse(process.env);

// Fail-fast: thiếu/sai biến môi trường thì dừng ngay khi khởi động.
export const env = parsed;
export const publicWebUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim());
