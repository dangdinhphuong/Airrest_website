# Airrest Backend (base)

Khung Node.js cho BE API Airrest: **TypeScript + Express 5 + PostgreSQL (Supabase, driver `pg`) + Socket.io**.
Schema: [database/migrations/](database/migrations/) ([docs/postgres/](../docs/postgres/README.md)); thiết kế gốc theo tài liệu: [docs/mongodb/THIET_KE_MONGODB_AIRREST.md](../docs/mongodb/THIET_KE_MONGODB_AIRREST.md) · Yêu cầu: [docs/srs/SRS_V2_NenTang_Airrest.md](../docs/srs/SRS_V2_NenTang_Airrest.md).

> Đây là **base + ví dụ mẫu**, không phải nghiệp vụ đầy đủ. Chưa có: dữ liệu chuyến bay, bản đồ/xe, hủy/đổi/hoàn, thông báo, job nền (xem file xlsx kế hoạch dev).

## Chạy nhanh

Từ gốc monorepo (xem [../README.md](../README.md)):

```bash
npm install                    # một lần ở gốc
cp backend/.env.example backend/.env
# điền DATABASE_URL trong backend/.env (Supabase Session pooler) — hoặc DB local: docker compose --profile local up -d db
npm run db:migrate             # áp schema (database/migrations/*.sql)
npm run db:seed                # (tự migrate) khách sạn mẫu + 2 tài khoản
npm run dev:api                # http://localhost:3000
npm test                       # unit + HTTP (không cần DB)
npm run test:db                # thêm test tích hợp: tự bật Postgres nhúng (không cần Docker); hoặc TEST_DATABASE_URL (chỉ DB local)
npm run dev:db                 # Postgres nhúng bền cho dev (backend/.data/pg), in ra DATABASE_URL để đặt vào .env
```

Tài khoản mẫu (mật khẩu = `SEED_PASSWORD`, mặc định `ChangeMe123!`): `letan@demo.airrest.vn` (lễ tân, chỉ thấy khách sạn của mình), `admin@demo.airrest.vn` (vai trò SYSADMIN: toàn quyền Admin). Vai trò hệ thống OPS / SUPPORT / FINANCE / SYSADMIN định nghĩa ở `config/roles.ts` và seed vào `roles`.

## Cấu trúc

```
api/
  server.ts            khởi động: Postgres -> HTTP -> Socket.io -> bookingFeed; tắt êm (SIGTERM)
  app.ts               dựng Express (helmet, cors, log, rate limit, router, lỗi) — tách ra để test
  middleware/          auth (JWT + requirePermission), validate (zod), idempotency, rateLimit, errorHandler
  modules/<ten>/       *.router.ts; gắn ở modules/index.ts (logic nằm ở services/)
  realtime/            socket.ts (xác thực + phòng theo quyền), bookingFeed.ts (sự kiện đơn -> Socket.io)
services/              bookings/, payments/ (*.service.ts) + audit, authz (quyền nạp từ DB), systemConfig, systemRoles
database/              pg.ts (pool + withTransaction, camelCase), migrate.ts, migrations/*.sql, types.ts, scripts/ (migrate, seed)
config/                env (zod, fail-fast), permissions, roles, configKeys
lib/                   errors, jwt, password(scrypt), codes, money (VND nguyên), crypto, vnpay, logger, zod
tests/                 unit, http (middleware), *.integration (cần DB)
../packages/*          @airrest/{validation,business-logic,utils,shared-types}: zod schema, tồn phòng, phí DV, SĐT, kiểu chung
```

## API ví dụ

