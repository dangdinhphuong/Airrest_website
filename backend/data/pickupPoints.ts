// Điểm đón khách delay ở sân bay (xe sân bay -> khách sạn). Chọn từ danh sách cố định theo sân bay; sân bay chưa liệt kê dùng điểm mặc định chung.
const POINTS: Record<string, readonly string[]> = {
  HAN: ['Nhà ga T1 - cửa ra khu vực đón', 'Nhà ga T2 - cửa ra khu vực đón'],
  SGN: ['Nhà ga T1 - cửa ra khu vực đón', 'Nhà ga T2 - cửa ra khu vực đón'],
  DAD: ['Nhà ga T1 - cửa ra khu vực đón', 'Nhà ga T2 - cửa ra khu vực đón'],
};
const GENERIC = ['Nhà ga hành khách - cửa ra khu vực đón'] as const;

export const pickupPointsOf = (iata: string): readonly string[] => POINTS[iata.toUpperCase()] ?? GENERIC;
