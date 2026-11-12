# Nội dung sửa Chương 4 và Chương 5 — KLTN AIRREST

Đối chiếu file `KLTN.IT63.Nhom9.AIRREST.docx` với repo `Airrest_website` (ngày 12/11/2026).
Mỗi mục dưới đây gồm: **Vị trí** trong docx → **Hành động** (Thay / Sửa / Thêm / Xóa) → **Nội dung mới** (có thể dán thẳng).

Quy ước:
- `[CẦN XÁC NHẬN]` là chỗ chưa kiểm chứng bằng chạy thật, nhóm phải điền số liệu hoặc xác nhận trước khi nộp.
- Số liệu lấy từ đọc code/cấu hình; **chưa chạy** `npm test`, `npm run typecheck`, `vite build`.

> **Cập nhật 12/11/2026:** sau khi tài liệu này được viết, giao diện đã được làm lại và nối API thật. Màn hình người dùng hiện gồm: trang chủ (tra chuyến bay, tìm/lọc nơi nghỉ theo 22 sân bay, đặt phòng 3 bước), chi tiết khách sạn, theo dõi booking (kèm hủy/đổi ngày, xe đưa đón, thanh toán VNPay), hỗ trợ, tài khoản, trợ lý chat theo kịch bản. Các màn cũ (Status, Advice, Reminder, Terminal, Request, bản đồ Stays) đã bị xóa; mọi chỗ dưới đây nhắc tới chúng, tới `src/mock` hoặc "FE chưa nối API" là mô tả bản cũ. **Bảng 4.4 (ánh xạ màn hình M0–M13) và trạng thái FR cần được lập lại theo danh sách màn hình ở trên.**

## 0. Sự thật nền tảng (đọc trước khi sửa)

| Hạng mục | Hiện trạng trong repo |
|---|---|
| Cấu trúc | Monorepo npm workspaces: `apps/web`, `apps/mobile` (chưa làm), `packages/*`, `backend` |
| Frontend | React 18.3.1, Vite 6, Tailwind v4 (class tiền tố `tw:`, chỉ cho giao diện người dùng), GSAP, lucide-react; giao diện người dùng `screens/user`, cổng khách sạn `components/hotel`, cổng quản trị `components/admin` |
| Dữ liệu FE | **Gọi API thật** `/v1/*` qua `packages/api-client` (`apps/web/src/data/*`); domain backend cấu hình trong `apps/web/.env` (`VITE_API_BASE_URL`). Chỉ còn đăng nhập hành khách là mô phỏng (`mock/users.js`) |
| Backend | Node.js ≥ 22, TypeScript, Express 5, PostgreSQL (Supabase, driver `pg`), Socket.IO, zod, JWT, pino, Swagger/OpenAPI |
| CSDL | **PostgreSQL**, 8 migration, 20 bảng. Thiết kế MongoDB trong `docs/mongodb/` là tài liệu gốc, đã được chuyển sang quan hệ (`docs/postgres/README.md`) |
| Thanh toán | VNPay, chế độ `mock` (không giao dịch thật) |
| Test | 24 file trong `backend/tests`, khoảng 199 test case (đếm bằng `rg`, chưa chạy) |
| Triển khai | `docker-compose.yml`, `render.yaml`, `backend/Dockerfile` |

Điểm phải nói thẳng trong báo cáo: giao diện **đã nối API thật** (đặt phòng, tra cứu, VNPay, hỗ trợ, hủy/đổi, xe đưa đón, cổng khách sạn, cổng quản trị). Phần còn mô phỏng: đăng nhập hành khách, dữ liệu chuyến bay, thanh toán VNPay (chế độ `mock`), danh mục khách sạn/đơn đặt phòng là dữ liệu seed.

Lưu ý repo: có hai cây mã FE gần giống nhau là `src/` (gốc) và `apps/web/src/`, nội dung đã lệch. Nhóm cần chốt `apps/web` là nguồn chính (README gốc cũng ghi vậy) và nêu rõ trong báo cáo. `[CẦN XÁC NHẬN]`

---

# CHƯƠNG 4. PHÂN TÍCH YÊU CẦU VÀ THIẾT KẾ HỆ THỐNG

## 4.1 Phạm vi, tác nhân và kiến trúc thông tin

**Hành động:** Thay đoạn mở đầu và Bảng 4.1.

**Đoạn mở đầu mới:**

> Trong phạm vi đề tài, trạng thái chuyến bay, giá, tồn phòng, thanh toán và phản hồi của hãng/cơ sở lưu trú được xử lý theo hai lớp. Lớp giao diện hành khách dùng dữ liệu mô phỏng có nhãn. Lớp dịch vụ phía máy chủ (API, cơ sở dữ liệu, xác thực, phân quyền) đã được xây dựng và kiểm thử độc lập, nhưng chưa được nối vào giao diện. Thanh toán VNPay chạy ở chế độ mô phỏng (`mock`), không phát sinh giao dịch thật. Yêu cầu được viết theo hướng có thể chuyển sang vận hành thật khi có nguồn dữ liệu và đối tác thực.

**Bảng 4.1 mới (Phạm vi và ranh giới MVP AIRREST):**

