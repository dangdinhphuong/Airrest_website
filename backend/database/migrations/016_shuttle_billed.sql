-- Xe đặt cùng đơn: giá xe đã nằm trong tổng đơn và đã thu cùng đơn (billed = true).
-- Yêu cầu xe tạo sau khi có đơn (P1) vẫn billed = false: không thu/không hoàn riêng. Idempotent.
ALTER TABLE shuttle_requests ADD COLUMN IF NOT EXISTS billed boolean NOT NULL DEFAULT false;
