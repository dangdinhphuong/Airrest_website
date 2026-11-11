-- Yêu cầu đổi/hủy booking do khách gửi (không cần tài khoản), nhân sự khách sạn/admin duyệt.
CREATE TABLE change_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  booking_id   uuid NOT NULL REFERENCES bookings(id),
  hotel_id     uuid NOT NULL REFERENCES hotels(id),
  type         text NOT NULL CHECK (type IN ('CANCEL','CHANGE')),
  status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reason_code  text NOT NULL,
  reason_note  text,
  new_from     timestamptz,
  new_to       timestamptz,
  quote        jsonb NOT NULL,                      -- báo giá chốt LÚC GỬI (BR-CXL-03), duyệt muộn không tính lại
  requested_by jsonb NOT NULL,
  decided_by   jsonb,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'CHANGE') = (new_from IS NOT NULL AND new_to IS NOT NULL))
);
CREATE UNIQUE INDEX change_requests_one_pending ON change_requests (booking_id) WHERE status = 'PENDING';
CREATE INDEX change_requests_hotel_status ON change_requests (hotel_id, status, seq DESC);
CREATE INDEX change_requests_booking ON change_requests (booking_id, seq DESC);