| Method & đường dẫn | Ai gọi | Minh họa |
|---|---|---|
| `GET /health`, `GET /ready` | LB/giám sát | liveness / readiness |
| `POST /v1/auth/login` | tài khoản nội bộ | scrypt, quyền gộp từ roles, rate limit chặt |
| `GET /v1/auth/me` | đã đăng nhập | middleware `authenticate` |
| `GET /v1/hotels?airport=HAN[&from&to]` · `GET /v1/hotels/:id` | công khai | phân trang keyset, chỉ trả trường công khai; kèm `rooms[]` (giá/đêm, **số phòng còn** trong cửa sổ `from→to`, mặc định 24 giờ tới, tối đa 31 ngày) và `features` (xe đưa đón, 24/24, theo giờ, gia đình, hủy miễn phí) suy từ tag `amenities` + `policy` (xem `services/hotels/catalog.ts`; không đổi schema) |
| `POST /v1/bookings` | khách vãng lai | **transaction T1**: khóa tồn → sweep-line → ghi đơn + giữ phòng + audit; **Idempotency-Key bắt buộc** |
| `POST /v1/bookings/lookup` | khách vãng lai | mã + SĐT, 404 chung khi sai, trả `guestToken` cho Socket.io |
| `GET /v1/hotel/bookings` | quyền `booking:read` | tự khóa theo `hotelId` trong token |
| `POST /v1/hotel/bookings/:id/check-in` | quyền `booking:checkin` | máy trạng thái bằng cập nhật có điều kiện + audit cùng transaction |
| `POST /v1/bookings` với `paymentMethod: "VNPAY"` | khách vãng lai | đơn `PENDING_PAYMENT` + giữ phòng `booking.hold.holdMinutes` phút + bản ghi `payments`; trả `paymentLink.payUrl`. Cần `VNPAY_ENABLED=true` |
| `POST /v1/payments/vnpay/link` | khách (mã + SĐT) | lấy lại / tạo lại link khi lần đầu lỗi hoặc link hỏng |
| `GET /v1/payments/vnpay/ipn` | **VNPay** gọi | kiểm `vnp_SecureHash`, lệch tiền → anomaly, lặp → bỏ qua, đến muộn → hoàn 100%; trả JSON `{RspCode, Message}` |
| `POST /v1/payments/vnpay/dev-simulate` | dev (chỉ `VNPAY_MODE=mock`, không production) | giả lập VNPay gọi IPN `{orderId, resultCode?, amount?}` (resultCode 0 = thành công) |
| `GET /v1/admin/payments?anomaly=true`, `GET /v1/admin/refunds` | `admin:payment:read` | giao dịch VNPay, lệnh hoàn, giao dịch bất thường |
| `POST /v1/admin/payments/reconcile`, `POST /v1/admin/refunds/:id/retry` | `admin:payment:manage` | đối soát gọi tay (truy vấn giao dịch treo >15', hết hạn đơn, xử lý hoàn đến hạn); thử lại lệnh `MANUAL_REQUIRED` |
| `POST /v1/admin/media/upload-url` | `admin:hotel:manage` | URL PUT ký sẵn (5 phút) để tải ảnh JPEG/PNG/WebP ≤ 5MB thẳng lên Cloudflare R2; cần `R2_*` (kiểm tra: `npm run storage:check`) |
| `GET /v1/admin/audit-logs` | `audit:read` | **ADM-09** lọc entity/actor/action/hotel/booking/thời gian, phân trang con trỏ; chỉ đọc |
| `GET/POST/PATCH /v1/admin/accounts`, `POST …/:id/reset-password`, `GET /v1/admin/roles` | `admin:account:manage` | **ADM-13** tài khoản Admin; chặn tự khóa, luôn còn ≥ 1 SYSADMIN |
| `GET /v1/admin/configs`, `GET …/:key/versions`, `PUT …/:key` | đọc `admin:config:read`; ghi theo từng khóa | **ADM-12** cấu hình có phiên bản + lịch hiệu lực; đơn lưu `pricing.params.configVersions` |
| `GET/POST/PATCH /v1/admin/hotels`, `…/:id/{approve,reject,suspend,activate}` | `admin:hotel:read` / `admin:hotel:manage` | **ADM-01** đăng ký đối tác (kèm tài khoản chủ), duyệt, tạm ngưng |
| `PUT /v1/admin/hotels/:id/payout-account`, `…/payout-account/{approve,reject}` | `admin:hotel:manage` / `admin:hotel:approve-sensitive` | **ADM-15** đổi tài khoản nhận tiền: mã hóa, người duyệt ≠ người đề xuất |
| `GET /v1/admin/hotels/:id/stats` | `admin:hotel:read` | **ADM-08** phòng tồn/có khách + doanh thu theo đơn |

Lỗi luôn có dạng `{ "error": { "code", "message", "details?", "requestId" } }` — FE rẽ nhánh theo `code`.

### API đã làm thêm (xem Swagger `/docs` để biết chi tiết từng route)

| Nhóm | Route chính | Quyền |
|---|---|---|
| Loại phòng + tồn + khóa phòng | `/v1/hotel/room-types`, `/:id/inventory`, `/v1/hotel/room-blocks` | `booking:read` / `room:manage` |
| Xác nhận / từ chối booking | `POST /v1/hotel/bookings/:id/confirm`, `/reject`; `GET /v1/hotel/bookings/:id` | `booking:decide` |
| Admin xem booking, dashboard | `/v1/admin/bookings`, `/v1/admin/dashboard`; khách sạn: `GET /v1/hotel/stats` | `admin:booking:read`, `admin:dashboard:read` |
| Đổi/hủy | khách `/v1/change-requests{,/quote,/lookup}`; nhân sự `/v1/hotel/change-requests` | `request:handle` |
| Hỗ trợ | khách `/v1/support{,/lookup,/reply}`; admin `/v1/admin/support` | `support:handle` |
| Xe đưa đón | khách `/v1/shuttle-requests`; nhân sự `/v1/hotel/shuttle-requests` | `shuttle:handle` |
| Chuyến bay (mô phỏng) | `GET /v1/flights/:code?date=`; admin `/v1/admin/flights` | `flight:manage` |

Booking mới của khách sạn bật duyệt tay vào `PENDING`, lễ tân xác nhận hoặc từ chối; đơn quá hạn chờ tự `EXPIRED` (quét mỗi `BOOKING_EXPIRY_SWEEP_SEC` giây, mặc định 60, `0` = tắt). Lệnh hoàn tiền phát sinh từ từ chối/hủy/đổi chỉ được GHI (`PENDING`, `due_at = infinity`), chưa thực thi vì luồng thanh toán tạm dừng.

## Socket.io

Kết nối với `auth: { token }` (JWT tài khoản hoặc `guestToken`). Server tự cho vào phòng theo quyền (client không tự chọn):

| Phòng | Ai | Sự kiện |
|---|---|---|
| `booking:{code}` | khách (guestToken) | `booking:updated` `{code,status,updatedAt}` |
| `hotel:{hotelId}:orders` | quyền `booking:read` | `order:new`, `order:updated` |
| `admin:alerts` | quyền `admin:alerts` | (chỗ gắn cảnh báo khẩn) |

Sự kiện do service phát **sau khi transaction commit** (`services/events.ts` → `realtime/bookingFeed.ts`), payload tối thiểu, không có PII. Client gửi `rooms:list` (có ack) để biết đang ở phòng nào.

## Cách thêm một tính năng

1. Thêm migration mới `database/migrations/NNN_ten.sql` (không sửa file đã áp) và kiểu vào `database/types.ts`.
2. Schema zod vào `packages/validation`, logic vào `services/<ten>/<ten>.service.ts`, router vào `api/modules/<ten>/`; gắn ở `api/modules/index.ts`.
3. Route cần đăng nhập: `authenticate` + `requirePermission(PERM.X)`; thêm quyền vào `config/permissions.ts`.
4. Thao tác ghi nhiều tài liệu/tiền/trạng thái: dùng `withTransaction`, ghi `writeAudit(..., session)` cùng transaction.
5. Route tạo/đổi dữ liệu mà client có thể gửi lặp: thêm `idempotent('<scope>')`.
6. Viết test (`tests/`), chạy `npm run typecheck && npm test`.

## Quy ước cần giữ

- Tiền: số nguyên VND, cột `bigint` (đọc ra `number`). Giá luôn tính lại ở server.
- Phạm vi dữ liệu khách sạn lấy từ **token**, không từ tham số (`hotelScope`).
- Không ghi PII vào log/event; log có redact sẵn cho `authorization`, `password`.
- Lỗi nghiệp vụ ném `AppError(status, code, message)`; lỗi lạ → 500 không lộ chi tiết.

## Giới hạn đã biết (shortcut)

- Admin: Mật khẩu ban đầu do người tạo đặt (chưa có luồng mời qua email / đổi mật khẩu lần đầu). Mã hóa tài khoản nhận tiền là AES-GCM một khóa (`DATA_ENC_KEY`), chưa xoay khóa/KMS. Cấu hình đọc DB mỗi lần, chưa cache.
- JWT chỉ chứa định danh (~200 byte, không phình theo số quyền); quyền nạp từ DB mỗi request, cache 30 giây/tiến trình (`lib/authz.ts`). Khóa/đổi vai trò có hiệu lực ngay trên bản API xử lý thay đổi, các bản khác chờ hết 30 giây. Chưa có refresh token/thu hồi phiên.
- VNPay: mặc định `VNPAY_MODE=mock` (không gọi mạng) — mock chỉ chứng minh logic khớp tài liệu VNPay 2.1.0, **chưa** khớp VNPay thật. Khi có khóa sandbox/production: đặt `VNPAY_MODE=live`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` (trang FE), và khai báo IPN URL `https://<api>/v1/payments/vnpay/ipn` trên cổng VNPay merchant (IPN URL không gửi trong request). `VNPAY_URL`/`VNPAY_API_URL` mặc định là sandbox, đổi sang URL production khi lên thật. **Chạy thử sandbox một lượt** (đặt → trả → IPN → hoàn). Chưa xác thực chữ ký phản hồi querydr/refund, `vnp_IpAddr` đang cố định `127.0.0.1`; chưa có scheduler (đối soát gọi tay qua `/reconcile`); chưa làm chi trả khách sạn, thu thêm khi đổi đơn, hoàn một phần.
- Realtime: sự kiện đơn chỉ phát trong một tiến trình API; chạy nhiều bản API cần Postgres LISTEN/NOTIFY hoặc Supabase Realtime (và adapter cho Socket.io). Không dùng Supabase Auth/Realtime/REST: backend nối thẳng Postgres bằng `DATABASE_URL`, xác thực bằng JWT riêng.
- Supabase: TLS bật nhưng chưa ghim CA (`database/pg.ts`); bảng `idempotency_keys` chưa có job dọn định kỳ (chỉ dọn key hết hạn khi gặp lại); chưa bật Row Level Security (API là cửa duy nhất vào DB — hãy bật RLS deny-all cho các bảng nếu mở REST của Supabase ra ngoài).
- `createBooking` mới hỗ trợ 1 loại phòng, theo đêm, trả tại khách sạn hoặc VNPay; giá đọc từ `system_configs`.
- Khóa idempotency không chặn hai request *đang chạy* cùng key với body khác ngoài trả 422/409.
- Test tích hợp chạy trên Postgres nhúng (embedded-postgres), chưa thử trên Supabase thật; chưa có CI.

## Swagger

Chạy API rồi mở `http://localhost:3000/docs` (JSON: `/openapi.json`). Đăng nhập ở `POST /v1/auth/login`, bấm **Authorize**, dán token. Spec viết tay ở `api/openapi.ts`, thêm route mới thì cập nhật file đó.
