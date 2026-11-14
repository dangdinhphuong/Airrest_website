# PLAN: Khách đính kèm ảnh/video khi khiếu nại (giai đoạn 2 của chatbot)

Trạng thái: **ĐÃ DUYỆT và ĐÃ LÀM** (backend + giao diện). Quyết định khi làm:
- Giới hạn như 3.4; chưa quét virus (chấp nhận ở bản đầu); khách xem lại được tệp mình gửi (`attachments[]` ở `support/lookup`).
- Bỏ cột `message_id` trong bảng (chưa có nhu cầu gắn tệp vào từng tin nhắn); tệp gắn với ticket.
- Test tích hợp dùng storage giả (`tests/support.attachments.integration.test.ts`); chưa chạy upload thật lên R2.
- Khi triển khai: bucket R2 cần CORS cho phép `PUT` từ origin của web, header `Content-Type`; bucket giữ riêng tư (không đặt `R2_PUBLIC_BASE_URL` cho tệp hỗ trợ). Áp migration `023` (`npm run db:migrate`).

## 1. Mục tiêu

Khách khiếu nại qua chatbot (hoặc trang Hỗ trợ) gửi được ảnh/video làm bằng chứng; nhân viên xem được trong màn Hỗ trợ của admin. Giai đoạn 1 (đã xong) chỉ nhận văn bản, khách phải dán link ngoài.

## 2. Hiện trạng liên quan

- Ticket: `support_tickets` + `support_messages` (migration `006_support.sql`); khách xác thực bằng **mã ticket `SP-…` + SĐT** (`createTicket`, `lookupTicket`, `guestReply` trong `services/support/support.service.ts`).
- Storage: Cloudflare R2 qua `lib/storage.ts` (`presignImageUpload`, `presignDownload`, `deleteMedia`), trình duyệt PUT thẳng lên R2. Chỉ ảnh jpeg/png/webp ≤ 5 MB; thư mục cố định `hotels|rooms|drivers`; endpoint chỉ cho đối tác có quyền.
- Giới hạn đã biết trong code: kích thước **chỉ kiểm theo số client tự khai** (ghi chú `shortcut` ở `presignImageUpload`). Với endpoint công khai, điều này không đủ.
- Admin: `apps/web/src/components/admin/Support.jsx` hiện chỉ hiển thị tin nhắn văn bản.
- Migration mới nhất: `022_delay_pickup_point.sql` (số kế tiếp: `023`).

## 3. Thiết kế

### 3.1 Luồng

1. Khách gửi ticket như hiện nay (`POST /v1/support`) → nhận `SP-…`.
2. Bot hỏi "Bạn có ảnh/video không?" (nút 📎, nút "Bỏ qua").
3. Với mỗi file: `POST /v1/support/attachments/upload-url` → nhận URL PUT ký sẵn → trình duyệt PUT thẳng lên R2 → `POST /v1/support/attachments/confirm`.
4. Server **xác minh thật** ở bước confirm (HEAD object trên R2: kích thước thực, content-type); sai quy định thì xóa object và từ chối.
5. Admin mở ticket thấy danh sách file (ảnh hiện thumbnail, video có trình phát) qua URL tải ký sẵn ngắn hạn.

### 3.2 API (công khai, có rate limit, xác thực bằng mã ticket + SĐT)

| Endpoint | Việc |
|---|---|
| `POST /v1/support/attachments/upload-url` | body `{ code, phone, contentType, size, name? }` → kiểm ticket + SĐT, còn hạn mức file → tạo dòng `PENDING` → trả `{ attachmentId, uploadUrl, headers, expiresIn }` |
| `POST /v1/support/attachments/confirm` | body `{ code, phone, attachmentId }` → HEAD object, kiểm kích thước/loại thực → `READY` (hoặc xóa + lỗi) |
| `GET` kèm ticket ở `support/lookup` | trả thêm `attachments[]` của khách (loại, kích thước, URL tải ký 10 phút) |
| Admin: `GET /v1/admin/support/:id` | trả thêm `attachments[]` với URL tải ký ngắn hạn (quyền như xem ticket hiện có) |

Dùng `Idempotency-Key` cho `upload-url`; lỗi theo chuẩn `AppError` hiện có.

### 3.3 DB (migration `023_support_attachments.sql`)

```
support_attachments (
  id            uuid PK,
  ticket_id     uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id    uuid NULL REFERENCES support_messages(id) ON DELETE SET NULL,
  storage_key   text NOT NULL UNIQUE,      -- do server đặt, không dùng tên file của khách
  content_type  text NOT NULL,
  size_bytes    bigint NOT NULL,           -- khai báo; ghi đè bằng số thực sau confirm
  status        text NOT NULL DEFAULT 'PENDING',  -- PENDING | READY
  created_at    timestamptz NOT NULL DEFAULT now()
)
INDEX (ticket_id), INDEX (status, created_at)  -- phục vụ dọn dẹp
```

