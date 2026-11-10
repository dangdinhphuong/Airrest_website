# Airrest Backend (base)

Khung Node.js cho BE API Airrest: **TypeScript + Express 5 + MongoDB (driver chính thức) + Socket.io**.
Thiết kế dữ liệu: [docs/mongodb/THIET_KE_MONGODB_AIRREST.md](../docs/mongodb/THIET_KE_MONGODB_AIRREST.md) · Yêu cầu: [docs/srs/SRS_V2_NenTang_Airrest.md](../docs/srs/SRS_V2_NenTang_Airrest.md).

> Đây là **base + ví dụ mẫu**, không phải nghiệp vụ đầy đủ. Chưa có: MoMo, dữ liệu chuyến bay, bản đồ/xe, hủy/đổi/hoàn, thông báo, job nền (xem file xlsx kế hoạch dev).

## Chạy nhanh

```bash
cd backend
cp .env.example .env
docker compose up -d          # MongoDB replica set 1 nút (bắt buộc: transaction + change stream)
npm install
npm run db:seed               # khách sạn mẫu + 2 tài khoản + index
npm run dev                   # http://localhost:3000
npm test                      # unit + HTTP (không cần DB)
npm run test:db               # thêm test tích hợp (cần MongoDB ở MONGO_URI)
```

Tài khoản mẫu (mật khẩu = `SEED_PASSWORD`, mặc định `ChangeMe123!`): `letan@demo.airrest.vn` (lễ tân, chỉ thấy khách sạn của mình), `admin@demo.airrest.vn` (vai trò SYSADMIN: toàn quyền Admin). Vai trò hệ thống OPS / SUPPORT / FINANCE / SYSADMIN định nghĩa ở `src/config/roles.ts` và seed vào `roles`.

## Cấu trúc

```
src/
  server.ts            khởi động: Mongo -> HTTP -> Socket.io -> Change Stream; tắt êm (SIGTERM)
  app.ts               dựng Express (helmet, cors, log, rate limit, router, lỗi) — tách ra để test
  config/              env (zod, fail-fast), permissions (danh mục quyền), pricing (mặc định)
  db/                  mongo.ts (kết nối + withTransaction), collections.ts (tên + kiểu), indexes.ts, types.ts
  lib/                 errors, jwt, password(scrypt), phone, codes, money (VND nguyên), inventory (tồn phòng), audit, logger
  middleware/          auth (JWT + requirePermission), validate (zod), idempotency, rateLimit, errorHandler
  modules/<ten>/       *.router.ts (+ *.schema.ts, *.service.ts khi có logic); gắn ở modules/index.ts
  realtime/            socket.ts (xác thực + phòng theo quyền), changeStreams.ts (Mongo -> Socket.io)
  scripts/             indexes.ts, seed.ts
tests/                 unit, http (middleware), booking.integration (cần DB)
```

## API ví dụ

| Method & đường dẫn | Ai gọi | Minh họa |
|---|---|---|
| `GET /health`, `GET /ready` | LB/giám sát | liveness / readiness |
| `POST /v1/auth/login` | tài khoản nội bộ | scrypt, quyền gộp từ roles, rate limit chặt |
| `GET /v1/auth/me` | đã đăng nhập | middleware `authenticate` |
| `GET /v1/hotels?airport=HAN` · `GET /v1/hotels/:id` | công khai | validate query, phân trang keyset, chỉ trả trường công khai |
| `POST /v1/bookings` | khách vãng lai | **transaction T1**: khóa tồn → sweep-line → ghi đơn + giữ phòng + audit; **Idempotency-Key bắt buộc** |
| `POST /v1/bookings/lookup` | khách vãng lai | mã + SĐT, 404 chung khi sai, trả `guestToken` cho Socket.io |
| `GET /v1/hotel/bookings` | quyền `booking:read` | tự khóa theo `hotelId` trong token |
| `POST /v1/hotel/bookings/:id/check-in` | quyền `booking:checkin` | máy trạng thái bằng cập nhật có điều kiện + audit cùng transaction |
| `GET /v1/admin/audit-logs` | `audit:read` | **ADM-09** lọc entity/actor/action/hotel/booking/thời gian, phân trang con trỏ; chỉ đọc |
| `GET/POST/PATCH /v1/admin/accounts`, `POST …/:id/reset-password`, `GET /v1/admin/roles` | `admin:account:manage` | **ADM-13** tài khoản Admin; chặn tự khóa, luôn còn ≥ 1 SYSADMIN |
| `GET /v1/admin/configs`, `GET …/:key/versions`, `PUT …/:key` | đọc `admin:config:read`; ghi theo từng khóa | **ADM-12** cấu hình có phiên bản + lịch hiệu lực; đơn lưu `pricing.params.configVersions` |
| `GET/POST/PATCH /v1/admin/hotels`, `…/:id/{approve,reject,suspend,activate}` | `admin:hotel:read` / `admin:hotel:manage` | **ADM-01** đăng ký đối tác (kèm tài khoản chủ), duyệt, tạm ngưng |
| `PUT /v1/admin/hotels/:id/payout-account`, `…/payout-account/{approve,reject}` | `admin:hotel:manage` / `admin:hotel:approve-sensitive` | **ADM-15** đổi tài khoản nhận tiền: mã hóa, người duyệt ≠ người đề xuất |
| `GET /v1/admin/hotels/:id/stats` | `admin:hotel:read` | **ADM-08** phòng tồn/có khách + doanh thu theo đơn |

