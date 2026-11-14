-- Luồng "Đặt phòng cho khách delay chuyến" (GĐ1 nền dữ liệu). Xem docs/superpowers/specs/2026-11-14-airport-delay-booking-design.md.
-- Chỉ thêm, không đổi hành vi cũ. Chưa có payer_statements (GĐ5). Mọi chuyến/đơn mô phỏng có cờ `simulated` để loại khỏi kết toán.

-- Đơn vị chi trả (hãng bay / công ty phục vụ mặt đất / sân bay) và các trạm (mỗi trạm = 1 sân bay).
CREATE TABLE IF NOT EXISTS payers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,20}$'),
  name               text NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  kind               text NOT NULL CHECK (kind IN ('AIRLINE','GROUND_HANDLER','AIRPORT')),
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  contact            jsonb,                                -- {name?, phone?, email?}
  shared_room_policy text NOT NULL DEFAULT 'PRIVATE' CHECK (shared_room_policy IN ('PRIVATE','SHARED')), -- ghép phòng đơn; mặc định phòng riêng
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payer_stations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id      uuid NOT NULL REFERENCES payers(id),
  airport_iata  char(3) NOT NULL CHECK (airport_iata ~ '^[A-Z]{3}$'),
  name          text NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payer_id, airport_iata)
);

-- Giá hợp đồng theo loại phòng: giá đêm + bảng giá theo khung giờ (hourly_rates = [{hours, priceVnd}]), hoa hồng Airrest % trên giá hợp đồng.
-- Chỉ khách sạn có dòng hiệu lực ở đây mới được xếp cho đơn vị chi trả.
CREATE TABLE IF NOT EXISTS payer_hotel_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id        uuid NOT NULL REFERENCES payers(id),
  hotel_id        uuid NOT NULL REFERENCES hotels(id),
  room_type_id    uuid NOT NULL REFERENCES room_types(id),
  night_rate_vnd  bigint NOT NULL CHECK (night_rate_vnd >= 0),
  hourly_rates    jsonb NOT NULL DEFAULT '[]',
  commission_pct  numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
  valid_from      date NOT NULL,
  valid_to        date,                                    -- null = không giới hạn
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (payer_id, room_type_id, valid_from)
);
CREATE INDEX IF NOT EXISTS payer_hotel_rates_payer_hotel ON payer_hotel_rates (payer_id, hotel_id, active);

-- Lô đặt cho một chuyến, nhóm theo PNR (no_split = cụm không tách: đại diện + người phụ thuộc cùng khách sạn, hủy/chuyển liên đới).
CREATE TABLE IF NOT EXISTS delay_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  payer_id    uuid NOT NULL REFERENCES payers(id),
  station_id  uuid NOT NULL REFERENCES payer_stations(id),
  flight_id   uuid NOT NULL REFERENCES flights(id),
  status      text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLACING','COMPLETED','CANCELLED')),
  simulated   boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delay_batches_payer_seq ON delay_batches (payer_id, seq DESC);
CREATE INDEX IF NOT EXISTS delay_batches_flight ON delay_batches (flight_id);

CREATE TABLE IF NOT EXISTS delay_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid NOT NULL REFERENCES delay_batches(id),
  pnr         text NOT NULL,
  no_split    boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','OFFERED','CONFIRMED','FAILED','CANCELLED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delay_groups_batch ON delay_groups (batch_id);

-- Hành khách của chuyến (payer đẩy sang qua cổng hoặc nhân viên quầy nhập). category suy từ age: INFANT <2, CHILD 2-11, ADULT >=12.
CREATE TABLE IF NOT EXISTS delay_flight_pax (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq               bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  payer_id          uuid NOT NULL REFERENCES payers(id),
  station_id        uuid NOT NULL REFERENCES payer_stations(id),
  flight_id         uuid NOT NULL REFERENCES flights(id),
  group_id          uuid REFERENCES delay_groups(id) ON DELETE SET NULL,
  pnr               text NOT NULL CHECK (length(pnr) BETWEEN 5 AND 8),
  full_name         text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  age               integer NOT NULL CHECK (age BETWEEN 0 AND 120),
  category          text NOT NULL CHECK (category IN ('INFANT','CHILD','ADULT')),
  is_representative boolean NOT NULL DEFAULT false,
  email             text CHECK (length(email) <= 200),
  phone             text,
  special_needs     text[] NOT NULL DEFAULT '{}',
  simulated         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((category = 'INFANT' AND age < 2) OR (category = 'CHILD' AND age BETWEEN 2 AND 11) OR (category = 'ADULT' AND age >= 12))
);
-- Idempotent đẩy dữ liệu theo (chuyến, PNR, họ tên).
CREATE UNIQUE INDEX IF NOT EXISTS delay_flight_pax_identity ON delay_flight_pax (flight_id, pnr, lower(full_name));
CREATE INDEX IF NOT EXISTS delay_flight_pax_flight ON delay_flight_pax (payer_id, flight_id);
CREATE INDEX IF NOT EXISTS delay_flight_pax_group ON delay_flight_pax (group_id) WHERE group_id IS NOT NULL;