| Hạng mục | Phạm vi chốt |
|---|---|
| Người dùng/địa bàn | Hành khách từ 18 tuổi gặp chậm hoặc hủy chuyến; Nội Bài là địa bàn chính, Tân Sơn Nhất dùng để đối chiếu dữ liệu. |
| Nền tảng | Website responsive, mobile-first; luồng chính của hành khách không yêu cầu đăng nhập. Tài khoản chỉ dành cho nhân sự khách sạn và quản trị. |
| Luồng cốt lõi | Tự tìm và tự chi trả; gửi đề nghị hỗ trợ rồi theo dõi hoặc chuyển sang tự chi trả. |
| Phạm vi hiện thực | (1) Giao diện React nhiều màn hình cho hành khách, đối tác khách sạn và quản trị, gọi API backend. (2) Backend REST + Socket.IO trên PostgreSQL có xác thực JWT, RBAC, idempotency, audit log. (3) Thanh toán VNPay chế độ mô phỏng. |
| Ngoài phạm vi | Nối giao diện với API thật, dữ liệu chuyến bay thời gian thực từ nhà cung cấp, thanh toán thật, ứng dụng native, hợp tác B2B với hãng. |

## 4.2 Yêu cầu chức năng và phi chức năng

**Hành động:** Giữ nguyên danh sách FR/NFR. **Sửa cột "Trạng thái V1" của Bảng 4.2** theo bảng dưới (tách rõ "giao diện" và "backend"). Đổi tiêu đề cột thành "Trạng thái hiện thực".

| Mã | Trạng thái hiện thực (đề xuất) | Căn cứ trong repo |
|---|---|---|
| FR-01 | Giao diện: mô phỏng. Backend: có | `GET /v1/flights/:code`, `flights` + `flight_changes` |
| FR-02 | Giao diện: có, mô phỏng | `screens/Home.jsx` |
| FR-03 | Giao diện: một phần. Backend: có lịch sử đổi giờ | `flight_changes`, `PATCH /admin/flights/:id` |
| FR-04 | Một phần | `config/rights.js`, `screens/Status.jsx` |
| FR-05 | Giao diện: có, mô phỏng | `screens/Advice.jsx` |
| FR-06 | Giao diện: dữ liệu mô phỏng. Backend: có | `GET /v1/hotels`, `GET /v1/hotels/:id` |
| FR-07 | Có, dữ liệu tĩnh (khoảng cách sân bay lưu trong `hotels.airports`) | `Stays.jsx` |
| FR-08 | Có (bộ lọc ở màn Stays) | `Stays.jsx` |
| FR-09 | **Đã bỏ khỏi giao diện mới** (không còn bản đồ) | — |
| FR-10 | Giao diện: một phần. Backend: có | `Detail.jsx`, chính sách trong `hotels` |
| FR-11 | Giao diện: mô phỏng. Backend: có | `Booking.jsx`, `POST /v1/bookings` (bắt buộc Idempotency-Key) |
| FR-12 | **Có**: chọn thanh toán tại khách sạn hoặc VNPay (mock), trang `/payment/result` | `screens/user/Home.jsx`, `Pages.jsx`, `/v1/payments/vnpay/*` |
| FR-13 | **Đã bỏ khỏi giao diện mới** (không còn màn Nhắc giờ, xuất lịch) | — |
| FR-14 | `[CẦN XÁC NHẬN]` | |
| FR-15 | Có, mức giao diện | `Terminal.jsx` |
| FR-16 | Giao diện: có. Backend: có | `Support.jsx`, `/v1/support` |
| FR-17 | `[CẦN XÁC NHẬN]` | |
| FR-18 | Có | luồng khách dùng mã + SĐT (`/bookings/lookup`) |
| FR-19, FR-20 | Ngoài phạm vi (giữ nguyên) | |
| FR-21 | Backend: có (`support_tickets`, `change_requests`). Giao diện: mô phỏng | `Request.jsx` |
| FR-22 | Một phần: khách sạn duyệt/từ chối kèm lý do (`booking_decisions`). Hãng hàng không duyệt vẫn là mô phỏng | `POST /hotel/bookings/:id/confirm|reject` |
| FR-23 | **Có**: xác nhận/từ chối, tối đa 3 khách sạn thay thế | `booking_decisions.alternatives` |
| FR-24 | Có: yêu cầu hủy/đổi, báo giá chốt lúc gửi | `change_requests`, `/v1/change-requests` |

Cột cuối của Bảng 4.2 (điều kiện nghiệm thu) giữ nguyên.

**Bảng 4.3 (NFR):** cột "Bằng chứng hiện có" sửa như sau:
- NFR-05 (bảo vệ dữ liệu cá nhân): "Mã hóa cấp trường (`lib/crypto.ts`), chuẩn hóa SĐT, log không ghi PII, audit log" thay cho "Không thu PII trong prototype". Cần đối chiếu lại điều này với giao diện: luồng đặt phòng có thu tên/SĐT. `[CẦN XÁC NHẬN]`
- NFR-03 (hiệu năng): giữ "Chưa đo" nếu chưa chạy Lighthouse.
- Thêm **NFR-09 Bảo mật và truy vết** (M): JWT, RBAC theo permission, rate limit, helmet, audit log. Tiêu chí: truy cập không đủ quyền trả 403; thao tác nhạy cảm có bản ghi audit.
- Thêm **NFR-10 Nhất quán dữ liệu đặt phòng** (M): không bán vượt tồn, idempotent. Tiêu chí: hai yêu cầu đặt đồng thời vào phòng cuối cùng chỉ một yêu cầu thành công; gửi lại cùng Idempotency-Key không tạo đơn thứ hai.

