# Airrest — Danh sách task Backend/Frontend và hiện trạng

> Đối chiếu danh sách task của nhóm với backend thực tế (kiểm tra theo route và bảng DB, ngày 2026-11-11).
> Nguồn yêu cầu: `srs/SRS_V2_NenTang_Airrest.md` (module FLT, SRC, BKG, PAY, SHT, SUP, HTL, ADM, CXL/RFD/DSP) và `MVP.md`.
> Trạng thái: **Có** = đã có BE chạy được · **Một phần** = còn thiếu chức năng · **Thiếu** = chưa có bảng/route.
> FE hiện vẫn dùng dữ liệu mock, chưa nối API (áp dụng cho mọi dòng "Frontend").

## 1. Bảng đối chiếu

| # | Task | BE | Module SRS | Ghi chú |
|---|---|---|---|---|
| 1 | ERD và API contract | Có | — | `postgres/README.md`, `database/migrations/001_init.sql`, file Postman. Chưa có OpenAPI. |
| 2 | Tra cứu chuyến bay | **Thiếu** | FLT | Chỉ có mock ở FE. |
| 3 | Trạng thái chuyến bay | **Thiếu** | FLT | Như trên. |
| 4 | Tìm và lọc khách sạn | Có | SRC | `GET /v1/hotels`. Cần rà bộ lọc theo SRS 3.2. |
| 5 | Chi tiết khách sạn | Có | SRC | `GET /v1/hotels/:id`. |
| 6 | Đặt phòng không tài khoản | Có | BKG | `POST /v1/bookings`, có idempotency và khóa phòng. |
| 7 | Theo dõi booking | Có | BKG | `POST /v1/bookings/lookup`. |
| 8 | Yêu cầu hỗ trợ | **Thiếu** | SUP | |
| 9 | Yêu cầu đổi/hủy | **Thiếu** | CXL/RFD | Mới có `refunds` phía payments. |
| 10 | Phương thức thanh toán | Một phần | PAY | Chỉ VNPay (mock/live). |
| 11 | Yêu cầu xe | **Thiếu** | SHT | |
| 12 | Đăng nhập quản trị | Có | ADM | `POST /v1/auth/login`, `GET /v1/auth/me`. |
| 13 | Dashboard | Một phần | ADM | Chỉ có `GET /v1/admin/hotels/:id/stats`. |
| 14 | Quản lý khách sạn | Có | ADM | Tạo, sửa, duyệt, từ chối, đình chỉ, kích hoạt, tài khoản nhận tiền. |
| 15 | Quản lý phòng | Một phần | HTL | Chưa có CRUD loại phòng riêng và tồn kho theo ngày. |
| 16 | Quản lý booking | Một phần | HTL/ADM | Có danh sách theo khách sạn và check-in. Chưa có admin xem toàn bộ. |
| 17 | Xác nhận/từ chối booking | **Thiếu** | HTL | Booking đang tự xác nhận khi thanh toán. |
| 18 | Xử lý hỗ trợ | **Thiếu** | SUP | Phụ thuộc #8. |
| 19 | Nhật ký thao tác | Có | ADM | `GET /v1/admin/audit-logs`. |
| 20 | Xử lý đổi/hủy | **Thiếu** | CXL/RFD | Phụ thuộc #9. |
| 21 | Dịch vụ xe | **Thiếu** | SHT | Phụ thuộc #11. |
| 22 | Theo dõi thanh toán | Có | PAY | payments, refunds, reconcile, retry. |

**Test:** đã có test cho booking, payments, admin, storage, http (`backend/tests`). Chưa có test theo từng nhóm cho các mục "Test — …" trong danh sách nhóm (Tìm và lọc, Quản lý booking, Xác nhận/từ chối, Hỗ trợ, Nhật ký, Đổi/hủy, Theo dõi thanh toán).

## 2. Đã làm nhưng chưa có trong danh sách của nhóm

Nên thêm vào danh sách task:

- Quản lý tài khoản admin và vai trò: `/v1/admin/accounts`, `/v1/admin/roles`.
- Cấu hình hệ thống có phiên bản: `/v1/admin/configs`.
- Upload ảnh lên Cloudflare R2 bằng presigned URL: `POST /v1/admin/media/upload-url`.
- VNPay: tạo link, IPN, hoàn tiền tự động, đối soát thủ công.
- Realtime booking qua Socket.io (chạy một tiến trình).

