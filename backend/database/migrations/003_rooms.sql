-- Loại phòng: mã, sức chứa, trạng thái ngừng dùng; bảng room_blocks cho khóa/bảo trì phòng.
ALTER TABLE room_types
  ADD COLUMN code        text,
  ADD COLUMN capacity    integer NOT NULL DEFAULT 2 CHECK (capacity BETWEEN 1 AND 10),
  ADD COLUMN beds        integer NOT NULL DEFAULT 1 CHECK (beds BETWEEN 1 AND 10),
  ADD COLUMN area_m2     integer NOT NULL DEFAULT 0 CHECK (area_m2 >= 0),
  ADD COLUMN retired_at  timestamptz,                 -- khác null = ngừng dùng (luôn kèm active=false)
  ADD COLUMN created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now();
UPDATE room_types SET code = upper(left(replace(id::text, '-', ''), 6)) WHERE code IS NULL;
CREATE UNIQUE INDEX room_types_hotel_code ON room_types (hotel_id, code) WHERE code IS NOT NULL;

CREATE TABLE room_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  hotel_id    uuid NOT NULL REFERENCES hotels(id),
  room_type_id uuid NOT NULL REFERENCES room_types(id),
  kind        text NOT NULL CHECK (kind IN ('LOCK','MAINTENANCE')),
  qty         integer NOT NULL CHECK (qty > 0),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text NOT NULL,
  created_by  jsonb NOT NULL,
  released_at timestamptz,
  released_by jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX room_blocks_active ON room_blocks (room_type_id, starts_at, ends_at) WHERE released_at IS NULL;
CREATE INDEX room_blocks_hotel_seq ON room_blocks (hotel_id, seq DESC);
