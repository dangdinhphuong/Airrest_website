// Nguồn dữ liệu sân bay: 22 sân bay thương mại Việt Nam đang khai thác đường bay định kỳ (HAN, SGN và 20 sân bay địa phương).
// Tên và tỉnh/thành theo cách gọi thông dụng; tọa độ là vị trí xấp xỉ (dùng để đặt cơ sở lưu trú mô phỏng quanh sân bay).
// `international`: có đường bay quốc tế (định kỳ hoặc thuê chuyến). Thêm/bớt sân bay: sửa mảng này, API /v1/airports và seed tự theo.
export interface Airport {
  iata: string;
  name: string; // tên thông dụng, ví dụ "Nội Bài"
  city: string; // thành phố/tỉnh phục vụ
  region: 'Bắc' | 'Trung' | 'Tây Nguyên' | 'Nam';
  lat: number;
  lng: number;
  international: boolean;
}

export const AIRPORTS: readonly Airport[] = [
  { iata: 'HAN', name: 'Nội Bài', city: 'Hà Nội', region: 'Bắc', lat: 21.2212, lng: 105.807, international: true },
  { iata: 'SGN', name: 'Tân Sơn Nhất', city: 'TP.HCM', region: 'Nam', lat: 10.8188, lng: 106.652, international: true },
  { iata: 'DAD', name: 'Đà Nẵng', city: 'Đà Nẵng', region: 'Trung', lat: 16.0439, lng: 108.1994, international: true },
  { iata: 'CXR', name: 'Cam Ranh', city: 'Khánh Hòa (Nha Trang)', region: 'Trung', lat: 11.9982, lng: 109.2194, international: true },
  { iata: 'PQC', name: 'Phú Quốc', city: 'Kiên Giang (Phú Quốc)', region: 'Nam', lat: 10.1698, lng: 103.9931, international: true },
  { iata: 'HPH', name: 'Cát Bi', city: 'Hải Phòng', region: 'Bắc', lat: 20.8194, lng: 106.7249, international: true },
  { iata: 'VII', name: 'Vinh', city: 'Nghệ An (Vinh)', region: 'Trung', lat: 18.7376, lng: 105.6708, international: true },
  { iata: 'HUI', name: 'Phú Bài', city: 'Thừa Thiên Huế', region: 'Trung', lat: 16.4015, lng: 107.7026, international: true },
  { iata: 'VCA', name: 'Cần Thơ', city: 'Cần Thơ', region: 'Nam', lat: 10.0851, lng: 105.7117, international: true },
  { iata: 'DLI', name: 'Liên Khương', city: 'Lâm Đồng (Đà Lạt)', region: 'Tây Nguyên', lat: 11.75, lng: 108.3667, international: true },
  { iata: 'VDO', name: 'Vân Đồn', city: 'Quảng Ninh (Hạ Long)', region: 'Bắc', lat: 21.1178, lng: 107.4142, international: true },
  { iata: 'THD', name: 'Thọ Xuân', city: 'Thanh Hóa', region: 'Trung', lat: 19.9017, lng: 105.4678, international: false },
  { iata: 'UIH', name: 'Phù Cát', city: 'Bình Định (Quy Nhơn)', region: 'Trung', lat: 13.955, lng: 109.042, international: false },
  { iata: 'TBB', name: 'Tuy Hòa', city: 'Phú Yên', region: 'Trung', lat: 13.0496, lng: 109.334, international: false },
  { iata: 'VCL', name: 'Chu Lai', city: 'Quảng Nam', region: 'Trung', lat: 15.4033, lng: 108.7058, international: false },
  { iata: 'PXU', name: 'Pleiku', city: 'Gia Lai (Pleiku)', region: 'Tây Nguyên', lat: 14.0045, lng: 108.0172, international: false },
  { iata: 'BMV', name: 'Buôn Ma Thuột', city: 'Đắk Lắk', region: 'Tây Nguyên', lat: 12.6683, lng: 108.12, international: false },
  { iata: 'VDH', name: 'Đồng Hới', city: 'Quảng Bình', region: 'Trung', lat: 17.515, lng: 106.5906, international: false },
  { iata: 'VKG', name: 'Rạch Giá', city: 'Kiên Giang (Rạch Giá)', region: 'Nam', lat: 9.9581, lng: 105.1325, international: false },
  { iata: 'CAH', name: 'Cà Mau', city: 'Cà Mau', region: 'Nam', lat: 9.1775, lng: 105.1778, international: false },
  { iata: 'VCS', name: 'Côn Đảo', city: 'Bà Rịa - Vũng Tàu (Côn Đảo)', region: 'Nam', lat: 8.7318, lng: 106.6333, international: false },
  { iata: 'DIN', name: 'Điện Biên Phủ', city: 'Điện Biên', region: 'Bắc', lat: 21.3975, lng: 103.0078, international: false },
];

export const airportByIata = (iata: string): Airport | undefined => AIRPORTS.find((a) => a.iata === iata.toUpperCase());
