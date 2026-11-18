-- Chủ doanh nghiệp tạm dừng nhận đặt mới: từng khách sạn (hotels.paused_at) hoặc cả chuỗi (businesses.paused_at).
-- Khác SUSPENDED của quản trị: chủ tự mở lại được. Đơn đã đặt và khách đang lưu trú vẫn chạy bình thường.
ALTER TABLE hotels     ADD COLUMN IF NOT EXISTS paused_at timestamptz, ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS paused_at timestamptz, ADD COLUMN IF NOT EXISTS pause_reason text;
