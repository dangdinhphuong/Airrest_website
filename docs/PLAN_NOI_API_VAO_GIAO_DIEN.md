# Kế hoạch nối API backend vào giao diện AIRREST

Ngày lập: 12/11/2026. Trạng thái: **chờ duyệt, chưa sửa code**.
Căn cứ: đọc `backend/api/modules/*`, `packages/validation`, `backend/config/env.ts`, `backend/.env.example`, `docker-compose.yml`, `render.yaml`, `apps/web/src/*`.

## 1. Mục tiêu và nguyên tắc

- Thay toàn bộ dữ liệu mô phỏng (`apps/web/src/mock`) bằng lời gọi API thật `/v1/*` của backend Express/PostgreSQL.
- **Domain backend chỉ cấu hình trong `.env`**, không hard-code trong mã (mục 2).
- Giữ nguyên cấu trúc base: `screens/`, `components/`, `state/store.jsx`, khung `UserSite` và khu vực khách sạn/quản trị. Chỉ thêm một lớp truy cập dữ liệu, không viết lại giao diện.
- Một nguồn hợp đồng duy nhất: kiểu từ `@airrest/shared-types`, schema từ `@airrest/validation` (backend đã dùng chung).
- Làm theo giai đoạn, mỗi giai đoạn chạy được và kiểm chứng được, không big-bang.

## 2. Cấu hình domain backend qua `.env`

| Việc | Chi tiết |
|---|---|
| Biến FE | `VITE_API_BASE_URL` (ví dụ `http://localhost:3000`, production `https://api.airrest.vn`). Không có giá trị mặc định trong mã. |
| Nơi đặt | `apps/web/.env.example` (commit), `apps/web/.env` (cục bộ, đã `.gitignore`). |
| Đọc ở đâu | Một chỗ duy nhất: `packages/api-client` (`import.meta.env.VITE_API_BASE_URL`), chuẩn hóa bỏ dấu `/` cuối. |
| Fail-fast | Thiếu hoặc sai URL thì hiện màn hình lỗi cấu hình rõ ràng ngay khi tải trang, không gọi API mù. |
| Docker | `docker-compose.yml` dịch vụ `web`: thêm `VITE_API_BASE_URL` (đọc từ `.env` gốc). |
| Render | `render.yaml`: khai báo biến môi trường `VITE_API_BASE_URL`. **Lưu ý:** Vite nhúng biến tại thời điểm build, nên đổi domain phải build lại (chấp nhận được). Nếu cần đổi domain mà không build lại thì dùng `config.js` tải lúc chạy; đề xuất chưa làm. |
| CORS | `backend/.env`: `CORS_ORIGINS` phải chứa origin của FE. Hiện `.env.example` ghi `5173` còn Docker chạy `5174`, cần thống nhất và ghi rõ trong README. |
| Thanh toán | `VNPAY_RETURN_URL` trỏ về FE (`/payment/result`), cần FE xử lý đường dẫn này (mục 5, P1). |

## 3. Hiện trạng: API sẵn có và màn hình tương ứng

Ký hiệu cột "BE đủ?": ✅ dùng được ngay, ⚠️ có lệch hợp đồng, ❌ chưa có API.

### 3.1 Người dùng cuối (công khai, không cần đăng nhập)

