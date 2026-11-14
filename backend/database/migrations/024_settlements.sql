-- Kết toán THÁNG hai chiều (GĐ5): (A) Airrest <-> đơn vị chi trả (bảng kê), (B) Airrest <-> từng khách sạn (bảng chi trả).
-- Tiền = bigint VND có dấu. Tổng = tổng các dòng (service tính bằng SUM trên dòng, không tính lại từ tổng). Chạy lại an toàn.
-- period = 'YYYY-MM' theo giờ Việt Nam. Dữ liệu simulated không bao giờ vào đây (lọc ở service).

CREATE TABLE IF NOT EXISTS payer_statements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  payer_id         uuid NOT NULL REFERENCES payers(id),
  period           text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status           text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','DISPUTED','LOCKED')),
  room_vnd         bigint NOT NULL DEFAULT 0,
  shuttle_vnd      bigint NOT NULL DEFAULT 0,
  upgrade_delta_vnd bigint NOT NULL DEFAULT 0,
  adjustment_vnd   bigint NOT NULL DEFAULT 0,
  total_vnd        bigint NOT NULL DEFAULT 0,
  commission_vnd   bigint NOT NULL DEFAULT 0,          -- tổng hoa hồng Airrest trên các dòng phòng (thông tin)
  line_count       integer NOT NULL DEFAULT 0,
  sent_at          timestamptz,
  dispute_deadline timestamptz,                        -- sent_at + 5 ngày
  dispute_reason   text CHECK (length(dispute_reason) <= 1000),
  disputed_at      timestamptz,
  locked_at        timestamptz,
  locked_by        uuid REFERENCES accounts(id) ON DELETE SET NULL,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payer_id, period)
);

CREATE TABLE IF NOT EXISTS payer_statement_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  statement_id   uuid NOT NULL REFERENCES payer_statements(id) ON DELETE CASCADE,
  booking_id     uuid REFERENCES bookings(id),
  group_code     text,
  flight_code    text,
  hotel_id       uuid REFERENCES hotels(id),
  kind           text NOT NULL CHECK (kind IN ('ROOM','SHUTTLE','ADJUSTMENT','UPGRADE_DELTA')),
  amount_vnd     bigint NOT NULL,
  commission_vnd bigint NOT NULL DEFAULT 0,
  memo           text CHECK (length(memo) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payer_statement_lines_stmt ON payer_statement_lines (statement_id, seq);

CREATE TABLE IF NOT EXISTS hotel_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  hotel_id       uuid NOT NULL REFERENCES hotels(id),
  period         text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','LOCKED','PAID')),
  gross_vnd      bigint NOT NULL DEFAULT 0,             -- tổng giá hợp đồng (+ điều chỉnh)
  commission_vnd bigint NOT NULL DEFAULT 0,             -- hoa hồng Airrest giữ lại
  net_vnd        bigint NOT NULL DEFAULT 0,             -- = gross - commission: số Airrest trả khách sạn
  line_count     integer NOT NULL DEFAULT 0,
  locked_at      timestamptz,
  locked_by      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  paid_at        timestamptz,
  paid_by        uuid REFERENCES accounts(id) ON DELETE SET NULL,
  payment_ref    text CHECK (length(payment_ref) <= 200),
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, period)
);

CREATE TABLE IF NOT EXISTS hotel_payout_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  payout_id      uuid NOT NULL REFERENCES hotel_payouts(id) ON DELETE CASCADE,
  booking_id     uuid REFERENCES bookings(id),
  payer_id       uuid REFERENCES payers(id),
  group_code     text,
  kind           text NOT NULL CHECK (kind IN ('ROOM','ADJUSTMENT')),
  gross_vnd      bigint NOT NULL,                       -- ADJUSTMENT truy thu KS: số âm
  commission_vnd bigint NOT NULL DEFAULT 0,
  net_vnd        bigint NOT NULL,
  memo           text CHECK (length(memo) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (net_vnd = gross_vnd - commission_vnd)
);
CREATE INDEX IF NOT EXISTS hotel_payout_lines_payout ON hotel_payout_lines (payout_id, seq);
