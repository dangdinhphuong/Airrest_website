-- Tài khoản khách: email liên hệ (bắt buộc khi đăng ký mới, NULL với tài khoản cũ), yêu thích, mã giảm giá, mốc đã xem thông báo.
-- Email khách nằm ở contact_email, KHÔNG dùng cột email (cột email là định danh đăng nhập của nhân sự; accounts_identity_check giữ nguyên).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notif_seen_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_contact_email_lower ON accounts (lower(contact_email)) WHERE contact_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS passenger_favorites (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, hotel_id)
);

-- Mã giảm giá do vận hành tạo; khách xem danh sách còn hiệu lực. Chưa áp dụng ở bước đặt phòng (xem docs/airrest-booking-flow-v2.md).
CREATE TABLE IF NOT EXISTS vouchers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  title         text NOT NULL,
  description   text,
  discount_type text NOT NULL CHECK (discount_type IN ('AMOUNT','PERCENT')),
  value         integer NOT NULL CHECK (value > 0),
  min_total_vnd bigint NOT NULL DEFAULT 0 CHECK (min_total_vnd >= 0),
  starts_at     timestamptz,
  expires_at    timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'PERCENT' OR value <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_code_upper ON vouchers (upper(code));
