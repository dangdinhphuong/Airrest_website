-- Chuyến xe (một chuyến = một xe, hoặc một chuyến xe ngoài) + nhật ký đơn + vai trò hệ thống cho tài xế.
CREATE TABLE IF NOT EXISTS shuttle_trips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id         uuid NOT NULL REFERENCES shuttle_requests(id),
  booking_id         uuid NOT NULL REFERENCES bookings(id),
  hotel_id           uuid NOT NULL REFERENCES hotels(id),
  kind               text NOT NULL CHECK (kind IN ('OWN','EXTERNAL')),
  vehicle_id         uuid REFERENCES vehicles(id),
  driver_account_id  uuid,                                  -- chụp lúc đề nghị/đổi xe; tài xế chỉ thấy chuyến có account_id của mình
  seats              integer NOT NULL CHECK (seats BETWEEN 1 AND 30),
  status             text NOT NULL CHECK (status IN ('OFFERED','ACCEPTED','EN_ROUTE','ARRIVED','ONBOARD','DROPPED_OFF','CANCELLED','REJECTED','NEEDS_EXTERNAL')),
  offered_at         timestamptz,
  accepted_at        timestamptz,
  en_route_at        timestamptz,
  arrived_at         timestamptz,
  onboard_at         timestamptz,
  dropped_off_at     timestamptz,
  cancelled_at       timestamptz,
  rejected_at        timestamptz,
  reject_reason      text CHECK (length(reject_reason) <= 300),
  cancel_note        text,
  route              jsonb,                                  -- P2 (OSRM) điền
  eta                timestamptz,                            -- P2
  provider           text CHECK (provider IN ('GRAB','XANHSM','OTHER')),
  share_url          text CHECK (length(share_url) <= 500),
  ext_driver_name    text CHECK (length(ext_driver_name) <= 100),
  ext_plate          text CHECK (length(ext_plate) <= 20),
  ext_phone          text,
  external_reason    text,
  ext_eta_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'OWN' AND vehicle_id IS NOT NULL) OR (kind = 'EXTERNAL' AND vehicle_id IS NULL)),
  CHECK (status <> 'NEEDS_EXTERNAL' OR kind = 'EXTERNAL')
);
CREATE INDEX IF NOT EXISTS shuttle_trips_hotel_status ON shuttle_trips (hotel_id, status);
CREATE INDEX IF NOT EXISTS shuttle_trips_booking ON shuttle_trips (booking_id);
CREATE INDEX IF NOT EXISTS shuttle_trips_vehicle_status ON shuttle_trips (vehicle_id, status);
CREATE INDEX IF NOT EXISTS shuttle_trips_request ON shuttle_trips (request_id);
CREATE INDEX IF NOT EXISTS shuttle_trips_driver_status ON shuttle_trips (driver_account_id, status);

CREATE TABLE IF NOT EXISTS booking_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  hotel_id    uuid NOT NULL REFERENCES hotels(id),
  at          timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL CHECK (actor_type IN ('GUEST','HOTEL','DRIVER','SYSTEM','ADMIN')),
  actor_id    text,
  type        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS booking_events_booking_seq ON booking_events (booking_id, seq);

-- Vai trò hệ thống dành cho khách sạn (đồng bộ với config/roles.ts; ensureSystemRoles cũng upsert). Chạy lại an toàn.
INSERT INTO roles (key, name, scope, permissions, system) VALUES ('hotel_driver', 'Tài xế khách sạn', 'SYSTEM', ARRAY['trip:drive'], true)
ON CONFLICT (key) WHERE hotel_id IS NULL DO NOTHING;
UPDATE roles SET permissions = array_append(permissions, 'fleet:manage')
WHERE key = 'hotel_owner' AND hotel_id IS NULL AND NOT ('fleet:manage' = ANY(permissions));
