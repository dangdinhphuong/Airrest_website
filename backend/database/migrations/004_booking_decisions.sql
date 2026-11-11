-- Quyết định của khách sạn với đơn chờ xác nhận (xác nhận / từ chối / hết hạn) + quyền booking:decide cho vai trò lễ tân đã có.
CREATE TABLE booking_decisions (
  booking_id   uuid PRIMARY KEY REFERENCES bookings(id),
  decision     text NOT NULL CHECK (decision IN ('CONFIRMED','REJECTED','EXPIRED')),
  reason       text,
  decided_by   jsonb NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  alternatives jsonb NOT NULL DEFAULT '[]',
  CHECK (decision <> 'REJECTED' OR (reason IS NOT NULL AND length(btrim(reason)) >= 3))
);

UPDATE roles SET permissions = permissions || ARRAY['booking:decide']
WHERE hotel_id IS NOT NULL AND 'booking:checkin' = ANY(permissions) AND NOT ('booking:decide' = ANY(permissions));
