-- Thông báo trong ứng dụng cho nhân sự khách sạn + cấu hình "vai trò nào nhận loại nào".
-- role_ids = ảnh chụp các vai trò được nhận tại thời điểm phát sinh (theo cấu hình lúc đó); nhân sự xem nếu có ít nhất một vai trò trùng.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id),
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  ref_code   text,
  dedupe_key text NOT NULL,
  role_ids   uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, dedupe_key)
);
CREATE INDEX notifications_hotel_created ON notifications (hotel_id, created_at DESC);

CREATE TABLE notification_reads (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES accounts(id),
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, account_id)
);

-- Ghi đè mặc định (mặc định: vai trò có quyền tương ứng của loại thì nhận). enabled=false tắt, true bật thêm.
CREATE TABLE notification_settings (
  hotel_id   uuid NOT NULL REFERENCES hotels(id),
  role_id    uuid NOT NULL REFERENCES roles(id),
  type       text NOT NULL,
  enabled    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, role_id, type)
);