Lỗi luôn có dạng `{ "error": { "code", "message", "details?", "requestId" } }` — FE rẽ nhánh theo `code`.

## Socket.io

Kết nối với `auth: { token }` (JWT tài khoản hoặc `guestToken`). Server tự cho vào phòng theo quyền (client không tự chọn):

| Phòng | Ai | Sự kiện |
|---|---|---|
| `booking:{code}` | khách (guestToken) | `booking:updated` `{code,status,updatedAt}` |
| `hotel:{hotelId}:orders` | quyền `booking:read` | `order:new`, `order:updated` |
| `admin:alerts` | quyền `admin:alerts` | (chỗ gắn cảnh báo khẩn) |

Sự kiện đến từ **Change Stream** `bookings` (xem `realtime/changeStreams.ts`), payload tối thiểu, không có PII. Client gửi `rooms:list` (có ack) để biết đang ở phòng nào.

## Cách thêm một tính năng

1. Thêm kiểu vào `db/types.ts` và collection vào `db/collections.ts`; index vào `db/indexes.ts`.
2. Tạo `modules/<ten>/` với `schema` (zod) → `service` → `router`; gắn vào `modules/index.ts`.
3. Route cần đăng nhập: `authenticate` + `requirePermission(PERM.X)`; thêm quyền vào `config/permissions.ts`.
4. Thao tác ghi nhiều tài liệu/tiền/trạng thái: dùng `withTransaction`, ghi `writeAudit(..., session)` cùng transaction.
5. Route tạo/đổi dữ liệu mà client có thể gửi lặp: thêm `idempotent('<scope>')`.
6. Viết test (`tests/`), chạy `npm run typecheck && npm test`.

## Quy ước cần giữ

- Tiền: số nguyên VND, ghi bằng `vnd()` (Long). Giá luôn tính lại ở server.
- Phạm vi dữ liệu khách sạn lấy từ **token**, không từ tham số (`hotelScope`).
- Không ghi PII vào log/event; log có redact sẵn cho `authorization`, `password`.
- Lỗi nghiệp vụ ném `AppError(status, code, message)`; lỗi lạ → 500 không lộ chi tiết.

## Giới hạn đã biết (shortcut)

- Admin: Mật khẩu ban đầu do người tạo đặt (chưa có luồng mời qua email / đổi mật khẩu lần đầu). Mã hóa tài khoản nhận tiền là AES-GCM một khóa (`DATA_ENC_KEY`), chưa xoay khóa/KMS. Cấu hình đọc DB mỗi lần, chưa cache.
- JWT chỉ chứa định danh (~200 byte, không phình theo số quyền); quyền nạp từ DB mỗi request, cache 30 giây/tiến trình (`lib/authz.ts`). Khóa/đổi vai trò có hiệu lực ngay trên bản API xử lý thay đổi, các bản khác chờ hết 30 giây. Chưa có refresh token/thu hồi phiên.
- Change Stream: resume token chỉ giữ trong bộ nhớ (mất sự kiện khi restart); chạy nhiều bản API sẽ cần adapter Redis cho Socket.io.
- `createBooking` mới hỗ trợ 1 loại phòng, theo đêm, trả tại khách sạn; giá cấu hình đang là hằng số (`config/pricing.ts`), chưa đọc `system_configs`.
- Khóa idempotency không chặn hai request *đang chạy* cùng key với body khác ngoài trả 422/409.
- Test tích hợp chạy trên MongoDB replica set; chưa có CI.