| Màn hình / tính năng | API | BE đủ? | Ghi chú |
|---|---|---|---|
| Tra cứu chuyến bay | `GET /v1/flights/:code?date=` | ⚠️ | Dữ liệu mô phỏng ở DB; cần đối chiếu hình dạng trả về và bộ chuyến bay được seed (FE đang có 20 chuyến). |
| Danh sách nơi nghỉ + bộ lọc | `GET /v1/hotels?airport=` | ⚠️ | Chỉ trả `name, code, location, airports[{iata,km,minutes}], amenities, rating{avg,count}`. **Thiếu giá, tồn phòng, xe đưa đón, hủy miễn phí, theo giờ, gia đình, lễ tân 24/24, thanh toán tại nơi nghỉ**; không lọc/sắp xếp được. Cần mở rộng (mục 4). |
| Chi tiết nơi nghỉ | `GET /v1/hotels/:id` | ⚠️ | Trả `hotel` + `roomTypes` (giá nằm trong `pricing`). Thiếu tồn theo ngày. |
| Đặt phòng | `POST /v1/bookings` | ⚠️ | Cần `hotelId`, `roomTypeId` (uuid), `from/to` dạng datetime, `guest{fullName, phone E.164, email?}`, `paymentMethod AT_HOTEL\|VNPAY`, header `Idempotency-Key` bắt buộc. |
| Thanh toán VNPay | `POST /v1/payments/vnpay/link`, `GET .../ipn` | ✅ | Trả `paymentLink.payUrl`; chế độ `mock` có `dev-simulate`. |
| Tra cứu booking | `POST /v1/bookings/lookup` | ⚠️ | **Bắt buộc cả mã (`AR-XXXXXXXX`) và SĐT.** Xung đột với việc vừa đổi sang "mã hoặc SĐT" (mục 4). |
| Hủy / đổi ngày | `/v1/change-requests` (quote, create, lookup) | ✅ | Giao diện user hiện **chưa có màn này**. |
| Xe đưa đón | `/v1/shuttle` (quote, create, lookup, cancel) | ✅ | Giao diện user hiện **chưa có màn này**. |
| Hỗ trợ | `POST /v1/support`, `/lookup`, `/reply` | ⚠️ | Backend **bắt buộc `phone`**, có `bookingCode?`, `subject`, `message`; không có `category`. Form FE đang có "email hoặc SĐT" và "loại yêu cầu". |
| Đăng nhập/đăng ký hành khách | không có | ❌ | Backend chỉ có tài khoản `HOTEL / DRIVER / ADMIN`. Hành khách hiện là mô phỏng trong bộ nhớ trang. |
| Trợ lý chat | dùng lại các API trên | ✅ | `botEngine` chỉ cần đổi nguồn dữ liệu. |

### 3.2 Khách sạn (`/v1/hotel/*`, cần JWT + quyền)

| Tab giao diện | API | BE đủ? |
|---|---|---|
| Tổng quan, Báo cáo | `GET /v1/hotel/stats` | ⚠️ (kiểm tra số liệu so với KPI hiện có) |
| Đặt phòng | `GET /v1/hotel/bookings`, `:id`, `confirm`, `reject`, check-in | ✅ |
| Loại phòng | `/v1/hotel/room-types` (CRUD) | ✅ |
| Tồn phòng, khóa/bảo trì | `.../:id/inventory`, `/v1/hotel/room-blocks` | ✅ |
| Hủy/đổi của khách | `/v1/hotel/change-requests` (approve, reject) | ✅ (chưa có tab) |
| Đưa đón | `/v1/hotel/shuttle` (assign, complete, cancel) | ✅ |
| Hồ sơ cơ sở, Chất lượng/sự cố | không có | ❌ |

### 3.3 Quản trị (`/v1/admin/*`)

| Tab giao diện | API | BE đủ? |
|---|---|---|
| Cơ sở | `/admin/hotels` (list, get, create, patch, approve, reject, suspend, activate, payout-account, stats) | ✅ |
| Tài khoản | `/admin/accounts`, `/admin/roles` | ✅ (phân quyền theo `permissions`) |
| Cấu hình | `/admin/configs` (có phiên bản) | ✅ |
| Ca hỗ trợ | `/admin/support` (list, get, patch, messages) | ✅ |
| Nhật ký | `/admin/audit-logs` | ✅ |
| Giám sát | `/admin/dashboard` | ⚠️ |
| Chuyến bay | `/admin/flights` | ✅ (chưa có tab) |
| Thanh toán, hoàn tiền | `/admin/payments`, `/admin/refunds`, reconcile, retry | ✅ (chưa có tab) |
| Tài liệu hóa, upload ảnh | `/admin/media/upload-url` | ✅ (cần cấu hình R2) |

Đăng nhập nhân sự: `POST /v1/auth/login` (email + mật khẩu) trả `token` + `account{id, fullName, type, permissions[]}`; `GET /v1/auth/me`.

## 4. Các điểm lệch hợp đồng cần quyết trước khi làm

