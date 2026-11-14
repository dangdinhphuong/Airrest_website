-- Tệp đính kèm của ticket hỗ trợ (ảnh/video khách gửi làm bằng chứng). File nằm ở R2 (bucket riêng tư), bảng chỉ giữ khóa + metadata.
-- PENDING: đã cấp URL tải lên, chưa xác minh; READY: server đã HEAD object và khớp loại/kích thước. PENDING quá 24 giờ bị job dọn.
CREATE TABLE support_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ticket_id    uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  storage_key  text NOT NULL UNIQUE,                  -- do server đặt (support/<năm>/<uuid>.<đuôi>), không dùng tên file của khách
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','video/mp4')),
  size_bytes   bigint NOT NULL CHECK (size_bytes > 0), -- số khách khai; ghi đè bằng số thực sau khi xác minh
  status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_attachments_ticket ON support_attachments (ticket_id, seq);
CREATE INDEX support_attachments_pending ON support_attachments (created_at) WHERE status = 'PENDING';