**Bảng 4.4 (ánh xạ màn hình):** thêm 4 dòng và đổi M9.

| Mã | Màn hình/khu vực | Yêu cầu | Trạng thái |
|---|---|---|---|
| M9 | Theo dõi đề nghị hỗ trợ (`Request.jsx`) | FR-21–24 | Có, mô phỏng; backend có |
| M10 | Đăng nhập nhân sự (`Login.jsx`) | NFR-09 | Có |
| M11 | Cổng khách sạn (`Hotel.jsx`) | FR-22, 23 | Có |
| M12 | Cổng quản trị (`Admin.jsx`) | NFR-09 | Có |
| M13 | Hỗ trợ (`Support.jsx`) | FR-16 | Có |

Câu cuối mục 4.2 sửa thành: "Các bảng 4.2–4.4 phân biệt yêu cầu đích với bằng chứng hiện có; trạng thái 'đề xuất' không được tính là chức năng đã hoàn thành."

## 4.3 Hai luồng nghiệp vụ cốt lõi (và 4.3.1)

**Hành động:** Sửa 3 câu, giữ nguyên các hình 4.1–4.10.

1. "Biên hệ thống": thay "gồm 10 màn hình M0–M9" bằng "gồm 14 màn hình M0–M13 (hành khách, khách sạn, quản trị)".
2. Đầu 4.3.1: bỏ câu "luồng quản trị, điều phối và V2 là thiết kế mở rộng, chưa có trong kho mã". Thay bằng:
   > Luồng hành khách, khách sạn và quản trị đều đã có màn hình và API tương ứng. Các chức năng đối soát định kỳ, hồ sơ đối tác nâng cao và quản lý đánh giá thuộc phiên bản V2.
3. Đoạn cuối 4.3.1: bỏ "Quản trị viên thực hiện nghiệp vụ chính thay cho tài khoản khách sạn". Thay bằng: "Nhân sự khách sạn tự xử lý đơn của khách sạn mình (bị giới hạn theo `hotelId` trong token); quản trị viên có vai trò OPS, SUPPORT, FINANCE, SYSADMIN với quyền tách biệt."

**Việc cần làm với hình:** kiểm tra Hình 4.8 (luồng quản trị/điều phối) và Hình 4.10 (sơ đồ trang quản trị) có khớp với các tab thực tế trong `Admin.jsx`, `Hotel.jsx`, `components/partner/*` hay không. Hiện tôi chưa mở các hình này. `[CẦN XÁC NHẬN]`

## 4.4–4.5 Use case và đặc tả

**Hành động:**
- Bảng 4.5 (15 use case): giữ nguyên.
- Bảng 4.6 (tác nhân): thêm 2 dòng.

| Tác nhân | Loại | Vai trò | Use case |
|---|---|---|---|
| Nhân sự khách sạn (`hotel_owner`, lễ tân) | Chính (có đăng nhập) | Xem đơn của khách sạn, xác nhận/từ chối, quản lý phòng và tồn, xử lý yêu cầu hủy/đổi, điều phối xe | UC06, UC13 |
| Quản trị hệ thống (OPS/SUPPORT/FINANCE/SYSADMIN) | Chính (có đăng nhập) | Duyệt khách sạn, cấu hình, đối soát thanh toán, xử lý ticket, xem audit | hỗ trợ UC10–UC15 |

- Câu "Các tác nhân ngoài hệ thống đều là mô phỏng trong V1" giữ, nhưng chỉ áp dụng cho hãng hàng không, nguồn chuyến bay.
- Đoạn "Prototype không thu thập họ tên thật, SĐT, email…": **xóa hoặc viết lại**. Backend lưu họ tên, SĐT khách (đặt phòng, tra cứu bằng mã + SĐT). Viết lại:
  > Hệ thống chỉ thu thông tin tối thiểu để thực hiện đặt phòng và tra cứu: họ tên, số điện thoại. Số điện thoại được chuẩn hóa, dữ liệu nhạy cảm được mã hóa cấp trường, tra cứu sai trả lỗi chung để tránh dò thông tin. Khi vận hành thật phải công bố mục đích, căn cứ xử lý, thời hạn lưu và cơ chế đồng ý theo Luật Bảo vệ dữ liệu cá nhân.
  
  `[CẦN XÁC NHẬN]` danh sách trường thực sự lưu (kiểm tra `database/migrations/001_init.sql`).

## 4.5.1 Mô hình dữ liệu logic và ràng buộc trạng thái

**Hành động:** Thay đoạn "sáu nhóm thực thể". Thay bằng đoạn sau, và vẽ lại ERD từ migration.

> Mô hình dữ liệu được hiện thực trên PostgreSQL với 20 bảng qua 8 migration SQL. Nhóm thực thể chính: khách sạn và phòng (`hotels`, `room_types`, `room_reservations`, `room_blocks`), đặt phòng và quyết định (`bookings`, `booking_decisions`, `change_requests`), thanh toán (`payments`, `refunds`, `ledger_entries`), hỗ trợ và vận hành (`support_tickets`, `support_messages`, `shuttle_requests`), chuyến bay (`flights`, `flight_changes`), tài khoản và quản trị (`accounts`, `roles`, `system_configs`, `audit_logs`, `idempotency_keys`).