Theo quy định repo: cập nhật `docs/postgres/` cùng lúc; migration có thể đảo ngược (xóa bảng).

### 3.4 Giới hạn (đề xuất, chỉnh được bằng cấu hình)

| | Giá trị |
|---|---|
| Ảnh | jpeg/png/webp, ≤ 5 MB, tối đa 5 ảnh |
| Video | mp4, ≤ 30 MB, tối đa 1 video |
| Mỗi ticket | tối đa 6 file |
| Hạn mức theo IP | rate limit riêng cho `upload-url` (vd 20 lần/giờ/IP) |
| URL PUT | hết hạn 5 phút, buộc đúng `Content-Type` |

### 3.5 Bảo mật / lạm dụng

- Chỉ ticket + SĐT hợp lệ mới xin được URL upload (không có endpoint "tải lên tùy ý").
- Khóa object do server sinh (thư mục `support/<năm>/<uuid>.<đuôi>`), không dùng tên khách gửi.
- Kích thước kiểm **thật** bằng HEAD ở bước confirm (xử lý giới hạn "chỉ kiểm số client khai" đã nêu ở mục 2).
- File `PENDING` quá 24 giờ bị job dọn: xóa object R2 + dòng DB (tái dùng cơ chế job nền đang có nếu phù hợp, nếu không thì script chạy định kỳ).
- Tải về chỉ qua URL ký ngắn hạn; bucket hỗ trợ **riêng tư** (không dùng `R2_PUBLIC_BASE_URL`) vì có thể chứa thông tin cá nhân.
- Bot và trang Hỗ trợ đều nhắc "không gửi giấy tờ tùy thân" (BR-002).
- Ghi audit `SUPPORT.ATTACHMENT_ADD` (không ghi nội dung file).
- **Rủi ro còn lại:** không quét virus/nội dung file (R2 không có sẵn). Giảm nhẹ: chỉ nhân viên xem, hiển thị bằng `<img>`/`<video>`, không mở file như trang web; cần bạn xác nhận chấp nhận mức này cho bản đầu.

### 3.6 Giao diện

- **Chatbot:** sau khi tạo ticket thành công, hiện bước "Gửi ảnh/video" (chọn nhiều file, hiện tiến độ từng file, nút "Xong"). Lỗi từng file hiện riêng, không chặn ticket đã gửi.
- **Trang Hỗ trợ (khách):** cùng ô đính kèm ở form gửi và form trả lời ticket.
- **Admin (`Support.jsx`):** khối "Tệp đính kèm" trong chi tiết ticket.

### 3.7 Tác động

- Thêm 1 bảng, 2 endpoint khách, 1 trường trả thêm ở lookup và admin, 1 job dọn.
- Thêm HeadObject vào `lib/storage.ts` (hàm mới `headMedia`); mở rộng loại file cho video (không đổi hành vi upload của đối tác).
- Không đổi luồng đặt phòng/thanh toán; không đụng `support_messages` hiện có.

## 4. Kiểm thử

- Unit: kiểm tra giới hạn số file/loại/kích thước, xác thực ticket + SĐT.
- Integration (`RUN_DB_TESTS=1`): `upload-url` → `confirm` với R2 giả lập; file sai kích thước bị xóa; ticket/SĐT sai bị 404; vượt hạn mức bị 409.
- Chạy đầu-cuối cần R2 hoặc một S3 tương thích chạy cục bộ (hiện `.env` local chưa chắc có `R2_*`): cần quyết định công cụ thử.
- Test bot: luồng khiếu nại có/không đính kèm, file lỗi.

## 5. Kế hoạch triển khai (chia nhỏ, mỗi bước chạy được độc lập)

1. Migration + docs DB + `headMedia` + endpoint `upload-url`/`confirm` + test.
2. `lookup` và admin trả `attachments[]`; Admin `Support.jsx` hiển thị.
3. UI đính kèm ở chatbot và trang Hỗ trợ.
4. Job dọn `PENDING` + rate limit + audit.

## 6. Cần bạn duyệt

1. Giới hạn ở 3.4 (đặc biệt video 30 MB, tối đa 1 video) có đúng nhu cầu không?
2. Chấp nhận **không quét virus** ở bản đầu (3.5) không?
3. Môi trường thử upload: dùng R2 thật của dev hay dựng S3 cục bộ (MinIO)?
4. Khách có cần xem lại file mình đã gửi (trả `attachments[]` ở `support/lookup`) hay chỉ admin xem?
