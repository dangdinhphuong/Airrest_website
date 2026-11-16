-- Cấu hình tầng / phòng / ảnh (khách sạn). Tồn kho vẫn đếm theo loại: room_types.total_rooms.
-- Loại phòng đã có ít nhất 1 dòng trong rooms thì total_rooms = số phòng ACTIVE của loại (đồng bộ ở tầng service).
-- Không tạo rooms tự động, không đổi total_rooms hiện có.
ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS view        text,
  ADD COLUMN IF NOT EXISTS amenities   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS smoking     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_adults  integer CHECK (max_adults BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS max_children integer CHECK (max_children BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS images      jsonb NOT NULL DEFAULT '[]';   -- khóa R2 có thứ tự, ảnh đầu = ảnh bìa (tối đa 10)

CREATE TABLE floors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id),
  name       text NOT NULL,
  level      integer NOT NULL CHECK (level BETWEEN -5 AND 200),
  sort_order integer NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, level)
);

CREATE TABLE rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id),
  floor_id     uuid NOT NULL REFERENCES floors(id),
  room_type_id uuid NOT NULL REFERENCES room_types(id),
  number       text NOT NULL,
  status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  note         text,
  view         text,                       -- các trường ghi đè: null = theo loại phòng
  smoking      boolean,
  max_adults   integer CHECK (max_adults BETWEEN 1 AND 10),
  max_children integer CHECK (max_children BETWEEN 0 AND 10),
  amenities_extra text[] NOT NULL DEFAULT '{}',
  images       jsonb NOT NULL DEFAULT '[]', -- tối đa 5, ảnh đầu = ảnh bìa
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, number)
);
CREATE INDEX rooms_type ON rooms (room_type_id, status);
CREATE INDEX rooms_floor ON rooms (floor_id);