| # | Lệch | Hệ quả | Hướng đề xuất |
|---|---|---|---|
| D1 | FE dùng id `HAN-01`, backend dùng uuid; seed chỉ có 1 khách sạn demo | Nhiều màn hình đang gắn id chuỗi | Dùng uuid từ API. Mở rộng seed (HAN + SGN, nhiều loại phòng, chuyến bay, tài khoản) để giao diện có dữ liệu thử. |
| D2 | FE dùng **giờ mô phỏng** (`simNow`, phút từ 00:00) và chỉ số ngày; backend dùng thời gian thật | Ảnh hưởng nhiều hàm (`isOpen`, `dayInventory`, hiển thị giờ) | Bỏ đồng hồ mô phỏng ở phần đã nối API; hiển thị giờ thật. Phần quản trị `SimTools` giữ lại hoặc bỏ (cần chốt). |
| D3 | Mã booking: FE tự ghép `AR-HAN-20261112-0001`, backend sinh `AR-XXXXXXXX` | Regex và placeholder FE phải đổi | Dùng mã backend; cập nhật `parseTrack`, bot, văn bản gợi ý. |
| D4 | **Tra cứu "mã hoặc SĐT"** (vừa làm) và backend bắt buộc **cả hai** | Không nối được nếu giữ "hoặc" | Chọn một: (a) trả về yêu cầu cả hai như backend, an toàn hơn; (b) thêm endpoint backend tra theo SĐT hoặc mã (yếu xác minh, lộ thông tin khách). Đề xuất (a). |
| D5 | Tìm nơi nghỉ cần giá, tồn, thuộc tính và lọc | `GET /v1/hotels` thiếu | **Mở rộng backend**: thêm trường công khai (giá thấp nhất, số phòng còn, cờ tiện ích/chính sách) và tham số lọc/sắp xếp. Có thể cần thêm cột hoặc suy ra từ `policy`/`amenities`. Đụng schema: phải được duyệt riêng. |
| D6 | Hỗ trợ: backend bắt buộc SĐT, không có `category` | Form FE phải đổi | Bắt buộc SĐT trong form; `category` đưa vào đầu `subject` hoặc bỏ. Đề xuất bỏ trường, giữ `subject`. |
| D7 | Tài khoản hành khách không có ở backend | Đăng nhập/đăng ký/trang Tài khoản hiện là mô phỏng | Chọn: (a) giữ mô phỏng và ghi chú rõ; (b) bỏ hẳn phần đăng nhập hành khách; (c) làm module tài khoản hành khách ở backend (ngoài phạm vi). Đề xuất (b) hoặc (a). |
| D8 | Vai trò FE (`admin, ops, support, finance, auditor, manager, staff, driver`) khác quyền backend (`OPS/SUPPORT/FINANCE/SYSADMIN` + `permissions[]`) | Menu và cổng quyền phải ánh xạ lại | Dựng menu theo `permissions` trả từ `/auth/login`; thay `lib/rbac.js` bằng bảng ánh xạ quyền, bỏ đoán theo tên vai trò. |
| D9 | Tab "Hồ sơ cơ sở", "Chất lượng/sự cố", một số báo cáo chưa có API | Không nối được | Giữ tab ở trạng thái "chưa có API" hoặc ẩn; không tự bịa API. |
| D10 | `VNPAY_RETURN_URL` là đường dẫn thật (`/payment/result`), FE dùng router hash | Quay lại từ cổng thanh toán bị trắng | Thêm màn xử lý `/payment/result?...`, và rewrite SPA trong `render.yaml`/Vite. |

## 5. Kiến trúc đề xuất (đơn giản, không thêm tầng thừa)

```
apps/web/src
  lib/api.js        ← (hoặc packages/api-client) request(): baseURL từ env, JSON, lỗi chuẩn hóa, Idempotency-Key, Authorization
  data/             ← mỗi module một file mỏng gọi API: flights, hotels, bookings, support, changeRequests, shuttle, auth, hotel (staff), admin
  mock/             ← giữ trong lúc chuyển; xóa ở P4
```

- **Công tắc chuyển dần:** `VITE_DATA_SOURCE=api|mock` (đọc một lần). Mỗi module trong `data/` có nhánh mock và nhánh API; xong giai đoạn nào thì bật `api` cho module đó. Cuối cùng xóa nhánh mock.
- **Xử lý lỗi thống nhất:** dịch mã lỗi backend (`HOTEL_NOT_FOUND`, `INVALID_CREDENTIALS`, `VNPAY_DISABLED`, 429...) ra thông báo tiếng Việt; có trạng thái đang tải, thử lại, và thông báo khi API không kết nối được.
- **Phiên nhân sự:** token JWT giữ trong bộ nhớ (không `localStorage`); mất khi tải lại trang và phải đăng nhập lại. Nếu cần giữ phiên thì dùng `sessionStorage` (cần chốt vì ảnh hưởng bảo mật).
- **Thời gian thực:** Socket.IO (`bookingFeed`) là tùy chọn ở giai đoạn cuối; trước đó dùng làm mới thủ công/định kỳ.

## 6. Các giai đoạn

