// Logic thuần cho cấu hình phòng/ảnh (kiểm thử được, không phụ thuộc React).
export const IMAGE_TYPES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // khớp MAX_IMAGE_BYTES của backend
export const MAX_ROOM_TYPE_IMAGES = 10;
export const MAX_ROOM_IMAGES = 5;
export const AMENITIES = { WIFI: 'Wi-Fi', AIR_CONDITIONER: 'Điều hòa', BATHTUB: 'Bồn tắm', SHOWER: 'Vòi sen', BALCONY: 'Ban công', TV: 'TV', MINIBAR: 'Minibar', SAFE: 'Két sắt', KETTLE: 'Ấm đun nước', HAIR_DRYER: 'Máy sấy tóc', DESK: 'Bàn làm việc', FRIDGE: 'Tủ lạnh', WARDROBE: 'Tủ quần áo', BREAKFAST: 'Bữa sáng' }; // khớp ROOM_AMENITY_CODES

// Lọc danh sách file chọn: trả { ok, errors } (sai định dạng, quá 5 MB, quá số ảnh còn lại).
export function checkImageFiles(files, current, max) {
  const ok = [];
  const errors = [];
  for (const f of files) {
    if (!IMAGE_TYPES[f.type]) errors.push(`${f.name}: chỉ nhận ảnh ${Object.values(IMAGE_TYPES).join(', ')}.`);
    else if (f.size > MAX_IMAGE_BYTES) errors.push(`${f.name}: vượt quá 5 MB.`);
    else if (current + ok.length >= max) errors.push(`${f.name}: tối đa ${max} ảnh, hãy xóa bớt ảnh cũ.`);
    else ok.push(f);
  }
  return { ok, errors };
}

// Đưa phần tử i đi d bước (-1/+1); ra ngoài biên thì giữ nguyên. Đặt ảnh bìa = đưa lên đầu.
export const moveItem = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const k = [...arr];
  [k[i], k[j]] = [k[j], k[i]];
  return k;
};
export const makeCover = (arr, i) => (i <= 0 ? arr : [arr[i], ...arr.filter((_, x) => x !== i)]);

// Danh sách số phòng tạo hàng loạt; null nếu dải không hợp lệ (khớp luật backend: tối đa 100, số phòng <= 10 ký tự).
export function bulkNumbers(prefix, from, to) {
  const a = Number(from);
  const b = Number(to);
  if (from === '' || to === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b - a >= 100) return null;
  const out = Array.from({ length: b - a + 1 }, (_, i) => `${prefix}${a + i}`);
  return out.every((n) => n.length <= 10) ? out : null;
}
