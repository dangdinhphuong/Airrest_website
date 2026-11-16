import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';

// Định nghĩa doanh thu = đúng định nghĩa của services/dashboard/dashboard.service.ts (bookingMoneyByStatus, dùng cho thống kê khách sạn):
// - Mốc thời gian: ngày nhận phòng (bookings.stay_from) theo giờ Việt Nam.
// - Phần khách sạn nhận = pricing.roomVnd + pricing.shuttleVnd (KHÔNG gồm phí dịch vụ, BR-PAY-02); phí dịch vụ = pricing.serviceFeeVnd (tách riêng).
// - "Đã thực hiện" (realized) = đơn CHECKED_OUT; "Dự kiến" (expected) = đơn CONFIRMED + CHECKED_IN.
// - Kết toán (settlement) = hotel_payouts LOCKED/PAID của các kỳ (YYYY-MM) trùng khoảng ngày: gross/hoa hồng Airrest/net đã chốt theo services/settlement
//   (chỉ đơn đơn vị chi trả thật; cả tháng của kỳ được tính, không cắt theo ngày lẻ).
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;
const VN = "'Asia/Ho_Chi_Minh'";
export type GroupBy = 'day' | 'month';

export interface Money { bookings: number; realizedVnd: number; expectedVnd: number; serviceFeeRealizedVnd: number; serviceFeeExpectedVnd: number }
const zero = (): Money => ({ bookings: 0, realizedVnd: 0, expectedVnd: 0, serviceFeeRealizedVnd: 0, serviceFeeExpectedVnd: 0 });
const add = (a: Money, b: Money): Money => ({ bookings: a.bookings + b.bookings, realizedVnd: a.realizedVnd + b.realizedVnd, expectedVnd: a.expectedVnd + b.expectedVnd, serviceFeeRealizedVnd: a.serviceFeeRealizedVnd + b.serviceFeeRealizedVnd, serviceFeeExpectedVnd: a.serviceFeeExpectedVnd + b.serviceFeeExpectedVnd });
export const sumMoney = (rows: Money[]): Money => rows.reduce(add, zero());

export function parseRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`);
  const endInclusive = new Date(`${to}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime()) || from > to) throw new AppError(422, 'INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  if ((endInclusive.getTime() - start.getTime()) / DAY_MS >= MAX_DAYS) throw new AppError(422, 'RANGE_TOO_LARGE', `Khoảng thời gian tối đa ${MAX_DAYS} ngày`);
  return { from, to, start, endExclusive: new Date(endInclusive.getTime() + DAY_MS), fromPeriod: from.slice(0, 7), toPeriod: to.slice(0, 7) };
}

type Range = ReturnType<typeof parseRange>;
const MONEY_SQL = `
  count(*) FILTER (WHERE status IN ('CHECKED_OUT','CONFIRMED','CHECKED_IN')) AS bookings,
  COALESCE(sum(COALESCE((pricing->>'roomVnd')::bigint,0) + COALESCE((pricing->>'shuttleVnd')::bigint,0)) FILTER (WHERE status = 'CHECKED_OUT'), 0) AS realized_vnd,
  COALESCE(sum(COALESCE((pricing->>'roomVnd')::bigint,0) + COALESCE((pricing->>'shuttleVnd')::bigint,0)) FILTER (WHERE status IN ('CONFIRMED','CHECKED_IN')), 0) AS expected_vnd,
  COALESCE(sum(COALESCE((pricing->>'serviceFeeVnd')::bigint,0)) FILTER (WHERE status = 'CHECKED_OUT'), 0) AS service_fee_realized_vnd,
  COALESCE(sum(COALESCE((pricing->>'serviceFeeVnd')::bigint,0)) FILTER (WHERE status IN ('CONFIRMED','CHECKED_IN')), 0) AS service_fee_expected_vnd`;

