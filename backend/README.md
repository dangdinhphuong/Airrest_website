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
lib/                   errors, jwt, password(scrypt), codes, money (VND nguyên), crypto, vnpay, momo, logger, zod
tests/                 unit, http (middleware), *.integration (cần DB)
../packages/*          @airrest/{validation,business-logic,utils,shared-types}: zod schema, tồn phòng, phí DV, SĐT, kiểu chung
```

## API ví dụ

| Method & đường dẫn | Ai gọi | Minh họa |
|---|---|---|
| `GET /health`, `GET /ready` | LB/giám sát | liveness / readiness |
| `POST /v1/auth/login` | tài khoản nội bộ | scrypt, quyền gộp từ roles, rate limit chặt |
| `GET /v1/auth/me` | đã đăng nhập | middleware `authenticate` |
| `GET /v1/hotels?airport=HAN[&from&to]` (bỏ `airport` = toàn hệ thống, luôn ở chế độ tìm kiếm, mặc định `sort=rating`; `minReviews=N` lọc khách sạn có ít nhất N lượt đánh giá) · `GET /v1/hotels/:id` | công khai | phân trang keyset, chỉ trả trường công khai; kèm `rooms[]` (giá/đêm, **số phòng còn** trong cửa sổ `from→to`, mặc định 24 giờ tới, tối đa 31 ngày) và `features` (xe đưa đón, 24/24, theo giờ, gia đình, hủy miễn phí) suy từ tag `amenities` + `policy` (xem `services/hotels/catalog.ts`; không đổi schema) |
| `POST /v1/bookings` | khách vãng lai | **transaction T1**: khóa tồn → sweep-line → ghi đơn + giữ phòng + audit; **Idempotency-Key bắt buộc** |
| `POST /v1/bookings/lookup` | khách vãng lai | mã + SĐT, 404 chung khi sai, trả `guestToken` cho Socket.io |
| `GET /v1/hotel/bookings` | quyền `booking:read` | tự khóa theo `hotelId` trong token |
| `POST /v1/hotel/bookings/:id/check-in` | quyền `booking:checkin` | máy trạng thái bằng cập nhật có điều kiện + audit cùng transaction |
| `POST /v1/hotel/bookings/:id/check-out`, `…/:id/no-show` | quyền `booking:checkin` | CHECKED_IN → CHECKED_OUT; CONFIRMED (đã tới/qua ngày nhận phòng giờ VN) → NO_SHOW (không đụng tiền); khách sạn khác → 404, sai trạng thái → 409 `INVALID_STATE` |
| `GET/PATCH /v1/hotel/profile`, `POST /v1/hotel/media/upload-url` | quyền `room:manage` | hồ sơ khách sạn tự quản (mô tả, SĐT, giờ đóng lễ tân, chính sách hủy, tiện ích, ảnh); không sửa tài khoản nhận tiền/trạng thái/mã/sân bay/hoa hồng; ảnh lưu `hotels.images` (khóa R2), trả ở `GET /v1/hotels/:id` field `images` |
| `POST /v1/bookings` với `paymentMethod: "VNPAY"` | khách vãng lai | đơn `PENDING_PAYMENT` + giữ phòng `booking.hold.holdMinutes` phút + bản ghi `payments`; trả `paymentLink.payUrl`. Cần `VNPAY_ENABLED=true` |
| `POST /v1/bookings` với `paymentMethod: "MOMO"` | khách vãng lai | như VNPay nhưng qua MoMo (`captureWallet`); cần `MOMO_ENABLED=true`, tắt → 409 `MOMO_DISABLED` |
| `GET /v1/payments/methods` | công khai | cổng đang bật `{methods:[{id,label,mode?}]}`; `AT_HOTEL` luôn có, không lộ khóa |
| `POST /v1/payments/link` (cũ: `/vnpay/link`, `/momo/link` cùng handler) | khách (mã + SĐT) | lấy lại / tạo lại link theo cổng của đơn khi lần đầu lỗi hoặc link hỏng |
| `POST /v1/payments/momo/ipn` | **MoMo** gọi (POST JSON) | kiểm `signature` HMAC-SHA256, lệch tiền → anomaly, lặp → bỏ qua, đến muộn → hoàn 100%; trả 204 (đã nhận) hoặc 400 (sai chữ ký) |
| `POST /v1/payments/momo/dev-simulate` | dev (chỉ `MOMO_MODE=mock`, không production) | giả lập MoMo gọi IPN `{orderId, resultCode?, amount?}` |
| `GET /v1/payments/vnpay/ipn` | **VNPay** gọi | kiểm `vnp_SecureHash`, lệch tiền → anomaly, lặp → bỏ qua, đến muộn → hoàn 100%; trả JSON `{RspCode, Message}` |
| `POST /v1/payments/vnpay/dev-simulate` | dev (chỉ `VNPAY_MODE=mock`, không production) | giả lập VNPay gọi IPN `{orderId, resultCode?, amount?}` (resultCode 0 = thành công) |
| `GET /v1/admin/payments?anomaly=true&method=MOMO\|VNPAY`, `GET /v1/admin/refunds` | `admin:payment:read` | giao dịch VNPay, lệnh hoàn, giao dịch bất thường |
| `POST /v1/admin/payments/reconcile`, `POST /v1/admin/refunds/:id/retry` | `admin:payment:manage` | đối soát gọi tay (truy vấn giao dịch treo >15', hết hạn đơn, xử lý hoàn đến hạn); thử lại lệnh `MANUAL_REQUIRED` |
| `POST /v1/admin/media/upload-url` | `admin:hotel:manage` | URL PUT ký sẵn (5 phút) để tải ảnh JPEG/PNG/WebP ≤ 5MB thẳng lên Cloudflare R2; cần `R2_*` (kiểm tra: `npm run storage:check`) |
| `POST /v1/auth/passenger/register`, `POST /v1/auth/passenger/login` | khách (tên đăng nhập, không email) | tài khoản khách `accounts.type='PASSENGER'`; mật khẩu >= 8; trùng tên -> 409 `USERNAME_TAKEN`; sai tên/mật khẩu -> 401 `INVALID_CREDENTIALS` (băm giả khi không có user); rate limit riêng 10/phút; trả `{token, user}` |
| `PATCH /v1/me/password`, `GET /v1/me/bookings` | token khách | đổi mật khẩu (204); đơn của chính mình (keyset `cursor`/`nextCursor`, `status`, `limit`) |
| `POST /v1/bookings` kèm Bearer của khách | khách đã đăng nhập (tùy chọn) | gắn `bookings.account_id`; token sai/khóa/nhân sự -> coi như vãng lai |
| `GET /v1/admin/permissions`, `GET/POST /v1/admin/roles`, `PATCH/DELETE /v1/admin/roles/:id` | `admin:account:manage` | vai trò tùy chỉnh (`roles.system=false`, key `custom_*`); chỉ gán quyền mình có (`PERMISSION_ESCALATION`, người có đủ bộ quyền SYSADMIN gán được mọi quyền); vai trò hệ thống bất biến (`ROLE_SYSTEM_IMMUTABLE`); đang dùng -> `ROLE_IN_USE`; hiệu lực ngay (`forgetAuth`) |
| `GET /v1/admin/audit-logs` | `audit:read` | **ADM-09** lọc entity/actor/action/hotel/booking/thời gian, phân trang con trỏ; chỉ đọc |
| `GET/POST/PATCH /v1/admin/accounts`, `POST …/:id/reset-password` | `admin:account:manage` | **ADM-13** tài khoản Admin (`adminRole` 4 vai trò cũ HOẶC `roleId` vai trò tùy chỉnh); chặn tự khóa/tự đổi vai trò, luôn còn ≥ 1 SYSADMIN, không sửa/đặt lại mật khẩu tài khoản có quyền cao hơn mình; danh sách không bao giờ có tài khoản khách |
| `GET /v1/admin/configs`, `GET …/:key/versions`, `PUT …/:key` | đọc `admin:config:read`; ghi theo từng khóa | **ADM-12** cấu hình có phiên bản + lịch hiệu lực; đơn lưu `pricing.params.configVersions` |
| `GET/POST/PATCH /v1/admin/hotels`, `…/:id/{approve,reject,suspend,activate}` | `admin:hotel:read` / `admin:hotel:manage` | **ADM-01** đăng ký đối tác (kèm tài khoản chủ), duyệt, tạm ngưng |
| `PUT /v1/admin/hotels/:id/payout-account`, `…/payout-account/{approve,reject}` | `admin:hotel:manage` / `admin:hotel:approve-sensitive` | **ADM-15** đổi tài khoản nhận tiền: mã hóa, người duyệt ≠ người đề xuất |
| `GET /v1/admin/hotels/:id/stats` | `admin:hotel:read` | **ADM-08** phòng tồn/có khách + doanh thu theo đơn |

Lỗi luôn có dạng `{ "error": { "code", "message", "details?", "requestId" } }` — FE rẽ nhánh theo `code`.

### API đã làm thêm (xem Swagger `/docs` để biết chi tiết từng route)

| Nhóm | Route chính | Quyền |
|---|---|---|
| Loại phòng + tồn + khóa phòng (PATCH `{active:true}` mở bán lại loại đã ngừng dùng) | `/v1/hotel/room-types`, `/:id/inventory`, `/v1/hotel/room-blocks` | `booking:read` / `room:manage` |
| Xác nhận / từ chối booking | `POST /v1/hotel/bookings/:id/confirm`, `/reject`; `GET /v1/hotel/bookings/:id` | `booking:decide` |
| Admin xem booking, dashboard | `/v1/admin/bookings`, `/v1/admin/dashboard`; khách sạn: `GET /v1/hotel/stats` | `admin:booking:read`, `admin:dashboard:read` |
| Đổi/hủy | khách `/v1/change-requests{,/quote,/lookup}`; nhân sự `/v1/hotel/change-requests` | `request:handle` |
| Hỗ trợ | khách `/v1/support{,/lookup,/reply}`; admin `/v1/admin/support` | `support:handle` |
| Xe đưa đón | khách `/v1/shuttle-requests`; nhân sự `/v1/hotel/shuttle-requests` | `shuttle:handle` |
| Chuyến bay (mô phỏng) | `GET /v1/flights/:code?date=`; admin `GET/POST /v1/admin/flights`, `PATCH/DELETE …/:id` (xóa chỉ khi chưa có lịch sử đổi, else 409 `FLIGHT_IN_USE`; trùng mã+ngày 409 `FLIGHT_EXISTS`) | `flight:manage` |

Booking mới của khách sạn bật duyệt tay vào `PENDING`, lễ tân xác nhận hoặc từ chối; đơn quá hạn chờ tự `EXPIRED` (quét mỗi `BOOKING_EXPIRY_SWEEP_SEC` giây, mặc định 60, `0` = tắt). Lệnh hoàn tiền phát sinh từ từ chối/hủy/đổi chỉ được GHI (`PENDING`, `due_at = infinity`), chưa thực thi vì luồng thanh toán tạm dừng.

## Xe đưa đón có điều phối (P1)

Kế hoạch: [../docs/PLAN_XE_DUA_DON.md](../docs/PLAN_XE_DUA_DON.md). P1 = dữ liệu, điều phối, API; mô phỏng vị trí, theo dõi và realtime (P2) mô tả ở mục "Xe đưa đón: mô phỏng + realtime (P2)" bên dưới.

**Luồng:** khách tạo yêu cầu xe (`passengers` tùy chọn, mặc định = `guests` của đơn, không được vượt `guests`) -> khi đơn `CONFIRMED`/`CHECKED_IN` và còn <= `SHUTTLE_DISPATCH_LEAD_MIN` phút tới giờ đón, `dispatchRequest` (một transaction, khóa yêu cầu + xe của khách sạn) chọn xe rảnh bằng `planVehicles` (ít xe nhất đủ chỗ; một xe đủ thì xe nhỏ nhất) -> mỗi xe một chuyến `OFFERED`; phần thiếu -> MỘT chuyến `EXTERNAL` `NEEDS_EXTERNAL` (`external_reason=NO_FREE_VEHICLE`) -> tài xế `accept/reject/start/arrived/onboard/dropped-off` (tài xế từ chối: loại xe đó, điều lại phần thiếu, hết xe -> xe ngoài) -> mọi chuyến `DROPPED_OFF` thì `shuttle_requests.status='DONE'`. Xe ngoài: nhân sự nhập hãng + liên kết chia sẻ (Grab/Xanh SM) -> `ACCEPTED`, rồi bấm `arrived/onboard/dropped-off`. Xe "rảnh" = `active` + có tài xế đang hoạt động + không có chuyến OFFERED..ONBOARD nào lệch giờ đón < `SHUTTLE_VEHICLE_WINDOW_MIN` phút. Điều phối chạy ở: (a) đơn được xác nhận/thanh toán xong (yêu cầu đã tới hạn), (b) tạo yêu cầu/gọi xe ngay khi giờ đón trong `LEAD` phút, (c) vòng quét `dispatchDueRequests` mỗi `SHUTTLE_DISPATCH_SWEEP_SEC` giây.

Endpoint cũ `/v1/hotel/shuttle-requests/*` (gán tay tên/SĐT, complete, cancel) vẫn chạy; yêu cầu đã có chuyến thì chuyến là nguồn sự thật: assign/complete cũ trả 409 `USE_TRIP_FLOW`, cancel cũ hủy cả chuyến chưa lên xe. Tiền xe của yêu cầu tạo SAU khi có đơn (`billed=false`): không đổi (không thu/hoàn riêng). Xe đặt cùng đơn: xem mục "Đặt xe cùng đơn".

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `SHUTTLE_DISPATCH_SWEEP_SEC` | 60 | chu kỳ quét điều phối (0 = tắt) |
| `SHUTTLE_STALE_TRIP_HOURS` | 6 | cùng vòng quét: tự đóng (`CANCELLED`, `cancel_note=auto_expired`, actor SYSTEM) chuyến OFFERED/ACCEPTED/EN_ROUTE/ARRIVED/NEEDS_EXTERNAL khi giờ đón và lần cập nhật cuối đều cũ hơn số giờ này; không đổi phí (0 = tắt) |
| `SHUTTLE_DISPATCH_LEAD_MIN` | 30 | điều phối khi còn <= số phút này tới giờ đón |
| `SHUTTLE_VEHICLE_WINDOW_MIN` | 90 | xe bận nếu có chuyến khác lệch giờ đón < số phút này |
| `SHUTTLE_EXTERNAL_OVERDUE_MIN` | 10 | chuyến NEEDS_EXTERNAL `overdue` khi còn <= số phút này tới giờ đón (chỉ cảnh báo, không tự hủy) |
| `SHUTTLE_CALL_NOW_MIN` | 15 | "Gọi xe ngay": giờ đón = bây giờ + số phút này |
| `EXTERNAL_RIDE_LINK_HOSTS` | `grab.com,xanhsm.com` | tên miền được phép cho liên kết chia sẻ xe ngoài (khớp hậu tố theo nhãn). **Mặc định là phỏng đoán: phải kiểm tra tên miền chia sẻ thực tế của Grab và Xanh SM trước khi chạy thật** (sai -> 422 `EXTERNAL_LINK_NOT_ALLOWED`) |

| Method & đường dẫn | Quyền | Ghi chú |
|---|---|---|
| `GET/POST /v1/hotel/vehicles`, `PATCH/DELETE …/:id` | `fleet:manage` | biển số duy nhất trong khách sạn; xóa: chưa có chuyến -> xóa hẳn, đã có -> ngừng hoạt động |
| `GET/POST /v1/hotel/drivers`, `PATCH/DELETE …/:id` | `fleet:manage` | tạo = tài khoản `DRIVER` + hồ sơ + gán xe; mật khẩu ban đầu >= 12 ký tự do quản lý nhập, không trả lại; `photoKey` = `drivers/<năm>/<uuid>.<jpg\|png\|webp>` (xin ở `POST /v1/hotel/media/upload-url` với `folder:"drivers"`, cần `fleet:manage`); phản hồi `photoUrl` null nếu thiếu `R2_PUBLIC_BASE_URL` |
| `GET /v1/hotel/shuttle/board` | `fleet:manage` hoặc `shuttle:handle` | yêu cầu + chuyến + cảnh báo + xe rảnh/bận |
| `POST /v1/hotel/shuttle-trips/:id/{external,reassign,cancel,arrived,onboard,dropped-off}` | `fleet:manage` hoặc `shuttle:handle` | xe ngoài + gán tay; `arrived/onboard/dropped-off` chỉ cho chuyến EXTERNAL |
| `GET /v1/driver/trips`, `POST …/:id/{accept,reject,start,arrived,onboard,dropped-off}` | `trip:drive` | tài xế (đăng nhập `/v1/auth/login`) chỉ thấy/thao tác chuyến của mình, chuyến khác -> 404 |
| `POST /v1/driver/trips/:id/no-show` | `trip:drive` | "Khách không có mặt": chỉ chuyến của mình đang `ARRIVED` -> `CANCELLED` (`cancel_note=no_show`), hết chuyến còn hiệu lực thì yêu cầu xe cũng `CANCELLED`; không đổi phí/hoàn tiền; khách thấy `cancelReason` |
| `POST /v1/shuttle-requests/call-now` | khách (mã + SĐT) | chiều TO_AIRPORT, đơn CONFIRMED/CHECKED_IN |
| `GET /v1/hotel/bookings/:id/events`, `GET /v1/admin/bookings/:id/events` | `booking:read` / `admin:booking:read` | nhật ký đơn, cursor `seq` |

Khách sạn công khai cho khách tự gọi xe (khi chuyến `NEEDS_EXTERNAL`): `booking.hotel = {name, address, location?}` (tạo đơn + lookup) và `hotel` ở `POST /v1/shuttle-requests/lookup`, `GET /v1/track/shuttle`; chỉ trường đã public ở `GET /v1/hotels/:id`, không SĐT/email/id nội bộ.

Khách (tra cứu `POST /v1/bookings/lookup` và `POST /v1/shuttle-requests/lookup`) nhận thêm `stage` (`BOOKED|PICKUP_IN|CHECKED_IN|CHECKED_OUT|PICKUP_OUT|DONE|CANCELLED`), `shuttles[].trips[]` đã làm sạch (xe/tài xế chỉ lộ sau khi tài xế nhận; trước đó `SEARCHING`) và `events[{at,type}]`. Vai trò hệ thống mới: `hotel_driver` (chỉ `trip:drive`); `hotel_owner` có thêm `fleet:manage` (DB cũ: migration 014 tự cập nhật).

### Seed xe + tài xế mẫu (thủ công)

`npm run db:seed:fleet` (cần đã chạy `db:seed`; chạy lại an toàn, không chạy tự động ở docker) tạo 17 xe + 17 tài xế mẫu (account `DRIVER`, vai trò `hotel_driver`, không ảnh, mật khẩu = `SEED_PASSWORD`, SĐT mẫu `+8490700xxx`, biển `29A-9xxxx`, tên bắt đầu bằng "Mẫu") cho: HAN-01 (4 chỗ x2), HAN-02 (4/7/16), SGN-01 (4/7/16), DAD-01 (4/7/16), CXR-01 (7/16), PQC-01 (4/7), HPH-01 (4/7). Email tài xế: `taixe.<mã-khách-sạn-chữ-thường>.<n>@airrest.vn`, vd `taixe.han-01.1@airrest.vn`. **`HAN-03` cố ý KHÔNG có xe** để thử luồng hết xe -> xe ngoài (quản lý: `ql.han03@khachsan.mo`, mật khẩu = `SEED_PASSWORD`). Không seed đơn/chuyến xe: tự đặt thử.

## Đặt xe cùng đơn (tiền xe nằm trong tổng đơn)

**Body `POST /v1/bookings`** thêm: `guests` (1-30, mặc định 1; TỔNG số người đã gồm trẻ em; kiểm `guests <= capacity × qty` -> 422 `GUESTS_EXCEED_CAPACITY`, `details.maxGuests`), `children` (0..guests, mặc định 0; chỉ để hiển thị "N người, trong đó M trẻ em"), `shuttle` tùy chọn `{ legs: [{ direction: TO_HOTEL|TO_AIRPORT, pickupAt (ISO có offset), airport?, location? <=200, note? <=300 }] }` 1-2 chiều, mỗi chiều một lần. Body `strict`: gửi giá hay `passengers` -> 422. Số khách đi xe = `guests` của đơn (server tự lấy). Không gửi `shuttle` thì hành vi y hệt cũ.

**Đơn nhiều loại phòng (giai đoạn 1, không migration):** `POST /v1/bookings` và `POST /v1/bookings/quote` nhận `rooms: [{ roomTypeId, qty }]` (1..10 dòng, `qty` 1..5, `roomTypeId` KHÔNG trùng, đều thuộc `hotelId` và active; sai -> 422/404 `ROOM_TYPE_NOT_FOUND`); chung `from/to` và `guests`. Input cũ `roomTypeId` + `qty` vẫn nhận (quy về một dòng); gửi lẫn cả hai kiểu -> 422. Mỗi dòng một `room_reservations`; khóa các loại phòng theo thứ tự id (không deadlock), kiểm tồn từng dòng, thiếu chỗ ở BẤT KỲ dòng nào -> 409 `SOLD_OUT` cho cả đơn, `error.details.soldOut = [{ roomTypeId, roomTypeName, qty }]`, không ghi gì. `guests <= Σ(capacity × qty)` (422 `GUESTS_EXCEED_CAPACITY`, `details.maxGuests`, `details.qty` = tổng phòng). Tiền: mỗi dòng `subtotalVnd = unitPriceVnd × qty × nights`; `pricing.roomVnd = Σ subtotal`; phí dịch vụ = % × (phòng + xe); xe dùng tổng khách của đơn. `booking.lines[]` = `{ lineNo, roomTypeId, roomTypeName, qty, unitPriceVnd, subtotalVnd }` (kho nội bộ còn `reservationId`); mọi DTO đơn (tra cứu, tạo đơn, danh sách/chi tiết khách sạn và admin) còn thêm tóm tắt cho client cũ: `roomTypeName` (`"Standard +2 loại khác"` khi >1 dòng) và `qty` = tổng số phòng. Hủy/từ chối/hết hạn/thanh toán trễ nhả reservation của mọi dòng (theo `booking_id`); đổi ngày kiểm tồn mọi dòng, dời mọi reservation và tính lại từng `subtotalVnd` (thiếu một dòng -> 409 `SOLD_OUT`, không đổi gì). Quote: `{ nights, unitPriceVnd (dòng đầu), qty (tổng), rooms[], roomVnd, shuttleVnd, serviceFeeVnd, totalVnd, legs[] }`. Gợi ý khách sạn thay thế khi bị từ chối vẫn tìm một loại phòng đủ TỔNG số phòng (chưa tách theo dòng).

**Đặt phòng theo giờ (giai đoạn 2, KHÔNG migration):** cấu hình theo loại phòng lưu trong `room_types.pricing.hourly = { enabled, firstHourVnd, nextHourVnd, minHours, maxHours, cleaningMin (mặc định 30), openFromHour?, openToHour? }` (đặt qua `POST/PATCH /v1/hotel/room-types` với `hourly`, quyền `room:manage`; sửa giá đêm không mất cấu hình giờ; cờ `HOURLY` của khách sạn tự đồng bộ). `rooms[]` mở rộng tương thích ngược: `{ roomTypeId, qty, kind?: 'NIGHT'|'HOURLY', startsAt?, hours? }` (mặc định NIGHT; HOURLY cần `startsAt` ISO có múi giờ + `hours`; mỗi (loại phòng, kind) một dòng). Giá một phòng = `firstHourVnd + (hours-1) × nextHourVnd`, nhân `qty` (3 giờ = 120k + 2×70k = 260k). Đơn toàn giờ: `from/to` không cần gửi (bị bỏ qua), cửa sổ đơn = [giờ vào sớm nhất, giờ ra muộn nhất), `stay.type = 'HOURLY'`; đơn trộn đêm + giờ: bắt buộc `from/to` của dòng đêm, dòng giờ phải nằm trong đó, `stay.type = 'MIXED'`. Reservation mỗi dòng giờ = `[startsAt, startsAt + hours + cleaningMin)`, kiểm tồn có tính cả các dòng cùng loại phòng của chính đơn, khóa theo thứ tự id như cũ. Lỗi 422 có `details.lineNo` + `roomTypeId`: `HOURLY_NOT_ENABLED`, `HOURS_OUT_OF_RANGE` (`minHours/maxHours`), `STARTS_AT_IN_PAST` (dung sai 5 phút), `OUTSIDE_OPEN_HOURS`, `HOURLY_OUT_OF_STAY`; hết khung -> 409 `SOLD_OUT` (`details.soldOut[]` có `kind/startsAt/hours` với dòng giờ). `booking.lines[]` và quote thêm `kind` (+ `startsAt, endsAt, hours` với dòng giờ). Xe đưa đón: giờ đến bám cửa sổ đơn (±24 giờ), số khách = guests. Hủy/từ chối/hết hạn/thanh toán trễ/hoàn tiền và phí xe như cũ (theo tổng dòng); giữ chỗ đơn toàn giờ không quá giờ vào + 10 phút; không đến (`no-show`) với đơn toàn giờ khi đã qua giờ vào; check-in/out như cũ. Đổi ngày đơn có dòng giờ: 422 `CHANGE_NOT_SUPPORTED_HOURLY` (`shortcut:` chưa hỗ trợ đổi giờ vào). `GET /v1/hotels/:id/hourly-slots?roomTypeId&date=YYYY-MM-DD&hours&qty` (công khai) trả các giờ vào mỗi 30 phút (+ mốc "Bây giờ") `{ startsAt, endsAt, time, available, reason?: PAST|CLOSED|FULL }`; `rooms[].hourly` có trong danh sách/chi tiết khách sạn. Gợi ý khách sạn thay thế khi từ chối đơn giờ vẫn tính theo đêm (chưa theo giờ).
**Lưu số người:** trong cột jsonb `bookings.guest` (`count` = guests, `children`), không migration; đơn cũ đọc ra 1 / 0 (`bookingFromRow`). Trả ra: khách `booking.guests`, `booking.children` (tạo đơn + lookup); nhân sự/admin `booking.guest.count`, `booking.guest.children`; board/chuyến `guest.count`.
**Lỗi 422:** `SHUTTLE_NOT_OFFERED` (khách sạn `features.shuttle = none`), `GUESTS_EXCEED_CAPACITY`, `PICKUP_OUT_OF_STAY_WINDOW` (cùng quy tắc yêu cầu xe: chưa qua và trong lưu trú ±24 giờ), `AIRPORT_NOT_SERVED`, `SHUTTLE_OUT_OF_RANGE`. Hết phòng vẫn 409 `SOLD_OUT`, rollback cả yêu cầu xe.
**Công thức (BR-BKG-01):** `shuttleVnd = Σ giá từng chiều` (`shuttlePrice`, khách sạn `free` = 0); `serviceFeeVnd = serviceFee(roomVnd + shuttleVnd)` (%, tối thiểu, làm tròn theo `pricing.serviceFee`; không có xe = đúng như cũ); `totalVnd = roomVnd + shuttleVnd + serviceFeeVnd`; `payments.amount_vnd` và số tiền gửi VNPay/MoMo = `totalVnd`. Đơn `AT_HOTEL`: tổng gồm xe nhưng thu tại khách sạn (không có payments). Yêu cầu xe tạo cùng đơn: `billed = true`, `passengers = guests`, `config_version` theo quote (migration `016_shuttle_billed.sql`). Đổi ngày: phí DV tính trên (phòng + xe), xe giữ nguyên; xe (AT_HOTEL giảm do hủy chiều) đổi giữa lúc chờ duyệt -> 409 `QUOTE_STALE` (chỉ áp dụng đổi ngày).
**Thanh toán/điều phối:** đơn `PENDING_PAYMENT` chưa điều xe; thanh toán xong -> `CONFIRMED` -> `dispatchDueForBooking` (yêu cầu tới hạn điều ngay, còn lại do vòng quét). Sổ cái: `CUSTOMER_PAID = amount`, `HOTEL_PAYABLE = amount - phí DV` (phòng + xe), `AIRREST_REVENUE = phí DV`. Hết hạn giữ phòng/từ chối/hết hạn duyệt/thanh toán muộn: xe bị hủy cùng transaction (`cancelShuttlesForBooking`).
**Báo giá trước đặt:** `POST /v1/hotels/:id/shuttle-quote` `{ legs:[{direction, airport?, pickupAt?}], passengers?, guests? }` -> `{ offered, free, legs:[{direction, airport, distanceKm, priceVnd, night}], totalVnd }` (không có xe: `{offered:false}`; sai KS 404). Dùng chung `priceLeg` với tạo đơn; thiếu `pickupAt` = giá ban ngày (phụ thu đêm +20% 22-06 giờ VN chỉ tính khi có giờ đón). `features.shuttle` (`none|free|paid`) đã có ở `GET /v1/hotels{,/:id}`.

**Quy tắc hoàn tiền xe (chính sách: khách đã thanh toán xe mà không đi/không gọi xe thì KHÔNG hoàn, mọi trường hợp; lệnh hoàn khác chỉ được GHI `PENDING`, `due_at = infinity`, `processRefund` gọi đúng cổng đã thanh toán):**
| Tình huống | Kết quả |
|---|---|
| Khách hủy RIÊNG một chiều (đơn đã thu online), trước hoặc sau khi tài xế nhận | Hủy được (ONBOARD -> 409 `TRIP_ALREADY_STARTED`), KHÔNG tạo lệnh hoàn; `pricing.shuttleVnd`/`totalVnd`/`shuttle.legCount`/phí DV/sổ cái giữ nguyên; `booking_events` ghi `refundVnd: 0, note: 'khách hủy, không hoàn phí xe'`. Gọi lặp -> 409 `SHUTTLE_NOT_CANCELLABLE` |
| Khách hủy chiều khi đơn `AT_HOTEL` (chưa thu online), chưa có tài xế nhận | Chưa thu tiền nên chỉ giảm tổng đơn phải trả; đã có tài xế nhận -> tổng giữ nguyên |
| Hủy chiều khi đơn đang chờ thanh toán | Cho hủy (không còn 409 `BOOKING_AWAITING_PAYMENT`: số tiền link thanh toán không đổi, không hoàn) |
| Hủy CẢ đơn (change-request CANCEL) | Hoàn = hoàn phòng theo chính sách (công thức như trước khi có xe: tính trên phòng + phí DV, `paid - shuttleVnd`) và KHÔNG hoàn xe. Quote: `shuttleRefundVnd = 0`, `shuttleKeepVnd = shuttleVnd` đã thu (0 nếu chưa thu), `keepVnd` gồm phần xe |
| Khách sạn từ chối / quá hạn duyệt / thanh toán đến muộn | Hoàn toàn bộ số đã trả (gồm xe): đơn vô hiệu không do khách không đi |
| Hết xe / chuyển xe ngoài | Không đổi tiền |
| Khách sạn tự hủy yêu cầu xe (`/v1/hotel/shuttle-requests/:id/cancel`) | Không hoàn (giữ như cũ) |
Lý do hoàn `SHUTTLE_CANCELLED` chỉ còn để đọc dữ liệu cũ (đã hoàn trước chính sách này); không còn đường nào tạo lệnh hoàn này.

## Xe đưa đón: mô phỏng + realtime (P2)

**Mô phỏng (chỉ chuyến `OWN`; chuyến `EXTERNAL` không có vị trí):** khi tài xế nhận chuyến, `ensureRoute` (`services/shuttle/route.ts`) tính tuyến MỘT lần bằng OSRM (`{OSRM_URL}/route/v1/driving/lng,lat;lng,lat?overview=full&geometries=geojson`, timeout 5s, cache theo cặp tọa độ; lỗi -> đường thẳng) và lưu `shuttle_trips.route` = `{approach:[[lat,lng]..], ride:[[lat,lng]..], approachDistanceM, approachDurationS, rideDistanceM, rideDurationS, source:'osrm'|'straight'}` (mỗi chặng <= ~300 điểm). Xe xuất phát tại khách sạn -> điểm đón (`approach`) -> điểm trả (`ride`); `TO_HOTEL`: đón ở sân bay, trả tại khách sạn; `TO_AIRPORT`: đón tại khách sạn (approach dài 0), trả ở sân bay. Vị trí là hàm thuần của (trạng thái, `en_route_at`/`onboard_at`, now, SPEED, TIME_SCALE), không ghi DB mỗi tick, nên restart server không mất vị trí. Bộ đếm `simTick` (mỗi `SHUTTLE_SIM_TICK_MS`) đẩy `trip:position` cho chuyến `EN_ROUTE`/`ONBOARD`; mỗi lần đổi trạng thái cũng đẩy ngay một vị trí (kể cả `DONE`), sau đó bộ đếm không còn phát cho chuyến đó. `SHUTTLE_SIM_AUTO` tự chuyển `ACCEPTED->EN_ROUTE` (sau ~4 giây mô phỏng), tới điểm đón `->ARRIVED`, chờ ~4 giây `->ONBOARD`, hết tuyến chở `->DROPPED_OFF` qua CÙNG hàm chuyển trạng thái (`systemStep`: transaction, `booking_events` actor `SYSTEM`, publish); bấm tay luôn thắng (409 `INVALID_TRANSITION` thì bỏ qua). Không tự chạy chuyến `ACCEPTED` cũ hơn 12 giờ.

**Mô phỏng xe ngoài (chỉ khi `SHUTTLE_SIM_AUTO` bật; không cần liên kết Grab/Xanh SM thật):** `simTick` tự "đặt xe ngoài" cho chuyến `NEEDS_EXTERNAL` đã tồn tại >= 8 giây mô phỏng (tính từ `updated_at`, chia `SHUTTLE_SIM_TIME_SCALE`; bỏ qua chuyến cũ hơn 12 giờ) mà nhân sự chưa nhập, qua CÙNG hàm với nhập tay (`externalSet` trong `trips.ts`: transaction, `booking_events` `EXTERNAL_LINK_SET` actor `SYSTEM`, publish). Dữ liệu giả: provider `GRAB`/`XANHSM` chọn xác định theo id, `shareUrl` `https://r.grab.com/g/DEMO-<8 hex>` hoặc `https://xanhsm.com/share/DEMO-<8 hex>` (nếu `EXTERNAL_RIDE_LINK_HOSTS` không có host hãng nào thì dùng host đầu danh sách), tài xế "Tài xế mô phỏng", biển `51A-DEMO`, SĐT `+84900000000`, `ext_eta_at` = lúc dự kiến ARRIVED. Chuyến được đánh dấu `shuttle_trips.simulated = true` (migration 015); CHỈ chuyến có cờ này được tự chạy `ACCEPTED -> ARRIVED` (sau 10 giây mô phỏng) `-> ONBOARD` (6 giây) `-> DROPPED_OFF` (10 giây) qua `systemStep` (actor `SYSTEM`); xe ngoài do nhân viên nhập thật không bao giờ bị tự chạy. Bấm/nhập tay luôn thắng (409 `INVALID_TRANSITION` thì bỏ qua); nhân sự nhập/sửa xe ngoài hoặc đổi xe sẽ xóa cờ `simulated`. DTO: khách `trips[].simulated`, nhân sự `external.simulated` (boolean) để gắn nhãn "Mô phỏng". Chuyến `EXTERNAL` vẫn không có route/position. Tắt: `SHUTTLE_SIM_AUTO=false` (mặc định ở production).

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `SHUTTLE_SIM_ENABLED` | true | tắt = không route/position/bộ đếm |
| `SHUTTLE_SIM_AUTO` | true (NODE_ENV != production), false ở production | tự chuyển trạng thái để demo, và mô phỏng xe ngoài (xem dưới). `NODE_ENV=production` + `SHUTTLE_SIM_AUTO=true` -> TỪ CHỐI KHỞI ĐỘNG (giống MoMo mock) vì tạo liên kết giả cho khách |
| `SHUTTLE_SIM_SPEED_KMH` | 40 | tốc độ xe mô phỏng |
| `SHUTTLE_SIM_TIME_SCALE` | 1 | hệ số tua nhanh (thời gian mô phỏng = thật x hệ số) |
| `SHUTTLE_SIM_TICK_MS` | 2000 | chu kỳ đẩy vị trí |
| `OSRM_URL` | https://router.project-osrm.org | máy chủ định tuyến |
| `GUEST_TOKEN_EXPIRES_IN` | 2h (trước 30m) | hạn `guestToken` |

**Token khách:** dùng lại `guestToken` (kind `GUEST`, gắn một mã đơn) do `POST /v1/bookings/lookup` và `POST /v1/shuttle-requests/lookup` trả về. `GET /v1/track/shuttle` (Bearer guestToken; không `strictRateLimit`, giới hạn riêng 120 yêu cầu/phút theo đơn) trả `{stage, shuttles[].trips[], events}` như lookup, chuyến OWN từ `ACCEPTED` có `route` + `position`: khách tải lại trang không phải nhập lại SĐT. Thiếu/sai token 401; token nhân sự 403.

**Sự kiện realtime** (gửi SAU commit; publish trong transaction của caller, vd. cascade hủy đơn, tự hoãn tới sau commit qua `afterCommit` trong `database/pg.ts`, rollback thì bỏ):

| Phòng | Ai vào được | Sự kiện |
|---|---|---|
| `booking:{code}` | guestToken đúng mã đơn | `shuttle:update`, `trip:position` (cho đơn đó) |
| `hotel:{hotelId}:shuttle` | `fleet:manage` hoặc `shuttle:handle` + `hotelId` | `shuttle:update`, `trip:position` của khách sạn mình |
| `admin:shuttle` | `fleet:manage`/`shuttle:handle` + `hotel:scope:all`, không gắn khách sạn | như trên, mọi khách sạn |
| `driver:{accountId}` | `trip:drive` (tài xế) | chỉ sự kiện/vị trí chuyến của chính tài xế |

`shuttle:update` = `{type, bookingCode, tripId?, requestId?, status?, at}` (ISO). `type`: `TRIP_OFFERED|TRIP_ACCEPTED|TRIP_REJECTED|TRIP_EN_ROUTE|TRIP_ARRIVED|TRIP_ONBOARD|TRIP_DROPPED_OFF|TRIP_CANCELLED|TRIP_REASSIGNED|TRIP_ROUTE_READY|EXTERNAL_NEEDED|EXTERNAL_LINK_SET|SHUTTLE_CANCELLED|BOOKING_STATUS`. `BOOKING_STATUS` (khách + khách sạn): đơn đổi trạng thái (xác nhận/từ chối/hết hạn/check-in/check-out/không đến/hủy do duyệt yêu cầu), `status` = trạng thái đơn mới; phát trong transaction đổi trạng thái nên rollback thì không phát. Chưa phủ: đơn đổi trạng thái do thanh toán/đối soát (payments). Không có PII/xe/ảnh/SĐT: client gọi REST lấy chi tiết. `trip:position` = `{tripId, lat, lng, heading, speedKmh, etaSec, phase:'APPROACH'|'RIDE'|'ARRIVED'|'DONE', at}`.

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
- Tài khoản khách: chưa có xác minh/khôi phục mật khẩu (không thu email/SĐT, BR-002), chưa thu hồi phiên khi đổi mật khẩu (token cũ sống tới khi hết hạn), chưa khóa tài khoản theo số lần đăng nhập sai ngoài rate limit theo IP.
- JWT chỉ chứa định danh (~200 byte, không phình theo số quyền); quyền nạp từ DB mỗi request, cache 30 giây/tiến trình (`lib/authz.ts`). Khóa/đổi vai trò có hiệu lực ngay trên bản API xử lý thay đổi, các bản khác chờ hết 30 giây. Chưa có refresh token/thu hồi phiên.
- VNPay: mặc định `VNPAY_MODE=mock` (không gọi mạng) — mock chỉ chứng minh logic khớp tài liệu VNPay 2.1.0, **chưa** khớp VNPay thật. Khi có khóa sandbox/production: đặt `VNPAY_MODE=live`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` (trang FE), và khai báo IPN URL `https://<api>/v1/payments/vnpay/ipn` trên cổng VNPay merchant (IPN URL không gửi trong request). `VNPAY_URL`/`VNPAY_API_URL` mặc định là sandbox, đổi sang URL production khi lên thật. **Chạy thử sandbox một lượt** (đặt → trả → IPN → hoàn). Chưa xác thực chữ ký phản hồi querydr/refund, `vnp_IpAddr` đang cố định `127.0.0.1`; chưa có scheduler (đối soát gọi tay qua `/reconcile`); chưa làm chi trả khách sạn, thu thêm khi đổi đơn, hoàn một phần.
- MoMo (song song VNPay, mỗi cổng bật/tắt độc lập): bảng env
  | Biến | Ý nghĩa |
  |---|---|
  | `MOMO_ENABLED` | mặc định `false`; tắt thì đặt phòng `MOMO` → 409 `MOMO_DISABLED` và `/payments/methods` không liệt kê |
  | `MOMO_MODE` | `mock` (mặc định, không gọi mạng, khóa sandbox công khai) hoặc `live`; production + enabled + mock bị từ chối khi khởi động |
  | `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` | bắt buộc khi `live` |
  | `MOMO_ENDPOINT` | mặc định `https://test-payment.momo.vn` (sandbox) |
  | `MOMO_RETURN_URL` | **trang web** MoMo đưa khách về (mặc định như `VNPAY_RETURN_URL`, `/payment/result`) |
  | `MOMO_IPN_URL` | **API công khai** MoMo gọi POST JSON (mặc định `http://localhost:3000/v1/payments/momo/ipn`; live phải là URL internet) |

  Khác biệt: VNPay IPN là `GET` query + trả JSON `{RspCode}` và IPN URL khai báo trên cổng merchant; MoMo IPN là `POST` JSON + trả HTTP 204, IPN URL gửi kèm trong request tạo link. Cùng một logic xử lý kết quả (`applyGatewayResult`). Luồng MoMo: đặt phòng → `paymentLink.payUrl` (mock: `<MOMO_RETURN_URL>?mock=1&gateway=momo&orderId=…`) → khách trả → MoMo POST IPN → đơn `CONFIRMED`. Hoàn/đối soát chọn cổng theo `payments.method`/`refunds.method`; refund MoMo mã 1000/7000/7002/9000 là "đang chờ", giữ `PROCESSING`. Chưa xác thực chữ ký phản hồi create/query/refund của MoMo; chưa đặt `orderExpireTime` (link MoMo không tự hết hạn theo giữ phòng, đơn vẫn hết hạn phía Airrest và thanh toán trễ được hoàn 100%).
- Realtime: sự kiện đơn chỉ phát trong một tiến trình API; chạy nhiều bản API cần Postgres LISTEN/NOTIFY hoặc Supabase Realtime (và adapter cho Socket.io). Không dùng Supabase Auth/Realtime/REST: backend nối thẳng Postgres bằng `DATABASE_URL`, xác thực bằng JWT riêng.
- Supabase: TLS bật nhưng chưa ghim CA (`database/pg.ts`); bảng `idempotency_keys` chưa có job dọn định kỳ (chỉ dọn key hết hạn khi gặp lại); chưa bật Row Level Security (API là cửa duy nhất vào DB — hãy bật RLS deny-all cho các bảng nếu mở REST của Supabase ra ngoài).
- `createBooking` mới hỗ trợ 1 loại phòng, theo đêm, trả tại khách sạn, VNPay hoặc MoMo; giá đọc từ `system_configs`.
- Khóa idempotency không chặn hai request *đang chạy* cùng key với body khác ngoài trả 422/409.
- Test tích hợp chạy trên Postgres nhúng (embedded-postgres), chưa thử trên Supabase thật; chưa có CI.

## Swagger

Chạy API rồi mở `http://localhost:3000/docs` (JSON: `/openapi.json`). Đăng nhập ở `POST /v1/auth/login`, bấm **Authorize**, dán token. Spec viết tay ở `api/openapi.ts`, thêm route mới thì cập nhật file đó.