-- Mở rộng đơn: PAYER = đơn vị chi trả trả tiền (khách không thanh toán); batch/group gắn đơn với lô delay; simulated loại khỏi kết toán.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('VNPAY','MOMO','AT_HOTEL','PAYER'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES delay_batches(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES delay_groups(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS bookings_batch ON bookings (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_group ON bookings (group_id) WHERE group_id IS NOT NULL;

-- Mỗi lượt gửi khách sạn xác nhận (hạn 5'): rejected_hotel_ids = KS đã từ chối/quá hạn của cùng nhóm, không gửi lại; transfer_count = số lần chuyển KS.
CREATE TABLE IF NOT EXISTS delay_room_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  batch_id           uuid NOT NULL REFERENCES delay_batches(id),
  group_id           uuid NOT NULL REFERENCES delay_groups(id),
  booking_id         uuid REFERENCES bookings(id),
  hotel_id           uuid NOT NULL REFERENCES hotels(id),
  room_type_id       uuid NOT NULL REFERENCES room_types(id),
  qty                integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  status             text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED','EXPIRED','CANCELLED')),
  expires_at         timestamptz NOT NULL,
  reject_reason      text CHECK (length(reject_reason) <= 300),
  room_numbers       text[] NOT NULL DEFAULT '{}',          -- KS nhập khi xác nhận
  transfer_count     integer NOT NULL DEFAULT 0 CHECK (transfer_count >= 0),
  rejected_hotel_ids uuid[] NOT NULL DEFAULT '{}',
  responded_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delay_room_offers_pending ON delay_room_offers (expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS delay_room_offers_hotel ON delay_room_offers (hotel_id, status, seq DESC);
CREATE INDEX IF NOT EXISTS delay_room_offers_group ON delay_room_offers (group_id);
CREATE INDEX IF NOT EXISTS delay_room_offers_batch ON delay_room_offers (batch_id);

-- Chuyến bay: cờ mô phỏng (mọi chuyến hiện có đều là mô phỏng -> mặc định true; chuyến thật do cổng kết nối đặt false).
ALTER TABLE flights ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT true;

-- Loại phòng: sức chứa (capacity) và số giường (beds) đã có từ 003; thêm loại giường + cờ thông nhau/gia đình.
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS bed_type text NOT NULL DEFAULT 'DOUBLE' CHECK (bed_type IN ('SINGLE','DOUBLE','TWIN','FAMILY'));
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS connecting boolean NOT NULL DEFAULT false;
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS family boolean NOT NULL DEFAULT false;

-- Xe: số ghế trẻ em (ghế cạnh tài xế không tính cho trẻ dưới 10 tuổi/1,35 m).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS child_seats integer NOT NULL DEFAULT 0 CHECK (child_seats >= 0);

-- Tài khoản nhân viên đơn vị chi trả: type = 'PAYER', định danh bằng email như nhân sự khác (accounts_identity_check giữ nguyên).
-- payer_id bắt buộc với PAYER và chỉ với PAYER; payer_station_id = trạm của nhân viên (null = cấp đơn vị, xem mọi trạm).
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('HOTEL','DRIVER','ADMIN','PASSENGER','PAYER'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES payers(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payer_station_id uuid REFERENCES payer_stations(id);
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_payer_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_payer_check CHECK ((type = 'PAYER') = (payer_id IS NOT NULL) AND (payer_station_id IS NULL OR payer_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS accounts_payer ON accounts (payer_id, payer_station_id) WHERE payer_id IS NOT NULL;
