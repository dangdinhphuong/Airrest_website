-- Đổi giờ bay sau khi đã đặt phòng (GĐ4): bay muộn hơn -> đề xuất gia hạn, KHÔNG tự gia hạn (tốn tiền). Quầy yêu cầu, khách sạn đồng ý/từ chối.
-- NONE: không có đề xuất; PROPOSED: hệ thống đề xuất (chờ quầy); REQUESTED: quầy đã gửi khách sạn; ACCEPTED/REJECTED: khách sạn trả lời.
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS extension_status text NOT NULL DEFAULT 'NONE' CHECK (extension_status IN ('NONE','PROPOSED','REQUESTED','ACCEPTED','REJECTED'));
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS proposed_leave_at timestamptz;
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS extension_requested_at timestamptz;
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS extension_responded_at timestamptz;
