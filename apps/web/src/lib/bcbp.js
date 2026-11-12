// Đọc phần bắt buộc của thẻ lên tàu IATA BCBP (Resolution 792): chỉ lấy số hiệu chuyến bay và ngày bay.
// Cố ý KHÔNG trả tên hành khách / mã đặt chỗ để chúng không bao giờ rời khỏi hàm này.
const pad = (n) => String(n).padStart(2, '0');

// Ngày trong thẻ chỉ có số thứ tự trong năm (1-366), không có năm: chọn năm cho ngày bay gần hôm nay nhất.
export function ordinalToIso(ordinal, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const d = new Date(y, 0, ordinal);
    if (d.getFullYear() !== y) continue; // 366 ở năm không nhuận tràn sang năm sau
    if (!best || Math.abs(d - today) < Math.abs(best - today)) best = d;
  }
  return best ? `${best.getFullYear()}-${pad(best.getMonth() + 1)}-${pad(best.getDate())}` : null;
}

// "M1DESMARAIS/LUC  EABC123 YULFRAAC 0834 226F001A0025 100" -> { flight: 'AC834', date: '2026-08-14' } hoặc null.
export function parseBcbp(text, now = new Date()) {
  const s = String(text ?? '');
  if (s.length < 58 || s[0] !== 'M' || !/^[1-9]$/.test(s[1])) return null;
  const carrier = s.slice(36, 39).trim();
  const number = s.slice(39, 44).trim();
  const ordinal = Number(s.slice(44, 47));
  if (!/^[A-Z0-9]{2,3}$/.test(carrier) || !/^\d{1,4}[A-Z]?$/.test(number) || !(ordinal >= 1 && ordinal <= 366)) return null;
  const date = ordinalToIso(ordinal, now);
  if (!date) return null;
  return { flight: `${carrier}${number.replace(/^0+(?=\d)/, '')}`, date };
}
