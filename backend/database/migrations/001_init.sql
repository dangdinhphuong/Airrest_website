-- Airrest — schema khởi tạo (PostgreSQL / Supabase). Thay thế thiết kế MongoDB (docs/mongodb).
-- Quy ước: khóa chính uuid; tiền VND = bigint (số nguyên); thời gian = timestamptz;
-- giá trị lồng nhau không cần truy vấn riêng (địa chỉ, chính sách, snapshot...) để ở jsonb.
-- Bảng hay phân trang có thêm `seq` (identity) làm con trỏ keyset ổn định (uuid ngẫu nhiên không có thứ tự).

CREATE TABLE hotels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  status           text NOT NULL CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','HIDDEN_DEBT')),
  slug             text,
  owner_account_id uuid,
  description      text,
  address          jsonb,
  location         jsonb NOT NULL,                       -- {type:'Point', coordinates:[lng,lat]}
  airports         jsonb NOT NULL DEFAULT '[]',          -- [{iata,km,minutes}]
  amenities        text[] NOT NULL DEFAULT '{}',
  contact          jsonb,
  policy           jsonb NOT NULL,                       -- {cancellationTemplate, cleaningBufferMin, noShowGraceMin?}
  approval         jsonb NOT NULL DEFAULT '{"manual":false}',
  rating           jsonb NOT NULL DEFAULT '{"avg":0,"count":0}',
  payout_account   jsonb,                                -- {type,labelMasked,detailsEnc,verifiedAt,changedAt,pendingChange?}; detailsEnc đã mã hóa AES-GCM
  incident_score   integer NOT NULL DEFAULT 0,
  approved_at      timestamptz,
  approved_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hotels_airports_gin ON hotels USING gin (airports jsonb_path_ops);
CREATE INDEX hotels_status_incident ON hotels (status, incident_score DESC);
CREATE INDEX hotels_owner ON hotels (owner_account_id);

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  name        text NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('SYSTEM','HOTEL')),
  hotel_id    uuid REFERENCES hotels(id),
  permissions text[] NOT NULL DEFAULT '{}',
  system      boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX roles_system_key ON roles (key) WHERE hotel_id IS NULL;
CREATE UNIQUE INDEX roles_hotel_key ON roles (hotel_id, key) WHERE hotel_id IS NOT NULL;

CREATE TABLE accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  type          text NOT NULL CHECK (type IN ('HOTEL','DRIVER','ADMIN')),
  email         text NOT NULL,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  status        text NOT NULL CHECK (status IN ('INVITED','ACTIVE','LOCKED')),
  hotel_id      uuid REFERENCES hotels(id),
  role_ids      uuid[] NOT NULL DEFAULT '{}',
  is_owner      boolean,
  admin_role    text CHECK (admin_role IN ('OPS','SUPPORT','FINANCE','SYSADMIN')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email ON accounts (email);
CREATE INDEX accounts_hotel_type_status ON accounts (hotel_id, type, status);

CREATE TABLE room_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id),
  name        text NOT NULL,
  total_rooms integer NOT NULL CHECK (total_rooms >= 0),
  pricing     jsonb NOT NULL,                            -- {baseNightVnd}
  active      boolean NOT NULL DEFAULT true
);
CREATE INDEX room_types_hotel_active ON room_types (hotel_id, active);

