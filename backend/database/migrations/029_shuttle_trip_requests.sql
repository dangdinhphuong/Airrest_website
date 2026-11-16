-- Một chuyến xe nhà chở khách của NHIỀU booking cùng nhóm/cụm có trẻ em (delay, spec 6.6): chuyến vẫn gắn cứng yêu cầu/booking "dẫn đầu"
-- (shuttle_trips.request_id/booking_id); các booking còn lại là thành viên ở bảng này. seats của chuyến = tổng ghế cả cụm; mỗi yêu cầu xe vẫn riêng theo booking
-- (price_vnd/passengers/billed không đổi nên tính tiền không trùng). Chạy lại an toàn.
CREATE TABLE IF NOT EXISTS shuttle_trip_requests (
  trip_id     uuid NOT NULL REFERENCES shuttle_trips(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES shuttle_requests(id),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  seats       integer NOT NULL CHECK (seats BETWEEN 0 AND 30),   -- ghế của riêng booking này (em bé không chiếm ghế)
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS shuttle_trip_requests_request ON shuttle_trip_requests (request_id);
CREATE INDEX IF NOT EXISTS shuttle_trip_requests_booking ON shuttle_trip_requests (booking_id);
