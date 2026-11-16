-- Đánh giá khách sạn: mỗi đơn đã trả phòng (CHECKED_OUT) được đánh giá đúng 1 lần (UNIQUE booking_id).
-- Điểm 1-10 để khớp hotels.rating.avg (thang /10); hotels.rating {avg,count} được tính lại mỗi khi có đánh giá mới.
-- Giờ nhận/trả phòng, chính sách trẻ em/thú cưng nằm trong hotels.policy (jsonb): không cần cột mới.
CREATE TABLE IF NOT EXISTS hotel_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  hotel_id      uuid NOT NULL REFERENCES hotels(id),
  booking_id    uuid NOT NULL UNIQUE REFERENCES bookings(id),
  reviewer_name text NOT NULL,
  score         smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
  comment       text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hotel_reviews_hotel_seq ON hotel_reviews (hotel_id, seq DESC);
