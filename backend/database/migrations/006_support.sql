-- Hỗ trợ khách: ticket + tin nhắn. Khách dùng mã ticket + SĐT để xem lại (không cần tài khoản).
CREATE TABLE support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  code         text NOT NULL UNIQUE,
  booking_id   uuid REFERENCES bookings(id),
  hotel_id     uuid REFERENCES hotels(id),             -- sao từ booking để lọc/dashboard
  contact      jsonb NOT NULL,                         -- {fullName?, phone (E.164), email?}
  subject      text NOT NULL,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
  assignee_id  uuid REFERENCES accounts(id),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_status_seq ON support_tickets (status, seq DESC);
CREATE INDEX support_tickets_phone ON support_tickets ((contact->>'phone'), code);
CREATE INDEX support_tickets_booking ON support_tickets (booking_id);

CREATE TABLE support_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq        bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ticket_id  uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author     jsonb NOT NULL,                           -- Actor (+ name?)
  body       text NOT NULL,
  internal   boolean NOT NULL DEFAULT false,           -- ghi chú nội bộ, không bao giờ trả cho khách
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket ON support_messages (ticket_id, seq);