Các ràng buộc nên đưa vào báo cáo (đều có trong `docs/postgres/README.md`):
- Khóa chính `uuid`; tiền là `bigint` VND; thời gian `timestamptz`.
- Tồn phòng tính theo khoảng thời gian: tồn = `room_reservations` đang hoạt động + `room_blocks` chưa gỡ; kiểm tra trong transaction bằng `SELECT … FOR UPDATE` trên `room_types`.
- Chống trùng: `UNIQUE (code, flight_date)` cho chuyến bay; một yêu cầu hủy/đổi đang chờ cho mỗi đơn (`UNIQUE (booking_id) WHERE status='PENDING'`); `UNIQUE (booking_id, direction)` cho xe đang hoạt động.
- Chốt giá: `quote` của yêu cầu hủy/đổi và `price_vnd` + `config_version` của xe được chốt lúc tạo.
- Quyết định của khách sạn: CONFIRMED / REJECTED (bắt buộc lý do) / EXPIRED.

Giữ đoạn "Quy tắc bất biến: không hiển thị 'đã được hãng…'" nếu nhóm vẫn áp dụng ở giao diện.

## 4.5.2 Mô hình dữ liệu mở rộng

**Hành động:** Thay Bảng 4.8 bằng bảng ánh xạ sau (tên thực thể thật thay cho tên khái niệm).

| Nhóm dữ liệu | Bảng thực tế | Mục đích |
|---|---|---|
| Khách sạn và phòng | `hotels`, `room_types`, `room_reservations`, `room_blocks` | Hồ sơ, loại phòng, giữ chỗ theo giờ/đêm, khóa/bảo trì phòng |
| Đặt phòng | `bookings`, `booking_decisions`, `change_requests` | Vòng đời đơn, quyết định khách sạn, hủy/đổi |
| Thanh toán | `payments`, `refunds`, `ledger_entries` | Giao dịch VNPay, lệnh hoàn, sổ cái chỉ thêm |
| Hỗ trợ và vận hành | `support_tickets`, `support_messages`, `shuttle_requests` | Ticket, tin nhắn, đưa đón |
| Chuyến bay | `flights`, `flight_changes` | Chuyến bay mô phỏng và lịch sử đổi giờ |
| Tài khoản, cấu hình, kiểm soát | `accounts`, `roles`, `system_configs`, `audit_logs`, `idempotency_keys` | Xác thực, phân quyền, cấu hình có phiên bản, truy vết, chống gửi trùng |

Câu "Trong bản hiện thực frontend, các bảng được biểu diễn bằng mảng/đối tượng…": giữ, bổ sung: "Backend hiện thực các bảng này bằng PostgreSQL."

Các thực thể cũ không có bảng tương ứng (`RATE_LOG`, `PICKUP`, `INCIDENT`, `QUALITY_ISSUE`, `FEATURE_FLAG`, `CATALOG`, `SIM`) cần ghi rõ là "thiết kế mở rộng, chưa có bảng". `[CẦN XÁC NHẬN]`

## 4.6 Ma trận truy vết

**Hành động:** Bảng 4.9, cột "Minh chứng": đổi các giá trị chung chung sang tên màn hình/endpoint/test cụ thể. Ví dụ:

| Nhu cầu | FR/NFR | Use case | Minh chứng |
|---|---|---|---|
| Biết giờ bay mới | FR-01–03 | UC01, UC15 | `Status.jsx`, `GET /v1/flights/:code`, `flights.integration.test.ts` |
| Nơi nghỉ nhận khách | FR-06–10 | UC04–06 | `Stays.jsx`, `GET /v1/hotels`, `rooms.integration.test.ts` |
| Đặt phòng không bán vượt tồn | FR-11, NFR-10 | UC06 | `POST /v1/bookings`, `booking.integration.test.ts` |
| Khách sạn xác nhận/từ chối | FR-22–23 | UC13 | `alternatives.integration.test.ts`, `booking-decisions.integration.test.ts` |
| Theo dõi phản hồi, hủy/đổi | FR-21, 24 | UC11, UC14 | `changeRequests.integration.test.ts`, `support.integration.test.ts` |
| Nhắc giờ quay lại | FR-13 | UC07 | (đã bỏ khỏi giao diện mới) |

## 4.7 Kết luận chương

**Hành động:** Thay câu cuối "Bản hiện thực hiện nay…" bằng:

> Mô hình giữ ranh giới giữa hỗ trợ quyết định và giao dịch thật. Phần backend đã hiện thực các quy tắc nhất quán, phân quyền và truy vết; phần giao diện hành khách vẫn dùng dữ liệu mô phỏng và là bước tích hợp tiếp theo.

---

# CHƯƠNG 5. THIẾT KẾ, XÂY DỰNG VÀ KIỂM THỬ HỆ THỐNG WEBSITE AIRREST

## 5.1 Mục tiêu và phạm vi hiện thực

**Hành động:** Thay toàn bộ đoạn đầu và Bảng 5.1.

