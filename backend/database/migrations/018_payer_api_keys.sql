-- Cổng kết nối đơn vị chi trả (GĐ1 bước 2): khóa API (chỉ lưu HASH) + nhật ký mỗi lần đẩy dữ liệu. Chạy lại an toàn.

-- Một đơn vị có nhiều khóa; thu hồi = đặt revoked_at. key_hash = sha256 hex của khóa thô (khóa 256-bit ngẫu nhiên nên không cần KDF chậm).
-- key_prefix: vài ký tự đầu của khóa để nhận diện trên giao diện; không đủ để dò khóa.
CREATE TABLE IF NOT EXISTS payer_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id     uuid NOT NULL REFERENCES payers(id),
  name         text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  created_by   uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS payer_api_keys_payer ON payer_api_keys (payer_id);

-- Nhật ký mỗi lần đẩy (cả bị từ chối). source: API = khóa API; SIMULATION = nút tạo chuyến mô phỏng (đi qua cùng hàm ingest).
-- summary = tóm tắt payload (số hành khách, mã chuyến...), KHÔNG lưu họ tên/email/SĐT hành khách.
CREATE TABLE IF NOT EXISTS payer_ingest_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  payer_id      uuid NOT NULL REFERENCES payers(id),
  api_key_id    uuid REFERENCES payer_api_keys(id),
  account_id    uuid REFERENCES accounts(id) ON DELETE SET NULL,
  source        text NOT NULL CHECK (source IN ('API','SIMULATION')),
  result        text NOT NULL CHECK (result IN ('OK','REJECTED')),
  flight_id     uuid REFERENCES flights(id) ON DELETE SET NULL,
  summary       jsonb NOT NULL DEFAULT '{}',
  error_code    text,
  error_message text CHECK (length(error_message) <= 500),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payer_ingest_logs_payer_seq ON payer_ingest_logs (payer_id, seq DESC);
