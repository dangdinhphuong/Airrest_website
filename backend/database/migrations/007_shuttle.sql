-- Xe đưa đón gắn booking (không có xe độc lập). Giá chốt lúc tạo theo cấu hình pricing.shuttle; khoảng cách lấy từ hotels.airports.
CREATE TABLE shuttle_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  booking_id     uuid NOT NULL REFERENCES bookings(id),
  hotel_id       uuid NOT NULL REFERENCES hotels(id),
  direction      text NOT NULL CHECK (direction IN ('TO_HOTEL','TO_AIRPORT')),
  airport_iata   text NOT NULL,
  distance_km    double precision NOT NULL,
  pickup_at      timestamptz NOT NULL,
  location       text CHECK (length(location) <= 200),
  note           text CHECK (length(note) <= 300),
  price_vnd      bigint NOT NULL CHECK (price_vnd >= 0),
  config_version integer NOT NULL,
  status         text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ASSIGNED','DONE','CANCELLED')),
  driver         jsonb,                                 -- {name, phone} nhập tay
  assigned_at    timestamptz,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  cancel_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shuttle_one_active ON shuttle_requests (booking_id, direction) WHERE status IN ('REQUESTED','ASSIGNED');
CREATE INDEX shuttle_hotel_status ON shuttle_requests (hotel_id, status, seq DESC);
CREATE INDEX shuttle_booking ON shuttle_requests (booking_id, seq DESC);