CREATE TABLE bookings (
  id               uuid PRIMARY KEY,
  seq              bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code             text NOT NULL UNIQUE,
  status           text NOT NULL CHECK (status IN ('PENDING_PAYMENT','PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','REJECTED','EXPIRED','NO_SHOW')),
  hotel_id         uuid NOT NULL REFERENCES hotels(id),
  guest            jsonb NOT NULL,                       -- {fullName, phone(E.164), email?}
  hotel_snapshot   jsonb NOT NULL,
  stay             jsonb NOT NULL,                       -- {type, from, to, nights}
  stay_from        timestamptz NOT NULL,                 -- bản sao của stay.from để index/lọc
  lines            jsonb NOT NULL,
  pricing          jsonb NOT NULL,                       -- {roomVnd, shuttleVnd, serviceFeeVnd, discountVnd, totalVnd, params?}
  payment_method   text NOT NULL CHECK (payment_method IN ('MOMO','AT_HOTEL')),
  payment_status   text NOT NULL DEFAULT 'UNPAID',
  paid_vnd         bigint NOT NULL DEFAULT 0,
  refunded_vnd     bigint NOT NULL DEFAULT 0,
  shuttle          jsonb NOT NULL,
  expires_at       timestamptz,
  checked_in_at    timestamptz,
  status_history   jsonb NOT NULL DEFAULT '[]',
  change_count     integer NOT NULL DEFAULT 0,
  flags            jsonb NOT NULL,
  v                integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_guest_phone ON bookings ((guest->>'phone'), status, created_at DESC);
CREATE INDEX bookings_hotel_status_from ON bookings (hotel_id, status, stay_from);
CREATE INDEX bookings_expiry ON bookings (status, expires_at) WHERE status IN ('PENDING_PAYMENT','PENDING');

CREATE TABLE room_reservations (
  id              uuid PRIMARY KEY,
  hotel_id        uuid NOT NULL REFERENCES hotels(id),
  room_type_id    uuid NOT NULL REFERENCES room_types(id),
  kind            text NOT NULL CHECK (kind IN ('BOOKING','BLOCK')),
  booking_id      uuid REFERENCES bookings(id),
  qty             integer NOT NULL CHECK (qty > 0),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  state           text NOT NULL CHECK (state IN ('HOLD','CONFIRMED','CHECKED_IN','RELEASED','COMPLETED')),
  hold_expires_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_reservations_type_window ON room_reservations (room_type_id, state, starts_at, ends_at);
CREATE INDEX room_reservations_booking ON room_reservations (booking_id);
CREATE INDEX room_reservations_hotel_window ON room_reservations (hotel_id, starts_at, ends_at);
CREATE INDEX room_reservations_hold ON room_reservations (state, hold_expires_at) WHERE state = 'HOLD';

CREATE TABLE payments (
  id              uuid PRIMARY KEY,
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  hotel_id        uuid NOT NULL REFERENCES hotels(id),
  method          text NOT NULL DEFAULT 'MOMO',
  amount_vnd      bigint NOT NULL CHECK (amount_vnd > 0),
  status          text NOT NULL CHECK (status IN ('INITIATED','PENDING','SUCCEEDED','FAILED','EXPIRED')),
  momo_order_id   text NOT NULL UNIQUE,                  -- chống IPN lặp (R3); cũng nằm trong momo->>'orderId'
  momo            jsonb NOT NULL,                        -- {partnerCode, orderId, requestId, transId?, payUrl?, deeplink?, resultCode?, message?}
  callbacks       jsonb NOT NULL DEFAULT '[]',
  anomaly         jsonb,                                 -- {kind: AMOUNT_MISMATCH|LATE_SUCCESS|DUPLICATE, at}
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking ON payments (booking_id, created_at DESC);
CREATE INDEX payments_status_created ON payments (status, created_at);
CREATE INDEX payments_anomaly ON payments (seq) WHERE anomaly IS NOT NULL;

CREATE TABLE refunds (
  id            uuid PRIMARY KEY,
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  booking_id    uuid NOT NULL REFERENCES bookings(id),
  hotel_id      uuid NOT NULL REFERENCES hotels(id),
  payment_id    uuid NOT NULL REFERENCES payments(id),
  key           text NOT NULL UNIQUE,                    -- chống hoàn kép (BR-CXL-12)
  amount_vnd    bigint NOT NULL CHECK (amount_vnd > 0),
  reason_code   text NOT NULL,
  method        text NOT NULL DEFAULT 'MOMO',
  status        text NOT NULL CHECK (status IN ('PENDING','PROCESSING','REFUNDED','MANUAL_REQUIRED')),
  attempts      jsonb NOT NULL DEFAULT '[]',
  momo          jsonb NOT NULL,
  due_at        timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX refunds_booking ON refunds (booking_id);
CREATE INDEX refunds_status_due ON refunds (status, due_at);
CREATE INDEX refunds_payment ON refunds (payment_id);

-- Sổ cái chỉ thêm, không sửa/xóa (R2). amount_vnd có dấu.
CREATE TABLE ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts          timestamptz NOT NULL DEFAULT now(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  hotel_id    uuid NOT NULL REFERENCES hotels(id),
  ref_type    text NOT NULL CHECK (ref_type IN ('PAYMENT','REFUND')),
  ref_id      uuid NOT NULL,
  account     text NOT NULL CHECK (account IN ('CUSTOMER_PAID','HOTEL_PAYABLE','AIRREST_REVENUE','CUSTOMER_REFUNDABLE')),
  amount_vnd  bigint NOT NULL,
  memo        text
);
CREATE INDEX ledger_booking_ts ON ledger_entries (booking_id, ts);
CREATE INDEX ledger_ref ON ledger_entries (ref_type, ref_id);

-- Nhật ký chỉ thêm (FR-ADM-09).
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  request_id   text,
  actor        jsonb NOT NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  hotel_id     uuid,
  booking_id   uuid,
  before       jsonb,
  after        jsonb,
  reason_code  text,
  reason_note  text
);
CREATE INDEX audit_entity ON audit_logs (entity_type, entity_id, id DESC);
CREATE INDEX audit_hotel ON audit_logs (hotel_id, id DESC);
CREATE INDEX audit_actor ON audit_logs ((actor->>'id'), id DESC);
CREATE INDEX audit_booking ON audit_logs (booking_id, id DESC);
CREATE INDEX audit_action ON audit_logs (action, id DESC);
CREATE INDEX audit_ts ON audit_logs (ts DESC);

-- Cấu hình có phiên bản: chỉ thêm, không sửa (ADM-12).
CREATE TABLE system_configs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL,
  version        integer NOT NULL,
  value          jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  changed_by     jsonb NOT NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);
CREATE INDEX system_configs_key_effective ON system_configs (key, effective_from DESC);

CREATE TABLE idempotency_keys (
  scope         text NOT NULL,
  key           text NOT NULL,
  request_hash  text NOT NULL,
  status        text NOT NULL CHECK (status IN ('IN_PROGRESS','DONE')),
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expire_at     timestamptz NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE INDEX idempotency_expire ON idempotency_keys (expire_at);
