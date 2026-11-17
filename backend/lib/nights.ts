// Số đêm = số ngày lịch (giờ VN) giữa ngày nhận và ngày trả, tối thiểu 1. Không phụ thuộc giờ nhận/trả khách chọn
// (nhận sớm hay trả muộn không tự thành thêm một đêm; phụ thu sớm/muộn, nếu có, là chính sách riêng).
const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 24 * 3600_000;
const vnDayNumber = (d: Date) => Math.floor((d.getTime() + VN_OFFSET_MS) / DAY_MS);
export const stayNights = (from: Date, to: Date): number => Math.max(1, vnDayNumber(to) - vnDayNumber(from));
