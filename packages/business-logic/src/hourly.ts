// Đặt phòng theo giờ (kiểu nhà nghỉ): cấu hình theo từng loại phòng, nằm trong room_types.pricing.hourly (không cần cột mới).
// Hàm thuần, không đụng DB. Giờ trong ngày tính theo giờ Việt Nam (GMT+7).
export interface HourlyConfig {
  enabled: boolean;
  firstHourVnd: number; // giá giờ đầu
  nextHourVnd: number; // giá mỗi giờ tiếp theo
  minHours: number;
  maxHours: number;
  cleaningMin: number; // phút dọn phòng giữa hai lượt (chặn thêm sau giờ ra)
  openFromHour?: number; // 0-24, giờ VN; bỏ trống = không giới hạn khung giờ bán
  openToHour?: number;
}

export const DEFAULT_CLEANING_MIN = 30;
const HOUR_MS = 3600_000;
const VN_OFFSET_MS = 7 * HOUR_MS;

/** Cấu hình giờ đang BẬT của loại phòng (pricing jsonb), hoặc null. */
export const hourlyOf = (pricing: { hourly?: Partial<HourlyConfig> } | null | undefined): HourlyConfig | null => {
  const h = pricing?.hourly;
  return h?.enabled ? ({ cleaningMin: DEFAULT_CLEANING_MIN, ...h } as HourlyConfig) : null;
};

/** Giá MỘT phòng cho `hours` giờ: giờ đầu + (hours - 1) × giờ tiếp theo. VD 3 giờ = 120k + 2 × 70k = 260k. */
export const hourlyPrice = (c: Pick<HourlyConfig, 'firstHourVnd' | 'nextHourVnd'>, hours: number): number => c.firstHourVnd + (hours - 1) * c.nextHourVnd;

/** Giờ ra và mốc nhả phòng (giờ ra + dọn phòng). */
export const hourlyWindow = (startsAt: Date, hours: number, cleaningMin: number) => {
  const endsAt = new Date(startsAt.getTime() + hours * HOUR_MS);
  return { endsAt, holdTo: new Date(endsAt.getTime() + cleaningMin * 60_000) };
};

/** Số giờ lẻ kể từ 00:00 giờ VN cùng ngày (14:30 -> 14.5) và ngày VN dạng YYYY-MM-DD. */
export const vnClock = (d: Date) => {
  const t = new Date(d.getTime() + VN_OFFSET_MS);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() + t.getUTCMinutes() / 60 };
};

/** Kiểm số giờ và khung giờ bán; trả mã lỗi hoặc null nếu hợp lệ. */
export function hourlyViolation(c: HourlyConfig, startsAt: Date, hours: number): 'HOURS_OUT_OF_RANGE' | 'OUTSIDE_OPEN_HOURS' | null {
  if (!Number.isInteger(hours) || hours < c.minHours || hours > c.maxHours) return 'HOURS_OUT_OF_RANGE';
  if (c.openFromHour === undefined && c.openToHour === undefined) return null;
  const s = vnClock(startsAt);
  const e = vnClock(new Date(startsAt.getTime() + hours * HOUR_MS));
  const from = c.openFromHour ?? 0;
  const to = c.openToHour ?? 24;
  const endHour = e.date === s.date ? e.hour : e.hour + 24; // qua nửa đêm: tính tiếp trên cùng trục giờ
  return s.hour >= from && endHour <= to ? null : 'OUTSIDE_OPEN_HOURS';
}
