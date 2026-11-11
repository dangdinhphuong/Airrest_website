# Airrest — thiết kế các luồng còn lại (ngoài thanh toán)

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Nguồn đối chiếu: [BACKEND_TASKS.md](../../BACKEND_TASKS.md), `docs/srs/SRS_V2_NenTang_Airrest.md`, `docs/MVP.md`

## 1. Mục đích
Backend Airrest hiện có: tìm/chi tiết khách sạn, đặt phòng không tài khoản, tra cứu booking, check-in, quản trị khách sạn/tài khoản/cấu hình/nhật ký, upload ảnh R2. Tài liệu này chốt cách làm các luồng còn thiếu để một nhóm dev lên kế hoạch và thực hiện, cả BE lẫn FE (FE hiện dùng dữ liệu mock, chưa nối API).

## 2. Phạm vi
**Trong phạm vi (6 luồng):**
1. Vận hành booking: khách sạn xác nhận/từ chối, admin xem toàn bộ booking.
2. Quản lý phòng: CRUD loại phòng, tồn kho theo ngày, khóa phòng/bảo trì.
3. Yêu cầu đổi/hủy booking và xử lý.
4. Hỗ trợ: khách gửi yêu cầu, admin xử lý.
5. Xe đưa đón: khách yêu cầu, vận hành xử lý.
6. Chuyến bay (tra cứu + trạng thái) và Dashboard.

Mỗi luồng gồm: BE, FE (nối API thay mock), test, cập nhật Swagger/Postman/docs DB.

**Ngoài phạm vi (non-goals):**
- Luồng thanh toán và cổng VNPay: **tạm dừng** theo yêu cầu. Các luồng dưới đây không được gọi cổng thanh toán. Chỗ nào cần hoàn tiền thì chỉ ghi lệnh hoàn (`refunds`) ở trạng thái chờ, việc thực thi để sau.
- API chuyến bay ngoài (FlightAware, AviationStack...). Dùng dữ liệu mẫu + admin chỉnh tay.
- Thông báo email/SMS/push, chat 24/7 realtime, bản đồ, gọi xe bên thứ ba (đã loại ở MVP.md).
- Tài khoản/điểm/voucher B2B.

**Anti-goal:** mỗi luồng phải chạy được khi tắt thanh toán online (`VNPAY_ENABLED=false`, đặt trả tại khách sạn).

## 3. Quyết định đã chốt (do người dùng)
- **Booking cần khách sạn xác nhận**: lễ tân phải bấm xác nhận thì phòng mới giữ chắc.

## 4. Quyết định do tôi đề xuất (cần bạn duyệt, đánh dấu "[đề xuất]")
| # | Chủ đề | Đề xuất |
|---|---|---|
| D1 | Trạng thái booking | Mọi đơn mới vào `PENDING` (chờ khách sạn). `CONFIRMED` sau khi xác nhận. Từ chối → `REJECTED`. Quá hạn giữ chỗ mà chưa phản hồi → `EXPIRED`, nhả phòng. Công tắc `hotel.approval.manual` (đã có) giữ lại: tắt thì đơn tự `CONFIRMED` như hiện tại. Khách sạn mới mặc định bật. |
| D2 | Từ chối | Bắt buộc lý do; kèm tối đa 3 khách sạn thay thế còn phòng cùng sân bay (MVP FR-23). Nếu đơn đã thu tiền → tạo `refunds` PENDING, chưa thực thi. |
| D3 | Đổi/hủy | Khách gửi yêu cầu bằng mã booking + SĐT (không cần tài khoản). Khách sạn duyệt, admin có thể duyệt thay. Phí hủy tính theo cấu hình `cancellation` trong `system_configs` (miễn phí nếu trước N giờ, sau đó phần trăm). Duyệt hủy → booking `CANCELLED`, nhả phòng, tạo lệnh hoàn nếu đã thu tiền. Đổi = đổi ngày; kiểm tra phòng trống lại, giá giữ theo đơn gốc cộng chênh lệch nếu có. |
| D4 | Hỗ trợ | Bảng `support_tickets` + `support_messages`. Khách gửi bằng mã booking + SĐT hoặc không gắn booking (có liên hệ). Admin có quyền `support:handle`. Trạng thái OPEN → IN_PROGRESS → RESOLVED. Không realtime, khách xem lại bằng mã ticket + SĐT. |
| D5 | Xe | Bảng `shuttle_requests` gắn booking. Trạng thái REQUESTED → ASSIGNED → DONE hoặc CANCELLED. Giá lấy từ cấu hình xe (`admin:config:shuttle`, đã có). Vận hành (admin) hoặc khách sạn gán tài xế bằng tên + SĐT nhập tay. |
| D6 | Chuyến bay | Bảng `flights` (mã, hãng, đi/đến, giờ dự kiến/mới, trạng thái, `updated_at`) + `flight_changes` lưu lịch sử đổi giờ. Seed theo dữ liệu mock hiện có ở FE. Admin sửa giờ/trạng thái để mô phỏng. `GET /v1/flights/:code` công khai, nhãn "mô phỏng". |
| D7 | Phòng | Loại phòng có CRUD riêng. Tồn kho tính từ `room_reservations` đã có, thêm bảng `room_blocks` (khóa/bảo trì theo khoảng ngày). Kiểm tồn khi đặt phải trừ cả `room_blocks`. |
| D8 | Dashboard | Hai endpoint đọc: toàn hệ thống (admin) và theo khách sạn (có sẵn `stats`, mở rộng). Không bảng mới, truy vấn tổng hợp. |
| D9 | Phân quyền | Chỉ theo permission, không theo tên vai trò (quy tắc hiện hành). Thêm mã quyền mới tối thiểu: `booking:decide`, `request:handle`, `support:handle`, `shuttle:handle`, `flight:manage`, `admin:dashboard:read`, `room:manage`. Gán vào vai trò trong `seed`. |