// Mọi bucket (ngày hoặc tháng) trong khoảng, kể cả bucket không có đơn (= 0).
function buckets(r: Range, groupBy: GroupBy): string[] {
  const out: string[] = [];
  if (groupBy === 'month') {
    let [y, m] = r.fromPeriod.split('-').map(Number) as [number, number];
    while (`${y}-${String(m).padStart(2, '0')}` <= r.toPeriod) { out.push(`${y}-${String(m).padStart(2, '0')}`); m === 12 ? ((m = 1), y++) : m++; }
  } else {
    for (let t = Date.parse(`${r.from}T00:00:00Z`); t <= Date.parse(`${r.to}T00:00:00Z`); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const settlementOf = async (hotelIds: string[], r: Range) =>
  (
    await db.query<{ hotelId: string; period: string; status: string; grossVnd: number; commissionVnd: number; netVnd: number }>(
      "SELECT hotel_id, period, status, gross_vnd, commission_vnd, net_vnd FROM hotel_payouts WHERE hotel_id = ANY($1::uuid[]) AND period >= $2 AND period <= $3 AND status IN ('LOCKED','PAID') ORDER BY period",
      [hotelIds, r.fromPeriod, r.toPeriod],
    )
  ).rows;
const sumSettle = (rows: Array<{ grossVnd: number; commissionVnd: number; netVnd: number }>) => ({ grossVnd: rows.reduce((s, x) => s + x.grossVnd, 0), commissionVnd: rows.reduce((s, x) => s + x.commissionVnd, 0), netVnd: rows.reduce((s, x) => s + x.netVnd, 0) });

/** Báo cáo doanh thu RIÊNG một khách sạn, theo ngày/tháng (giờ VN). totals = tổng các dòng items. */
export async function hotelRevenue(hotelId: string, r: Range, groupBy: GroupBy) {
  const fmt = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
  const rows = (
    await db.query<Money & { bucket: string }>(
      `SELECT to_char(stay_from AT TIME ZONE ${VN}, '${fmt}') AS bucket, ${MONEY_SQL} FROM bookings WHERE hotel_id = $1 AND stay_from >= $2 AND stay_from < $3 GROUP BY 1`,
      [hotelId, r.start, r.endExclusive],
    )
  ).rows;
  const by = new Map(rows.map((x) => [x.bucket, x]));
  const items = buckets(r, groupBy).map((b) => ({ bucket: b, ...(by.get(b) ? pick(by.get(b)!) : zero()) }));
  const settle = await settlementOf([hotelId], r);
  return { hotelId, from: r.from, to: r.to, groupBy, items, totals: sumMoney(items), settlement: { items: settle, totals: sumSettle(settle) } };
}
const pick = (x: Money): Money => ({ bookings: x.bookings, realizedVnd: x.realizedVnd, expectedVnd: x.expectedVnd, serviceFeeRealizedVnd: x.serviceFeeRealizedVnd, serviceFeeExpectedVnd: x.serviceFeeExpectedVnd });

/** Báo cáo TỔNG của doanh nghiệp: một dòng mỗi khách sạn (kể cả không có đơn) + tổng cộng = tổng các dòng. */
export async function businessRevenueSummary(businessId: string, r: Range) {
  const hotels = (await db.query<{ id: string; code: string; name: string; status: string }>('SELECT id, code, name, status FROM hotels WHERE business_id = $1 ORDER BY seq', [businessId])).rows;
  const ids = hotels.map((h) => h.id);
  const money = (
    await db.query<Money & { hotelId: string }>(`SELECT hotel_id, ${MONEY_SQL} FROM bookings WHERE hotel_id = ANY($1::uuid[]) AND stay_from >= $2 AND stay_from < $3 GROUP BY hotel_id`, [ids, r.start, r.endExclusive])
  ).rows;
  const settle = await settlementOf(ids, r);
  const rows = hotels.map((h) => {
    const m = money.find((x) => x.hotelId === h.id);
    return { hotelId: h.id, code: h.code, name: h.name, status: h.status, ...(m ? pick(m) : zero()), settlement: sumSettle(settle.filter((s) => s.hotelId === h.id)) };
  });
  return { businessId, from: r.from, to: r.to, hotels: rows, totals: { ...sumMoney(rows), settlement: sumSettle(rows.map((x) => x.settlement)) } };
}

// CSV an toàn: bọc ngoặc kép, chặn công thức (=, +, -, @) bằng dấu nháy đơn đầu ô; BOM để Excel đọc đúng tiếng Việt.
const cell = (v: string | number) => { const s = String(v); return `"${(typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
export const toCsv = (header: string[], rows: Array<Array<string | number>>): string => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
