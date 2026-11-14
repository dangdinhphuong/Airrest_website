-- Hộp thư đi (outbox) cho email giao dịch: ghi cùng lúc với sự kiện nghiệp vụ, worker gửi sau, lỗi thì thử lại (không mất thư).
-- dedupe_key unique (nullable): cùng sự kiện enqueue nhiều lần chỉ ra một thư.
CREATE TABLE IF NOT EXISTS email_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  to_email        text NOT NULL CHECK (length(to_email) <= 254),
  to_name         text CHECK (length(to_name) <= 200),
  template        text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  subject         text NOT NULL,
  body_text       text NOT NULL,
  body_html       text,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','DEAD')),
  attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),   -- PENDING/FAILED: hạn thử lại; SENDING: hạn "thuê" (quá hạn = worker chết, được nhặt lại)
  last_error      text,
  dedupe_key      text UNIQUE,
  booking_id      uuid REFERENCES bookings(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox (next_attempt_at) WHERE status IN ('PENDING','FAILED','SENDING');
CREATE INDEX IF NOT EXISTS email_outbox_booking ON email_outbox (booking_id) WHERE booking_id IS NOT NULL;