## 5. Ràng buộc kỹ thuật (áp dụng mọi task)
- Stack hiện có: Node 22 + Express 5 + zod 3 + `pg` (SQL thuần), vitest + supertest, React/Vite. Không thêm ORM.
- Migration SQL thuần `backend/database/migrations/00N_*.sql`, tiếp theo là **003**. Mỗi luồng một file, theo thứ tự. Mỗi file kèm cập nhật `docs/postgres/README.md`.
- Mọi ghi dữ liệu đi qua transaction `withTransaction` và gọi `writeAudit` cùng transaction.
- Route khách (không đăng nhập) dùng `strictRateLimit` và `Idempotency-Key` với thao tác tạo.
- Id là uuid; phân trang keyset theo `seq`.
- Mỗi route mới phải cập nhật `api/openapi.ts` (Swagger) và file Postman.
- Sự kiện thay đổi booking đi qua `bookingEvents` để Socket.io đẩy tới giao diện.
- Test: mỗi luồng có test tích hợp (`RUN_DB_TESTS=1`); trạng thái cuối `npm run typecheck` sạch.
- Không in/lưu bí mật; `.env` là bí mật.

## 6. Thành công khi
- Khách đặt phòng trả tại khách sạn → lễ tân thấy đơn realtime → xác nhận hoặc từ chối (có lý do + gợi ý) → khách tra cứu thấy kết quả.
- Khách gửi được yêu cầu hủy/đổi, hỗ trợ, xe, và tra cứu trạng thái bằng mã.
- Khách tra chuyến bay theo mã và thấy giờ cũ/mới/trạng thái.
- Admin xem toàn bộ booking, dashboard, xử lý yêu cầu và hỗ trợ; mọi thao tác có trong nhật ký.
- FE các màn tương ứng chạy bằng API thật, không còn dữ liệu mock cho luồng đó.

## 7. Thứ tự và phụ thuộc
1. Luồng 2 (phòng) và luồng 1 (xác nhận/từ chối): lõi, đụng đặt phòng hiện có. Làm trước.
2. Luồng 3 (đổi/hủy): phụ thuộc luồng 1 (trạng thái) và luồng 2 (nhả phòng).
3. Luồng 4 (hỗ trợ), 5 (xe), 6 (chuyến bay): độc lập nhau, làm song song được sau luồng 1.
4. Dashboard làm cuối vì tổng hợp dữ liệu của các luồng trước.
5. FE nối API đi theo từng luồng, sau khi BE luồng đó xong.

## 8. Việc để người thực hiện quyết định
Tên cột/index chi tiết, cấu trúc thư mục module, thông điệp lỗi, giao diện FE chi tiết (theo thiết kế sẵn trong `docs/figma`, `docs/airrest-ux-design-analysis-v2.md`).
