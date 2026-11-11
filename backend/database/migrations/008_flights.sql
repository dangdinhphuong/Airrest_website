-- Chuyến bay MÔ PHỎNG (không gọi hệ thống hãng/sân bay) + lịch sử đổi giờ. flight_date tính theo giờ khởi hành dự kiến, múi giờ Việt Nam.
CREATE TABLE flights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code         text NOT NULL CHECK (code ~ '^[A-Z]{2}[0-9]{1,4}$'),
  airline      text NOT NULL,
  origin       char(3) NOT NULL,
  dest         char(3),
  sched_dep    timestamptz NOT NULL,
  flight_date  date GENERATED ALWAYS AS ((sched_dep AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) STORED,
  new_dep      timestamptz,                              -- giờ bay mới; null = chưa biết (DELAYED) hoặc không áp dụng
  status       text NOT NULL CHECK (status IN ('ONTIME','DELAYED','CANCELLED')),
  cause        text NOT NULL DEFAULT 'UNKNOWN' CHECK (cause IN ('AIRLINE','FORCE','UNKNOWN')),
  cancelled_at timestamptz,
  distance_km  integer,
  sim_scenario text NOT NULL DEFAULT 'approve' CHECK (sim_scenario IN ('approve','reject','hotelfull','noreply')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, flight_date),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CHECK (status <> 'CANCELLED' OR new_dep IS NULL),
  CHECK (status <> 'ONTIME' OR new_dep IS NULL)
);
CREATE INDEX flights_date_code ON flights (flight_date, code);

CREATE TABLE flight_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  flight_id     uuid NOT NULL REFERENCES flights(id),
  from_dep      timestamptz,                             -- giờ bay hiệu lực trước/sau; null khi hủy hoặc chưa biết
  to_dep        timestamptz,
  status_before text NOT NULL,
  status_after  text NOT NULL,
  cause_before  text NOT NULL,
  cause_after   text NOT NULL,
  reason        text NOT NULL,
  changed_by    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flight_changes_flight ON flight_changes (flight_id, seq DESC);
