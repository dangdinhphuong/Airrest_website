-- Luồng delay GĐ3: điểm đón ở sân bay của lô (chọn từ danh sách cố định theo sân bay, backend/data/pickupPoints.ts). Chỉ thêm cột, chạy lại an toàn.
ALTER TABLE delay_batches ADD COLUMN IF NOT EXISTS pickup_point text CHECK (length(pickup_point) <= 200);
