-- Đội xe của khách sạn: hồ sơ tài xế (tách khỏi accounts để không phá bảng cũ) + xe.
-- Tài xế đăng nhập bằng tài khoản accounts.type = 'DRIVER' (đã có trong CHECK từ 001), hồ sơ ở hotel_drivers.
-- Số khách đi xe: shuttle_requests.passengers (đơn cũ = 1).
CREATE TABLE IF NOT EXISTS hotel_drivers (
  account_id  uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  hotel_id    uuid NOT NULL REFERENCES hotels(id),
  full_name   text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  phone       text NOT NULL,                              -- E.164 VN (+84...)
  photo_key   text,                                       -- khóa ảnh R2 (drivers/<năm>/<uuid>.<jpg|png|webp>), không lưu ảnh trong DB
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hotel_drivers_hotel ON hotel_drivers (hotel_id, active);

CREATE TABLE IF NOT EXISTS vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  hotel_id           uuid NOT NULL REFERENCES hotels(id),
  plate              text NOT NULL CHECK (length(plate) BETWEEN 4 AND 15),
  seats              integer NOT NULL CHECK (seats BETWEEN 1 AND 50),
  model              text CHECK (length(model) <= 100),
  active             boolean NOT NULL DEFAULT true,
  driver_account_id  uuid REFERENCES hotel_drivers(account_id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_hotel_plate ON vehicles (hotel_id, plate);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_driver ON vehicles (driver_account_id) WHERE driver_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vehicles_hotel_active ON vehicles (hotel_id, active);

ALTER TABLE shuttle_requests ADD COLUMN IF NOT EXISTS passengers integer NOT NULL DEFAULT 1 CHECK (passengers BETWEEN 1 AND 30);