## 3. Phần còn thiếu — đề xuất thiết kế

Chưa chốt với nhóm. Mỗi nhóm đều thêm bảng và migration mới, nên cần xác nhận phạm vi trước khi làm.

### 3.1 Xác nhận/từ chối booking (#17, #16)
- Bổ sung: `PATCH /v1/hotel/bookings/:id/confirm` và `/reject` (kèm lý do), `GET /v1/admin/bookings` (xem toàn bộ, lọc, phân trang).
- Cần quyết định: booking đã thanh toán có chờ khách sạn xác nhận không, và từ chối thì tự hoàn tiền (dùng `refunds`) hay không.
- Ghi audit cho mọi thao tác; phát sự kiện `bookingEvents` để Socket.io đẩy lên giao diện.

### 3.2 Yêu cầu đổi/hủy và xử lý (#9, #20)
- Bảng mới `change_requests`: `id, booking_id, type (CANCEL|CHANGE), reason, status (PENDING|APPROVED|REJECTED), decided_by, decided_at, created_at`.
- Khách gửi qua mã booking (không cần tài khoản). Admin hoặc khách sạn duyệt. Duyệt hủy thì tạo `refunds` theo chính sách hủy của khách sạn.
- Cần quyết định: tính phí hủy theo cấu hình nào (`system_configs`).

### 3.3 Hỗ trợ (#8, #18)
- Bảng mới `support_tickets`: `id, booking_id?, contact, subject, body, status (OPEN|IN_PROGRESS|RESOLVED), assignee, created_at` và `support_messages` cho trao đổi.
- Route: khách `POST /v1/support`, `GET /v1/support/:code`; admin `GET/PATCH /v1/admin/support`.
- MVP.md ghi FR-16 (hỗ trợ 24/7) là Could và FR-21 là Must; cần chốt phạm vi.

### 3.4 Xe đưa đón (#11, #21)
- Bảng mới `shuttle_requests`: `id, booking_id, pickup_at, location, status (REQUESTED|ASSIGNED|DONE|CANCELLED)`.
- FE mock đã có luồng `PICKUP_FLOW`, có thể tái sử dụng trạng thái.
- MVP.md ghi FR-17 (gọi xe) là "Đã loại"; cần xác nhận có đưa lại không.

### 3.5 Chuyến bay (#2, #3)
- Cần chốt nguồn dữ liệu: API ngoài hoặc dữ liệu mẫu. MVP.md ghi "Mock D1".
- Bản nhỏ nhất: bảng `flights` seed sẵn, `GET /v1/flights/:code` trả giờ cũ/mới, trạng thái, thời điểm cập nhật.

### 3.6 Dashboard (#13)
- `GET /v1/admin/dashboard`: số booking theo trạng thái, doanh thu, số khách sạn chờ duyệt, ticket đang mở. Làm sau khi có 3.1–3.3.

### 3.7 Phương thức thanh toán (#10) và quản lý phòng (#15)
- Thanh toán: thêm trường phương thức trên `payments` và ít nhất một phương thức mô phỏng ngoài VNPay (MVP.md yêu cầu ≥2 cách trả mô phỏng).
- Phòng: `POST/PATCH/DELETE /v1/hotel/room-types` và tồn kho theo ngày.

## 4. Thứ tự đề xuất

1. 3.1 Xác nhận/từ chối và admin xem booking (lõi, đụng luồng booking hiện có).
2. 3.2 Đổi/hủy (dùng sẵn `refunds`).
3. 3.3 Hỗ trợ và 3.4 Xe (bảng độc lập).
4. 3.7 Thanh toán và phòng.
5. 3.5 Chuyến bay (chờ chốt nguồn dữ liệu).
6. 3.6 Dashboard, sau đó nối FE với API và viết test theo từng nhóm.

## 5. Câu hỏi cần nhóm chốt

1. Booking có cần khách sạn xác nhận sau khi thanh toán không?
2. Chính sách phí hủy và hoàn tiền lấy từ đâu?
3. Có đưa lại luồng xe (FR-17) và hỗ trợ 24/7 (FR-16) vào MVP không?
4. Dữ liệu chuyến bay dùng API ngoài hay mock?
