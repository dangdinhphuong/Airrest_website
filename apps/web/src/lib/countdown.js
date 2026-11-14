// Đồng hồ đếm ngược dùng chung cho luồng delay (quầy + khách sạn). Server trả secondsLeft tại thời điểm tải; client trừ dần.
import { useEffect, useState } from 'react';

// secondsLeft lúc tải (fetchedAt, ms) -> số giây còn lại tại now (ms). Không âm; thiếu dữ liệu thì 0.
export const remainingSeconds = (secondsLeft, fetchedAt, now) => {
  const s = Number(secondsLeft);
  if (!Number.isFinite(s)) return 0;
  return Math.max(0, s - Math.floor((now - fetchedAt) / 1000));
};

export const fmtCountdown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Trả Date.now() cập nhật mỗi `ms` (mặc định 1 giây).
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
