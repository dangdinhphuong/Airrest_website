// Khách sạn nhận đặt mới: ACTIVE, không tạm dừng riêng và doanh nghiệp (chuỗi) không tạm dừng. `a` là alias bảng hotels.
export const openHotel = (a = 'hotels') =>
  `${a}.status = 'ACTIVE' AND ${a}.paused_at IS NULL AND NOT EXISTS (SELECT 1 FROM businesses pb WHERE pb.id = ${a}.business_id AND pb.paused_at IS NOT NULL)`;