> Phiên bản hiện tại là một monorepo gồm giao diện web React nhiều màn hình và một backend Node.js/PostgreSQL. Giao diện bao gồm cổng hành khách (tra cứu chuyến bay, gợi ý phương án nghỉ, tìm và lọc nơi nghỉ, bản đồ, đặt chỗ, nhắc giờ quay lại, hỗ trợ, theo dõi đề nghị), cổng khách sạn và cổng quản trị. Giao diện hiện chạy trên dữ liệu mô phỏng. Backend cung cấp API REST, kênh thời gian thực Socket.IO, xác thực JWT, phân quyền theo quyền hạn, chống gửi trùng, ghi vết và thanh toán VNPay ở chế độ mô phỏng. Hai phần chưa được nối với nhau.

**Bảng 5.1 mới:**

| Lớp | Thành phần | Cách xử lý | Đầu ra |
|---|---|---|---|
| Trình bày | `apps/web`: 13 màn hình, `components/`, `components/partner/` | React 18, state tập trung ở `state/store.jsx` | SPA responsive |
| Dữ liệu giao diện | `apps/web/src/data/*`, `lib/api.js` | Gọi API qua `@airrest/api-client` | Dữ liệu thật từ PostgreSQL (seed 22 sân bay, ~160 khách sạn) |
| API | `backend/api/modules/*` | Express 5, kiểm tra đầu vào bằng zod | REST `/v1/...` |
| Nghiệp vụ | `backend/services`, `packages/business-logic` | Tồn phòng (sweep-line), phí dịch vụ, hủy/đổi | Quy tắc thuần, có unit test |
| Dữ liệu | `backend/database` | PostgreSQL, 8 migration, seed | 20 bảng |
| Hạ tầng | `docker-compose.yml`, `render.yaml` | Docker, Render | Môi trường dev và triển khai |

## 5.2 Hệ thống thiết kế và nguyên tắc giao diện (5.2.1–5.2.3)

**Hành động:** Phần lớn giữ nguyên. Sửa:
- 5.2: "ba cột, hai cột rồi một cột" và biến CSS: đối chiếu lại với `apps/web/src/styles.css` hiện tại (các giá trị màu và breakpoint). `[CẦN XÁC NHẬN]`
- 5.2.1: bỏ câu "giao diện được hiện thực thành một trang"; thay bằng "giao diện gồm nhiều màn hình; sơ đồ màn hình và ảnh chụp nằm ở `reports/ui_implementation/`".
- 5.2.2: **thêm** 2–4 ảnh chụp thật từ `reports/ui_implementation/screenshots/` (ví dụ `01-home-desktop`, `04-stays-desktop`, `24-booking-mobile`, `66-hotel-overview-desktop`, `63-admin-config-desktop`) đặt cạnh wireframe. Wireframe tái dựng có thể giữ làm hình minh họa thiết kế.

## 5.3 Công nghệ và công cụ sử dụng

**Hành động:** Thay Bảng 5.3.

| Nhóm | Công nghệ | Vai trò | Trạng thái |
|---|---|---|---|
| Frontend | HTML5, CSS3, JavaScript, JSX | Cấu trúc, trình bày | Đang dùng |
| Frontend | React 18.3.1, React DOM | Giao diện và state | Đang dùng |
| Build | Vite 6 | Dev server, build tĩnh | Đang dùng |
| Biểu tượng | lucide-react 0.468.0 | Icon | Đang dùng |
| Backend | Node.js ≥ 22, TypeScript, Express 5 | API REST | Đang dùng |
| Thời gian thực | Socket.IO 4 | Đẩy sự kiện đơn | Đang dùng |
| CSDL | PostgreSQL (Supabase), driver `pg` | Lưu trữ | Đang dùng |
| Kiểm tra dữ liệu | zod | Validate đầu vào | Đang dùng |
| Bảo mật | jsonwebtoken, scrypt, helmet, express-rate-limit | Xác thực, băm mật khẩu, giới hạn tần suất | Đang dùng |
| Lưu ảnh | Cloudflare R2 qua `@aws-sdk/client-s3` | URL tải lên ký sẵn | Đang dùng (cần cấu hình `R2_*`) |
| Thanh toán | VNPay (chế độ `mock`) | Thanh toán và IPN | Mô phỏng |
| Tài liệu API | swagger-ui-express, OpenAPI, Postman collection | Mô tả API | Đang dùng |
| Kiểm thử | Vitest, supertest, embedded-postgres | Unit, HTTP, tích hợp | Đang dùng |
| Triển khai | Docker Compose, Render | Chạy dev/triển khai | Đang dùng |
| Thiết kế | Figma (`.figma/`) | Thiết kế giao diện | Có metadata |
| Tích hợp đích | Nối FE với API, dữ liệu chuyến bay thật, thanh toán thật | | Chưa có |

(Bảng này dùng các logo có sẵn ở `docs/images/tech`, `docs/images/tools`. MongoDB không còn là công nghệ đang dùng; chỉ nhắc ở phần thiết kế gốc.)

**5.3.1** Viết lại: tách React/Vite (`apps/web`) và các gói chung (`packages/shared-types`, `validation`, `business-logic`, `utils`) dùng chung giữa FE và BE.

**5.3.2 "Dịch vụ mô phỏng và hợp đồng API"** — thay câu "AIRREST hiện không có lớp service và không fetch/axios" bằng:
> Giao diện gọi API qua `lib/api.js` (đọc `VITE_API_BASE_URL` từ `.env`, thiếu thì hiện màn lỗi cấu hình) và `packages/api-client` (chuẩn hóa lỗi `ApiError`, `Idempotency-Key`, token nhân sự chỉ giữ trong bộ nhớ). Hợp đồng API do backend định nghĩa bằng zod và OpenAPI (`/docs`).

