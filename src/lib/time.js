// Thời gian mô phỏng được lưu bằng số phút "tuyệt đối" tính từ 00:00 của ngày hôm nay (ngày 0).
const startOfToday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

export const pad = (n) => String(n).padStart(2, '0');
export const dateAt = (abs) => new Date(startOfToday.getTime() + abs * 60000);
export const fmtTime = (abs) => { const d = dateAt(abs); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDate = (abs) => { const d = dateAt(abs); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const fmtDateTime = (abs) => `${fmtTime(abs)} · ${fmtDate(abs)}`;
export const isoDate = (dayOffset) => { const d = dateAt(dayOffset * 1440); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const dayOffsetOfIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const t = new Date(y, m - 1, d); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - startOfToday.getTime()) / 86400000);
};
export const fmtDuration = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60); const r = m % 60;
  if (h === 0) return `${r} phút`;
  return r === 0 ? `${h} giờ` : `${h} giờ ${r} phút`;
};
export const minutesOfDay = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const money = (v) => `${new Intl.NumberFormat('vi-VN').format(v)}đ`;
