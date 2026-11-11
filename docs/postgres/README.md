# Airrest — schema PostgreSQL (Supabase)

Nguồn sự thật: [backend/database/migrations/](../../backend/database/migrations/) (SQL thuần, áp bằng `npm run db:migrate`, ghi vết ở `schema_migrations`).
Thiết kế nghiệp vụ gốc vẫn là [docs/mongodb/THIET_KE_MONGODB_AIRREST.md](../mongodb/THIET_KE_MONGODB_AIRREST.md); bảng dưới là phép chuyển sang quan hệ.

| Collection Mongo | Bảng Postgres | Khác biệt đáng chú ý |
|---|---|---|
| hotels, roles, accounts, room_types | cùng tên | giá trị lồng (địa chỉ, chính sách, vị trí, sân bay, tài khoản nhận tiền) để `jsonb`; sân bay lọc bằng `airports @> '[{"iata":"HAN"}]'` (GIN) |
| bookings | bookings | `payment.*` tách thành cột `payment_method/payment_status/paid_vnd/refunded_vnd`; `stay_from` là bản sao của `stay.from` để index |
| room_reservations (`from`,`to`) | room_reservations (`starts_at`,`ends_at`) | |
| inventory_locks | — | thay bằng `SELECT … FOR UPDATE` trên dòng `room_types` trong transaction đặt phòng |
| payments, refunds | payments, refunds | unique `txn_ref` (trước migration 002 là `momo_order_id`; cột `momo` đổi thành `gateway`), `refunds.key` thay unique index Mongo |
| ledger_entries | ledger_entries | chỉ thêm; `ref_type/ref_id` |
| audit_logs | audit_logs | khóa `id` identity tăng dần dùng làm con trỏ phân trang |
| system_configs | system_configs | `UNIQUE (key, version)` |
| idempotency_keys (TTL) | idempotency_keys | không có TTL tự động: dọn khi gặp lại key hết hạn |
| (mới, migration 003) room_blocks + cột mới của room_types | room_blocks | khóa/bảo trì phòng theo khoảng giờ (`qty`, `released_at`); `room_types` thêm `code` (unique theo khách sạn), `capacity`, `beds`, `area_m2`, `retired_at`. Tồn = `room_reservations` đang hoạt động + `room_blocks` chưa gỡ |
| (mới, migration 004) booking_decisions | booking_decisions | quyết định của khách sạn với đơn chờ: CONFIRMED / REJECTED (bắt buộc lý do) / EXPIRED, kèm `alternatives` (tối đa 3 khách sạn gợi ý). Khách sạn tạo mới mặc định `approval.manual = true`; hạn chờ lấy từ `booking.hold.approvalExpireMin` |
| (mới, migration 005) change_requests | change_requests | yêu cầu hủy/đổi ngày của khách; `UNIQUE (booking_id) WHERE status='PENDING'` (một yêu cầu đang chờ mỗi đơn); `quote` chốt lúc gửi (BR-CXL-03). Lệnh hoàn do hủy/đổi: `refunds.key = 'cancel:<id>'` / `'change:<id>'`, `due_at = 'infinity'` (chưa thực thi, thanh toán đang tạm dừng) |
| (mới, migration 006) support_tickets, support_messages | cùng tên | ticket hỗ trợ (`code` SP-xxxxxxxx) + tin nhắn; `internal = true` là ghi chú nội bộ, không trả cho khách |
| (mới, migration 007) shuttle_requests | shuttle_requests | xe đưa đón gắn booking; giá chốt lúc tạo (`price_vnd`, `config_version`); `UNIQUE (booking_id, direction) WHERE status IN ('REQUESTED','ASSIGNED')`; `distance_km` lấy từ `hotels.airports` (không gọi định tuyến) |
| (mới, migration 008) flights, flight_changes | cùng tên | chuyến bay MÔ PHỎNG + lịch sử đổi giờ; `flight_date` là cột sinh theo giờ VN, `UNIQUE (code, flight_date)` |
| (migration 002) | — | đổi cổng thanh toán MoMo → VNPay: `momo_order_id`→`txn_ref`, `momo`→`gateway`, `momoRetries`→`gatewayRetries` |
| Change Stream `bookings` | `services/events.ts` | phát sự kiện sau commit, trong một tiến trình |

Quy ước: khóa chính `uuid` (`gen_random_uuid()`); bảng cần phân trang có `seq` identity làm con trỏ keyset; tiền `bigint` VND; thời gian `timestamptz`.
Sửa schema: thêm file `NNN_ten.sql` mới, không sửa file đã áp; cập nhật bảng này và `backend/database/types.ts`.
