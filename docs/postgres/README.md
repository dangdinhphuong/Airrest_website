# Airrest — schema PostgreSQL (Supabase)

Nguồn sự thật: [backend/database/migrations/](../../backend/database/migrations/) (SQL thuần, áp bằng `npm run db:migrate`, ghi vết ở `schema_migrations`).
Thiết kế nghiệp vụ gốc vẫn là [docs/mongodb/THIET_KE_MONGODB_AIRREST.md](../mongodb/THIET_KE_MONGODB_AIRREST.md); bảng dưới là phép chuyển sang quan hệ.

| Collection Mongo | Bảng Postgres | Khác biệt đáng chú ý |
|---|---|---|
| hotels, roles, accounts, room_types | cùng tên | giá trị lồng (địa chỉ, chính sách, vị trí, sân bay, tài khoản nhận tiền) để `jsonb`; sân bay lọc bằng `airports @> '[{"iata":"HAN"}]'` (GIN) |
| bookings | bookings | `payment.*` tách thành cột `payment_method/payment_status/paid_vnd/refunded_vnd`; `stay_from` là bản sao của `stay.from` để index |
| room_reservations (`from`,`to`) | room_reservations (`starts_at`,`ends_at`) | |
| inventory_locks | — | thay bằng `SELECT … FOR UPDATE` trên dòng `room_types` trong transaction đặt phòng |
| payments, refunds | payments, refunds | unique `momo_order_id`, `refunds.key` thay unique index Mongo |
| ledger_entries | ledger_entries | chỉ thêm; `ref_type/ref_id` |
| audit_logs | audit_logs | khóa `id` identity tăng dần dùng làm con trỏ phân trang |
| system_configs | system_configs | `UNIQUE (key, version)` |
| idempotency_keys (TTL) | idempotency_keys | không có TTL tự động: dọn khi gặp lại key hết hạn |
| Change Stream `bookings` | `services/events.ts` | phát sự kiện sau commit, trong một tiến trình |

Quy ước: khóa chính `uuid` (`gen_random_uuid()`); bảng cần phân trang có `seq` identity làm con trỏ keyset; tiền `bigint` VND; thời gian `timestamptz`.
Sửa schema: thêm file `NNN_ten.sql` mới, không sửa file đã áp; cập nhật bảng này và `backend/database/types.ts`.