**5.3.3 "Bản đồ, thông báo và lịch"** — viết lại: giao diện mới không dùng bản đồ hay xuất lịch; thông báo bằng khối cảnh báo/toast; không dùng `localStorage` (phiên nhân sự mất khi tải lại trang). Hiệu ứng dùng GSAP (`useGSAP`), tôn trọng `prefers-reduced-motion`.

## 5.4 Kiến trúc hệ thống (5.4.1, 5.4.2)

**Hành động:** Thay đoạn mở đầu và Bảng 5.4 (viết lại), thêm sơ đồ.

> Hệ thống gồm hai khối. Khối giao diện là SPA React. Khối dịch vụ là API Express theo lớp: router (`api/modules`) → service (`services/`) → truy cập dữ liệu (`database/`), cùng các middleware xác thực, validate, idempotency, rate limit. Socket.IO đẩy sự kiện đơn theo phòng quyền hạn. Cơ sở dữ liệu là PostgreSQL.

**Bảng 5.4 mới:**

| Lớp | Thành phần | Trách nhiệm | Hiện trạng |
|---|---|---|---|
| Trình bày | `screens`, `components`, `Layout` | Hiển thị, nhận thao tác | `apps/web` |
| Trạng thái | `state/store.jsx` | Màn hình hiện tại, phiên nhân sự | Cục bộ, không ghi `localStorage` |
| Dữ liệu giao diện | `data/*` | Gọi API | Có |
| API | `api/modules/*` | REST, kiểm tra đầu vào, phân quyền | Có |
| Nghiệp vụ | `services/*`, `packages/business-logic` | Đặt phòng, thanh toán, hủy/đổi, tồn | Có |
| Dữ liệu | `database/*`, migrations | Truy cập, transaction, migrate | Có |
| Thời gian thực | `api/realtime` | Đẩy sự kiện đơn | Có |
| Hạ tầng | Docker, Render | Chạy và triển khai | Có |

**5.4.1 Luồng xử lý một yêu cầu:** thêm luồng backend, ví dụ đặt phòng: `POST /v1/bookings` → validate zod → kiểm tra Idempotency-Key → transaction (khóa tồn, kiểm tra tồn theo khoảng thời gian, ghi đơn + giữ phòng + audit) → trả mã đơn. Giữ luồng giao diện (event handler → store → render) như hiện có.

**5.4.2 Mô hình triển khai:** thay câu "không có cấu hình backend, Docker, CSDL, biến môi trường" bằng mô tả `docker-compose.yml` (dịch vụ `api`, `web`, `db` tùy chọn), `render.yaml`, biến môi trường kiểm tra bằng zod và dừng ngay khi thiếu (`config/env.ts`), và `DATABASE_URL` trỏ Supabase hoặc Postgres local.

## 5.5 Các phân hệ chức năng

**Hành động:** Thay Bảng 5.5.

| Phân hệ | Chức năng | Mức hiện thực | Khoảng trống |
|---|---|---|---|
| Cổng hành khách | Trang chủ, tra cứu, gợi ý, quyền lợi, trợ giúp | Giao diện có, dữ liệu mô phỏng | Chưa nối API |
| Chuyến bay | Tra cứu theo mã; lịch sử đổi giờ | Backend có; giao diện mô phỏng | Chưa có nguồn thật |
| Nơi nghỉ | Danh sách, bộ lọc, bản đồ, chi tiết | Giao diện + API `hotels` | Chưa nối; chưa phân trang ở FE |
| Đặt chỗ | Tạo đơn (thanh toán tại khách sạn hoặc VNPay), tra cứu bằng mã + SĐT, hủy/đổi ngày, xe đưa đón | Giao diện gọi API thật, có test backend | VNPay chế độ mock |
| Thanh toán | Link VNPay, IPN, đối soát, hoàn tiền | Backend có (mock) | Chưa có giao dịch thật |
| Hủy/đổi | Báo giá, yêu cầu, duyệt/từ chối | Backend có | Giao diện mô phỏng |
| Hỗ trợ | Ticket, tin nhắn, ghi chú nội bộ | Backend + màn hình | Chưa nối |
| Đưa đón | Báo giá, tạo, phân xe, hoàn tất, hủy | Backend có | Giao diện `[CẦN XÁC NHẬN]` |
| Cổng khách sạn | Đơn, xác nhận/từ chối kèm thay thế, phòng, tồn, khóa phòng, giá, thống kê | Giao diện + API | Chưa nối |
| Cổng quản trị | Khách sạn (duyệt/tạm dừng), tài khoản, cấu hình có phiên bản, ticket, chuyến bay, thanh toán, audit, dashboard | Giao diện + API | Chưa nối |

## 5.6 Trạng thái nghiệp vụ và dữ liệu

**Hành động:** Đổi tiêu đề Bảng 5.6 thành "Quy tắc dữ liệu đã hiện thực" và thêm cột "Cách hiện thực":

