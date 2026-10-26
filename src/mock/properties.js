// D3 — cơ sở lưu trú MÔ PHỎNG (34 cơ sở tổng hợp, không dùng bản ghi thật). Tên, giá, phòng, giờ là giả định mô phỏng (D-23 phương án B).
// closeExtHour: giờ nhận khách cuối, tính theo giờ “mở rộng” (24 = 00:00, 26 = 02:00 hôm sau). `reception24` bỏ qua giờ này.
// Tọa độ sân bay (vị trí thật của hai sân bay, dùng làm tâm bản đồ). Vị trí của từng cơ sở là TỔNG HỢP: đặt cách sân bay
// đúng `distanceKm` theo một góc cố định, KHÔNG phải địa chỉ thật (cơ sở cũng là dữ liệu mô phỏng).
export const AIRPORT_COORDS = { HAN: { lat: 21.2187, lng: 105.8072, name: 'Sân bay Nội Bài' }, SGN: { lat: 10.8188, lng: 106.652, name: 'Sân bay Tân Sơn Nhất' } };
const offset = (airport, km, deg) => {
  const c = AIRPORT_COORDS[airport]; const r = (deg * Math.PI) / 180;
  return { lat: +(c.lat + (km * Math.cos(r)) / 111).toFixed(5), lng: +(c.lng + (km * Math.sin(r)) / (111 * Math.cos((c.lat * Math.PI) / 180))).toFixed(5) };
};

const names = {
  HAN: ['Sao Mai Airport Hotel', 'Trăng Non Stay', 'Gió Đêm Inn', 'Hồng Hà Lodge', 'Cánh Cung Hotel', 'Lúa Vàng Stay', 'Mây Trắng Hostel',
    'Bến Sông Hotel', 'Đồng Xanh Apartment', 'An Nhiên Inn', 'Phù Sa Hotel', 'Sen Hồ Stay', 'Bình Minh Capsule', 'Thanh Tâm Hotel',
    'Nội Khu Lodge', 'Tre Xanh Stay', 'Sóng Biếc Hotel', 'Gạo Mới Hostel', 'Ngọc Lan Inn', 'Cầu Vồng Hotel'],
  SGN: ['Ánh Dương Airport Stay', 'Dừa Xiêm Hotel', 'Kênh Xanh Inn', 'Hoa Giấy Lodge', 'Nắng Sớm Hotel', 'Rạch Nhỏ Hostel', 'Sen Đất Stay',
    'Bồ Câu Hotel', 'Lúa Nước Apartment', 'Cánh Én Inn', 'Vàm Cỏ Hotel', 'Trầu Cau Stay', 'Mộc Lan Capsule', 'Hạc Giấy Hotel'],
};
const types = ['Khách sạn', 'Khách sạn', 'Nhà nghỉ', 'Căn hộ', 'Hộp ngủ', 'Phòng theo giờ'];
const roomLabel = { 'Khách sạn': 'Phòng đôi tiêu chuẩn', 'Nhà nghỉ': 'Phòng đôi', 'Căn hộ': 'Căn hộ 1 phòng ngủ', 'Hộp ngủ': 'Hộp ngủ đôi', 'Phòng theo giờ': 'Phòng đôi theo giờ' };

function build(airport, list, seed) {
  return list.map((name, i) => {
    const n = seed + i;
    const type = types[(n * 3) % types.length];
    const travelMin = 6 + ((n * 7) % 24);
    const reception24 = n % 3 !== 0;
    return {
      id: `${airport}-${String(i + 1).padStart(2, '0')}`, airport, name, type,
      room: roomLabel[type],
      distanceKm: Math.round((1 + travelMin * 0.28) * 10) / 10,
      travelMin,
      shuttle: n % 4 === 0 ? 'free' : n % 4 === 1 ? 'paid' : 'none',
      taxi: 60000 + travelMin * 4500,
      reception24,
      closeExtHour: [22, 23, 24, 25, 26][n % 5],
      freeCancel: n % 2 === 0,
      payAtProperty: n % 5 !== 0,
      familyRoom: n % 3 === 1,
      hourly: type === 'Phòng theo giờ' || type === 'Hộp ngủ' || n % 7 === 0,
      rating: (7 + ((n * 13) % 25) / 10).toFixed(1),
      price: 320000 + ((n * 97) % 14) * 60000,
      roomsLeft: n % 11 === 0 ? 0 : 1 + (n % 4),
      amenities: ['Tắm nước nóng', 'Wifi', n % 2 ? 'Gửi hành lý' : 'Điều hòa', ...(type === 'Căn hộ' ? ['Bếp nhỏ'] : [])],
      area: airport === 'HAN' ? 'Khu vực quanh Nội Bài (mô phỏng)' : 'Khu vực quanh Tân Sơn Nhất (mô phỏng)',
      ...offset(airport, Math.round((1 + travelMin * 0.28) * 10) / 10, (n * 47) % 360),
      soldOutOnConfirm: false,
      updatedAtOffsetMin: -((n * 5) % 25), // “cập nhật lúc” so với giờ mô phỏng hiện tại
    };
  });
}

export const PROPERTIES = [...build('HAN', names.HAN, 3), ...build('SGN', names.SGN, 5)];

// Kịch bản KT-19: một cơ sở mỗi sân bay “vừa hết phòng” đúng lúc xác nhận. Chọn cơ sở đang mở, gần nhất ở top 5.
['HAN', 'SGN'].forEach((ap) => {
  const cand = PROPERTIES.filter((p) => p.airport === ap && p.roomsLeft > 0 && p.reception24).sort((a, b) => a.travelMin - b.travelMin)[1];
  if (cand) { cand.soldOutOnConfirm = true; }
});
