-- Nâng hạng phòng tại quầy (spec 2026-11-14 mục 6.8): chỉ trước khi gửi KS; phần chênh khách tự trả đơn vị chi trả, Airrest không thu khách.
-- Đơn vị chi trả chỉ được nâng khi allow_upgrade = true (admin bật).
ALTER TABLE payers ADD COLUMN IF NOT EXISTS allow_upgrade boolean NOT NULL DEFAULT false;
-- Offer đã nâng: room_type_id = hạng ĐÃ nâng; upgrade_from_room_type_id = hạng chuẩn xếp ban đầu; upgrade_delta_vnd = tổng phần chênh giá hợp đồng của đơn vị đặt (cả khung ở).
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS upgrade_from_room_type_id uuid REFERENCES room_types(id);
ALTER TABLE delay_room_offers ADD COLUMN IF NOT EXISTS upgrade_delta_vnd bigint CHECK (upgrade_delta_vnd IS NULL OR upgrade_delta_vnd > 0);
ALTER TABLE delay_room_offers ADD CONSTRAINT delay_room_offers_upgrade_pair CHECK ((upgrade_from_room_type_id IS NULL) = (upgrade_delta_vnd IS NULL));