| Nội dung | Yêu cầu | Cách hiện thực |
|---|---|---|
| Khóa, chỉ mục | Mã duy nhất; chỉ mục theo sân bay, trạng thái, thời gian | `UNIQUE` và chỉ mục trong migration; phân trang keyset bằng `seq` |
| Nhất quán | Cập nhật nguyên tử, chống trùng, xung đột | Transaction + `SELECT … FOR UPDATE`; `idempotency_keys` |
| Lịch sử | Không ghi đè thay đổi quan trọng | `audit_logs`, `flight_changes`, `system_configs` theo phiên bản, `ledger_entries` chỉ thêm |
| Riêng tư | Tối thiểu hóa, phân quyền | Mã hóa cấp trường, RBAC theo permission, khóa theo `hotelId` |
| Nguồn và độ mới | Nguồn, thời điểm, cờ dữ liệu cũ | Nhãn "mô phỏng" ở giao diện; `[CẦN XÁC NHẬN]` cờ dữ liệu cũ trong `flights` |

## 5.7 Hiện thực luồng hành khách (5.7.1–5.7.3)

**Hành động:**
- 5.7.1: giữ mô tả bộ lọc; thêm đặt phòng ở backend (Idempotency-Key bắt buộc, giữ phòng theo `booking.hold.holdMinutes` với thanh toán VNPay, đơn `PENDING_PAYMENT`).
- 5.7.2 "Đề nghị hãng hỗ trợ": bỏ câu "máy trạng thái cho phép trình diễn hãng duyệt…". Viết rõ: phản hồi của **hãng** là mô phỏng; **khách sạn** duyệt/từ chối là thật ở backend (`booking_decisions`, hạn chờ `approvalExpireMin`).
- 5.7.3: giữ công thức giờ rời; thêm xuất lịch `.ics`.

## 5.8 Hiện thực phân hệ đối tác và quản trị

**Hành động:** Viết lại hoàn toàn.

> Cổng khách sạn gồm tổng quan, đơn đặt, loại phòng và tồn, khóa/bảo trì phòng, giá, thống kê (`screens/Hotel.jsx`, `components/partner/HotelTabs1–3`). Cổng quản trị gồm khách sạn, tài khoản, cấu hình, ticket, chuyến bay, thanh toán, audit (`screens/Admin.jsx`, `components/partner/AdminTabs1–3`). Backend cung cấp các nhóm API `/v1/hotel/*` và `/v1/admin/*` với kiểm tra quyền theo permission. Các thao tác nhạy cảm (đổi tài khoản nhận tiền của khách sạn) có bước duyệt riêng.

Liệt kê tối đa 10 nhóm endpoint tiêu biểu thay cho danh sách đầy đủ; phần còn lại đưa vào phụ lục (xem mục "Phụ lục đề xuất").

## 5.9 Xác thực, phân quyền và bảo vệ dữ liệu

**Hành động:** Viết lại hoàn toàn. Nội dung:

- Tài khoản nội bộ đăng nhập `POST /v1/auth/login`, mật khẩu băm scrypt, token JWT, `GET /v1/auth/me`.
- Phân quyền theo permission (`config/permissions.ts`), vai trò hệ thống OPS, SUPPORT, FINANCE, SYSADMIN và `hotel_owner`; quyền nạp từ CSDL; khách sạn bị khóa theo `hotelId` trong token.
- Khách vãng lai tra cứu bằng mã + SĐT; sai thì trả 404 chung; được cấp `guestToken` cho Socket.IO.
- Chống lạm dụng: rate limit chặt cho login/lookup/flight, helmet, CORS cấu hình được, idempotency cho thao tác ghi.
- Dữ liệu nhạy cảm: mã hóa cấp trường (`lib/crypto.ts`, `DATA_ENC_KEY`); audit log mọi thao tác nhạy cảm.
- Giới hạn: `[CẦN XÁC NHẬN]` hạn lưu dữ liệu, cơ chế đồng ý, quy trình xóa theo yêu cầu chưa có.
- Tài khoản mẫu và mật khẩu mẫu (`SEED_PASSWORD`) chỉ dùng cho dev, **không đưa vào báo cáo in**.

## 5.10 Responsive và khả năng tiếp cận

**Hành động:** Giữ phần lớn. Đối chiếu breakpoint (900/620) với `apps/web/src/styles.css`; thêm ảnh chụp mobile (`20-home-mobile`, `24-booking-mobile`, `86-shell-mobile-drawer`, `72-hotel-mobile`). Phần accessibility vẫn ghi "chưa audit" nếu chưa có kết quả kiểm tra bàn phím, screen reader. `[CẦN XÁC NHẬN]`

## 5.11 Chiến lược kiểm thử

**Hành động:** Viết lại hoàn toàn mục và Bảng 5.7.

> Backend được kiểm thử bằng Vitest ở ba tầng: unit cho quy tắc thuần (ví dụ `cancellation.unit.test.ts`, `shuttle.unit.test.ts`), HTTP cho middleware, và tích hợp trên PostgreSQL nhúng (`embedded-postgres`) hoặc DB local, gồm cả test migration. Tổng cộng khoảng 199 test case trong 24 file. Giao diện được kiểm tra bằng ảnh chụp thủ công các trạng thái chính (`reports/ui_implementation/`), chưa có test tự động.

**Bảng 5.7 mới:**