### P0 Nền tảng (làm trước, không đổi giao diện)
1. `VITE_API_BASE_URL` trong `.env.example`, `docker-compose.yml`, `render.yaml`; màn lỗi cấu hình.
2. `api-client`: `request()`, lỗi chuẩn hóa, xác thực, idempotency; kiểu từ `shared-types`.
3. Thống nhất `CORS_ORIGINS` ở README và compose; kiểm tra `GET /health` lúc khởi động.
4. Mở rộng `seed` (HAN + SGN, nhiều khách sạn/loại phòng/chuyến bay/tài khoản thử cho từng vai trò).
5. Tiêu chí xong: chạy `npm run dev:api` + `dev:web`, gọi được `/health` từ FE, đổi domain chỉ bằng `.env`.

### P1 Luồng người dùng (công khai)
Thứ tự: chuyến bay → danh sách/chi tiết nơi nghỉ (cần quyết D5) → đặt phòng (AT_HOTEL trước) → tra cứu booking (D4) → VNPay + `/payment/result` (D10) → hỗ trợ (D6) → trợ lý chat đổi nguồn dữ liệu → (tùy chọn) màn hủy/đổi và xe đưa đón.
Tiêu chí xong: đặt phòng thật tạo bản ghi trong PostgreSQL, tra cứu ra đúng đơn, đơn xuất hiện ở khách sạn.

### P2 Cổng khách sạn
Đăng nhập thật (`/auth/login`) với menu theo `permissions` (D8); các tab đặt phòng (xác nhận/từ chối/check-in), loại phòng, tồn phòng, khóa phòng, đưa đón, hủy/đổi, thống kê. Tab chưa có API (D9) giữ nguyên trạng thái "chưa có API".

### P3 Cổng quản trị
Cơ sở (duyệt/từ chối/tạm dừng), tài khoản/vai trò, cấu hình có phiên bản, ca hỗ trợ, nhật ký, giám sát; thêm tab chuyến bay, thanh toán/hoàn tiền nếu muốn.

### P4 Hoàn thiện
Socket.IO (tùy chọn), xóa `mock/` và công tắc `VITE_DATA_SOURCE`, cập nhật README, tài liệu KLTN Chương 5 (FE đã nối API), dọn CSS và phụ thuộc không dùng (`leaflet`).

## 7. Kiểm thử

- Backend: `npm run typecheck`, `npm test`, `npm run test:db` (Postgres nhúng) phải xanh trước và sau.
- Frontend: `vite build`; test đơn vị cho lớp `data/` và `api-client` (mock `fetch`).
- E2E bằng Chrome điều khiển qua CDP như đã làm: chạy API thật với Postgres nhúng/Docker, kiểm tra luồng đặt phòng → khách sạn xác nhận → khách tra cứu; ticket hỗ trợ → admin thấy.
- Kiểm tra CORS, 401/403, 429, lỗi mạng, API tắt.

## 8. Rủi ro

- **Bề mặt lệch lớn** (D2, D5): phần dễ ước lượng thiếu nhất là bỏ đồng hồ mô phỏng và mở rộng tìm kiếm.
- **Đụng schema backend** (D5): cần duyệt riêng; nếu không thì giao diện chỉ hiện được dữ liệu công khai hiện có (không lọc theo giá/tồn).
- **Bảo mật:** token không để `localStorage`; không ghi PII ra log; xác minh tra cứu (D4).
- **VNPay:** mới có chế độ `mock`; chế độ thật cần khóa merchant và khai IPN.
- **Phần tab chưa có API** sẽ còn trạng thái "chưa nối" sau khi xong.

## 9. Câu hỏi cần chốt

1. **Phạm vi lần này:** chỉ giao diện người dùng (P0+P1), hay cả khách sạn và quản trị (P0 đến P3)?
2. **D5 Tìm kiếm:** được phép mở rộng backend (thêm trường và lọc cho `GET /v1/hotels`, có thể đụng schema) hay chỉ dùng dữ liệu công khai hiện có?
3. **D4 Tra cứu:** quay lại yêu cầu cả mã và SĐT như backend, hay thêm endpoint backend để tra theo mã hoặc SĐT?
4. **D7 Hành khách:** giữ đăng nhập/đăng ký mô phỏng, hay bỏ hẳn?
5. **D2 Đồng hồ mô phỏng:** bỏ hẳn ở phần nối API, hay giữ `SimTools` cho môi trường demo?
6. **Công tắc `VITE_DATA_SOURCE=api|mock`:** giữ trong lúc chuyển và xóa ở P4 (đề xuất), hay chuyển thẳng một lần?
7. **Mở rộng seed:** có dùng 34 cơ sở mô phỏng hiện có làm dữ liệu seed không?
