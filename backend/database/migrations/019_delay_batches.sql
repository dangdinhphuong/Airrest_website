-- Luồng delay GĐ2-B: dịch vụ lô đặt phòng. Chỉ thêm cột, chạy lại an toàn.

-- Mã nhóm hiển thị (tra cứu cả nhóm); hàng cũ để null.
ALTER TABLE delay_groups ADD COLUMN IF NOT EXISTS code text UNIQUE;

-- Khách nào nằm trong lượt gửi KS nào (chuyển KS/hủy liên đới cần biết); một offer = một đơn vị đặt (1 phòng hoặc cụm phòng thông nhau, qty = số phòng).
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS pax_ids uuid[] NOT NULL DEFAULT '{}';

-- Idempotent theo (đơn vị, Idempotency-Key) ở mức dịch vụ.
ALTER TABLE delay_batches ADD COLUMN IF NOT EXISTS idempotency_key text;
-- result = kết quả đặt: {unplaced:[{paxId,pnr,reason}]} (khách chưa xếp được, nhân viên xử lý tay).
ALTER TABLE delay_batches ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS delay_batches_idem ON delay_batches (payer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Liên hệ do nhân viên quầy sửa: chỉ áp dụng cho đơn, KHÔNG ghi đè email/phone gốc của hãng (cổng kết nối vẫn cập nhật cột gốc).
ALTER TABLE delay_flight_pax ADD COLUMN IF NOT EXISTS contact_email text CHECK (length(contact_email) <= 200);
ALTER TABLE delay_flight_pax ADD COLUMN IF NOT EXISTS contact_phone text;
