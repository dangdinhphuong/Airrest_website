// Tham số mô phỏng của prototype. TẤT CẢ giá trị ở đây là giả định mô phỏng, CHƯA được PO phê duyệt
// (xem docs/srs/PRODUCT_DECISION_REGISTER.md: D-02, D-04, D-06, D-08). Đổi giá trị ở đây, giao diện tự cập nhật (NFR-009).
const raw = {
  arrivalLeadMin: 120,      // D-02: giờ có mặt tại sân bay trước giờ bay (mô phỏng)
  counterCloseMin: 40,      // Ràng buộc cứng: đóng quầy nội địa 40 phút trước giờ đi (TT 48/2026 Điều 8.1b)
  leaveBufferMin: 15,       // dự phòng khi tính giờ rời nơi nghỉ (B03 FR-13)
  requestExpiryMin: 15,     // D-04: thời hạn chờ phản hồi của yêu cầu L2 (mô phỏng)
  staleAfterMin: 30,        // D-08: coi dữ liệu là cũ sau 30 phút (mô phỏng)
  airlineReplyMin: 8,       // phút mô phỏng để hãng phản hồi (kịch bản theo chuyến bay)
  propertyReplyMin: 8,      // phút mô phỏng để cơ sở phản hồi sau khi hãng duyệt
  topResults: 5,            // D-21: số kết quả nổi bật ở màn đầu (Proposed)
  restWarnMin: 60,          // dưới ngưỡng này cảnh báo “thời gian nghỉ ngắn” (Proposed)
  latencyMs: 350,           // độ trễ mô phỏng của mock service để có trạng thái đang tải
  assumptions: { rooms: 1, nights: 1, adults: 2 }, // D-06
};

// Ràng buộc cứng: giờ có mặt không được muộn hơn mốc đóng quầy.
// SIM đổi được lúc chạy qua setSimParam (quản trị, FR-032); giá trị mặc định lấy từ `raw`.
export const SIM = {
  ...raw,
  arrivalLeadMin: Math.max(raw.arrivalLeadMin, raw.counterCloseMin),
};
const DEFAULTS = { ...SIM };

// [nhỏ nhất, lớn nhất, đơn vị, nhãn] của các tham số quản trị được phép sửa.
export const SIM_LIMITS = {
  arrivalLeadMin: [raw.counterCloseMin, 360, 'phút', 'Giờ có mặt trước giờ bay'],
  requestExpiryMin: [1, 120, 'phút', 'Hạn chờ phản hồi của yêu cầu hỗ trợ'],
  staleAfterMin: [5, 240, 'phút', 'Ngưỡng coi dữ liệu là cũ'],
  topResults: [1, 20, 'nơi', 'Số kết quả nổi bật'],
  restWarnMin: [0, 240, 'phút', 'Ngưỡng cảnh báo nghỉ ngắn'],
};
export function validateSimParam(key, value) {
  const lim = SIM_LIMITS[key];
  if (!lim) return 'Tham số không được phép sửa.';
  if (!Number.isInteger(value)) return 'Nhập một số nguyên.';
  if (value < lim[0] || value > lim[1]) return key === 'arrivalLeadMin'
    ? `Giờ có mặt phải từ ${lim[0]} phút (mốc đóng quầy nội địa) đến ${lim[1]} phút.`
    : `Giá trị phải từ ${lim[0]} đến ${lim[1]} ${lim[2]}.`;
  return null;
}
export function setSimParam(key, value) {
  const e = validateSimParam(key, value);
  if (e) return { ok: false, error: e };
  SIM[key] = value;
  return { ok: true };
}
export function resetSimParams() { Object.keys(SIM_LIMITS).forEach((k) => { SIM[k] = DEFAULTS[k]; }); }

export const LABEL_SIM = 'Mô phỏng';
export const SIM_DATE_ACCESSED = '2026-10-26';

// Giờ mô phỏng khi duyệt nơi nghỉ mà chưa nhập chuyến bay (giả định, chưa duyệt): 23:08 hôm nay.
export const BROWSE_NOW = 23 * 60 + 8;