| Nhóm kiểm thử | Bằng chứng | Kết quả | Khoảng trống |
|---|---|---|---|
| Kiểm tra kiểu | `npm run typecheck` | `[CẦN XÁC NHẬN]` chạy và ghi kết quả | Chưa có lint |
| Unit | `cancellation.unit`, `shuttle.unit` và các test gói chung | `[CẦN XÁC NHẬN]` | |
| HTTP | Middleware, storage | `[CẦN XÁC NHẬN]` | |
| Tích hợp (DB) | `booking`, `booking-decisions`, `booking-expiry`, `booking-admin-list`, `alternatives`, `changeRequests`, `rooms`, `room-blocks`, `shuttle`, `support`, `flights`, `admin`, `dashboard` | `[CẦN XÁC NHẬN]` `npm run test:db` | |
| Migration | `rooms.migration`, `booking-decisions.migration` | `[CẦN XÁC NHẬN]` | |
| Giao diện/E2E | Ảnh chụp thủ công | Có ảnh | Chưa có kịch bản tự động |
| Tiếp cận, usability | Thuộc tính ngữ nghĩa trong mã | Chưa đo | Cần audit và phiên thử người dùng |

**Việc phải làm trước khi nộp:** chạy `npm run typecheck`, `npm test`, `npm run test:db`; chép số pass/fail vào cột "Kết quả" của Bảng 5.7. Không được ghi "199 test pass" nếu chưa chạy.

## 5.12 Giới hạn của bản hiện thực

**Hành động:** Viết lại.

1. Đăng nhập hành khách là mô phỏng (backend chưa có tài khoản hành khách).
2. Dữ liệu chuyến bay, giá, tồn là mô phỏng; chưa có nguồn thời gian thực.
3. Thanh toán VNPay ở chế độ `mock`.
4. Phản hồi của hãng hàng không là mô phỏng.
5. Chưa có test tự động ở giao diện; chưa đo hiệu năng và tiếp cận.
6. Hạn lưu dữ liệu cá nhân và cơ chế đồng ý chưa hoàn thiện.
7. Ứng dụng di động (`apps/mobile`) chưa làm.

## 5.13 Lộ trình hoàn thiện hệ thống

**Hành động:** Thay các bước (1)–(3) vì đã làm. Lộ trình mới:

1. Bổ sung tài khoản hành khách ở backend; test giao diện tự động và E2E; đo hiệu năng, kiểm tra tiếp cận.
2. Bổ sung test giao diện và E2E; lint; chạy Lighthouse, audit tiếp cận.
3. Tích hợp nguồn chuyến bay thật; chuyển VNPay sang chế độ thật khi có khóa.
4. Hoàn thiện đối soát, thông báo, job nền; hạn lưu dữ liệu và đồng ý.
5. Thử nghiệm thực địa tại Nội Bài, sau đó đánh giá Tân Sơn Nhất.

---

# KẾT LUẬN (phần liên quan Chương 4, 5)

**Hành động:** Sửa 3 chỗ.
- "Hạn chế": bỏ ý "chưa có backend". Thay bằng "đăng nhập hành khách là mô phỏng; dữ liệu chuyến bay, thanh toán VNPay và phản hồi hãng là mô phỏng".
- "Hướng phát triển": bỏ "xây dựng API Node.js/Express, MongoDB/Mongoose, Socket.IO, xác thực và RBAC" (đã làm, và CSDL là PostgreSQL). Thay bằng lộ trình ở mục 5.13.
- Đoạn chốt "kết quả hiện tại là hệ thống website AIRREST ở mức frontend chức năng…": thay bằng
  > Kết quả hiện tại là hệ thống AIRREST gồm giao diện web đa vai trò gọi API thật và một backend PostgreSQL có xác thực, phân quyền, nghiệp vụ đặt phòng, thanh toán mô phỏng và bộ kiểm thử tự động. Bước tiếp theo là tích hợp hai khối và kết nối dữ liệu thật.

Phần "Bốn giai đoạn" trong Hướng phát triển: giai đoạn 1 ("triển khai Node.js/Express, MongoDB/Mongoose và bộ test") phải viết lại vì đã làm; giai đoạn 3 đổi từ "chuyển các màn hình… sang API có phân quyền" thành "nối giao diện với API đã có".

# Phụ lục đề xuất (thêm mới)

- **Phụ lục: Danh mục API.** Bảng các nhóm endpoint (health, auth, hotels, flights, bookings, payments, change-requests, support, shuttle, hotel/*, admin/*) lấy từ `backend/api/modules` và `backend/docs/Airrest_Admin_API.postman_collection.json`.
- **Phụ lục: Lược đồ CSDL.** ERD 20 bảng, sinh từ `backend/database/migrations/*.sql` và bảng ánh xạ ở `docs/postgres/README.md`.
- **Phụ lục: Ma trận quyền.** Vai trò × permission lấy từ `backend/config/roles.ts` và `permissions.ts`.

---

# Danh sách việc kiểm tra còn lại (nhóm phải làm)

1. Chạy `npm run typecheck`, `npm test`, `npm run test:db`; điền Bảng 5.7.
2. Chốt `apps/web` là nguồn FE, xử lý `src/` trùng lặp.
3. Mở các hình 4.1–4.10, 5.1–5.2 và kiểm tra khớp với màn hình thật.
4. Kiểm tra các mục `[CẦN XÁC NHẬN]` ở trên (FR-14, FR-17, trường dữ liệu cá nhân thật sự lưu, Notification API, màn hình đưa đón, cờ dữ liệu cũ).
5. Đối chiếu Chương 1 đến 3 và các Phụ lục (chưa được kiểm tra trong lần này).
