import type { BookingStatus } from '@airrest/shared-types';
import { db, type Db } from '../../database/pg';
import { AppError } from '../../lib/errors';

const DAY_MS = 86_400_000;
export interface DateRange { from: Date; to: Date }

export const BOOKING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'];

/** Mặc định 30 ngày gần nhất; from >= to -> INVALID_RANGE; quá 92 ngày -> RANGE_TOO_LARGE. */
export function resolveRange(q: { from?: Date; to?: Date }, now = new Date()): DateRange {
  const to = q.to ?? now;
  const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
  if (from >= to) throw new AppError(422, 'INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  if (to.getTime() - from.getTime() > 92 * DAY_MS) throw new AppError(422, 'RANGE_TOO_LARGE', 'Khoảng thời gian tối đa 92 ngày');
  return { from, to };
}

const filterHotel = (hotelId: string | undefined, params: unknown[]) => (hotelId ? ` AND hotel_id = $${params.push(hotelId)}` : '');

/** Số đơn + tổng tiền theo trạng thái, lọc theo ngày tạo; đủ mọi trạng thái (không có thì 0). */
export async function bookingCountsByStatus(tx: Db, r: DateRange, hotelId?: string): Promise<Record<BookingStatus, { count: number; totalVnd: number }>> {
  const params: unknown[] = [r.from, r.to];
  const rows = (
    await tx.query<{ status: BookingStatus; count: number; totalVnd: number }>(
      `SELECT status, count(*) AS count, COALESCE(sum((pricing->>'totalVnd')::bigint), 0) AS total_vnd FROM bookings WHERE created_at >= $1 AND created_at < $2${filterHotel(hotelId, params)} GROUP BY status`,
      params,
    )
  ).rows;
  return Object.fromEntries(BOOKING_STATUSES.map((s) => [s, { count: rows.find((x) => x.status === s)?.count ?? 0, totalVnd: rows.find((x) => x.status === s)?.totalVnd ?? 0 }])) as Record<BookingStatus, { count: number; totalVnd: number }>;
}

/** Cùng công thức với stats khách sạn: lọc ngày nhận phòng; phần khách sạn nhận = phòng + xe (không gồm phí dịch vụ). */
export async function bookingMoneyByStatus(tx: Db, r: DateRange, hotelId?: string) {
  const params: unknown[] = [r.from, r.to];
  const rows = (
    await tx.query<{ id: string; count: number; hotelShareVnd: number; serviceFeeVnd: number }>(
      `SELECT status AS id, count(*) AS count,
         sum(COALESCE((pricing->>'roomVnd')::bigint, 0) + COALESCE((pricing->>'shuttleVnd')::bigint, 0)) AS hotel_share_vnd,
         sum(COALESCE((pricing->>'serviceFeeVnd')::bigint, 0)) AS service_fee_vnd
       FROM bookings WHERE stay_from >= $1 AND stay_from < $2${filterHotel(hotelId, params)} GROUP BY status`,
      params,
    )
  ).rows;
  const byStatus = Object.fromEntries(rows.map((g) => [g.id, { count: g.count, hotelShareVnd: g.hotelShareVnd, serviceFeeVnd: g.serviceFeeVnd }]));
  const sum = (statuses: string[], f: 'hotelShareVnd' | 'serviceFeeVnd') => statuses.reduce((s, st) => s + (byStatus[st]?.[f] ?? 0), 0);
  return {
    from: r.from, to: r.to,
    // Đã thực hiện = khách đã trả phòng; dự kiến = đã xác nhận/đang ở.
    realized: { hotelShareVnd: sum(['CHECKED_OUT'], 'hotelShareVnd'), serviceFeeVnd: sum(['CHECKED_OUT'], 'serviceFeeVnd') },
    expected: { hotelShareVnd: sum(['CONFIRMED', 'CHECKED_IN'], 'hotelShareVnd'), serviceFeeVnd: sum(['CONFIRMED', 'CHECKED_IN'], 'serviceFeeVnd') },
    byStatus,
  };
}

/** Số đơn tạo mỗi ngày (giờ VN), ngày không có đơn = 0. */
export async function bookingTrend(tx: Db, r: DateRange, hotelId?: string): Promise<Array<{ date: string; count: number }>> {
  const params: unknown[] = [r.from, r.to];
  const hotel = hotelId ? ` AND b.hotel_id = $${params.push(hotelId)}` : '';
  return (
    await tx.query<{ date: string; count: number }>(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS date, count(b.id) AS count
       FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, (($2::timestamptz - interval '1 millisecond') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, interval '1 day') d
       LEFT JOIN bookings b ON (b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d::date AND b.created_at >= $1 AND b.created_at < $2${hotel}
       GROUP BY d ORDER BY d`,
      params,
    )
  ).rows;
}

export async function bookingsSection(tx: Db, r: DateRange, hotelId?: string) {
  const [byStatus, trend, pending] = await Promise.all([
    bookingCountsByStatus(tx, r, hotelId),
    bookingTrend(tx, r, hotelId),
    tx.query<{ n: number }>(`SELECT count(*) AS n FROM bookings WHERE status = 'PENDING'${hotelId ? ' AND hotel_id = $1' : ''}`, hotelId ? [hotelId] : []),
  ]);
  return { total: Object.values(byStatus).reduce((s, x) => s + x.count, 0), byStatus, pendingApproval: pending.rows[0]!.n, trend };
}

const countBy = async (table: string, col: string, keys: string[]): Promise<Record<string, number>> => {
  const rows = (await db.query<{ k: string; n: number }>(`SELECT ${col} AS k, count(*) AS n FROM ${table} GROUP BY ${col}`)).rows;
  return Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.k === k)?.n ?? 0]));
};

/** Dashboard toàn hệ thống (chỉ đọc, không bảng mới). */
export async function getDashboard(q: { from?: Date; to?: Date }, now = new Date()) {
  const range = resolveRange(q, now);
  const [bookings, revenue, hotels, support, shuttle, changes] = await Promise.all([
    bookingsSection(db, range),
    bookingMoneyByStatus(db, range),
    countBy('hotels', 'status', ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED']),
    countBy('support_tickets', 'status', ['OPEN', 'IN_PROGRESS', 'RESOLVED']),
    countBy('shuttle_requests', 'status', ['REQUESTED', 'ASSIGNED', 'DONE', 'CANCELLED']),
    countBy('change_requests', 'status', ['PENDING', 'APPROVED', 'REJECTED']),
  ]);
  return {
    asOf: now, range,
    bookings,
    revenue: { realized: revenue.realized, expected: revenue.expected },
    hotels: { byStatus: hotels, pendingApproval: hotels.PENDING_APPROVAL },
    support: { open: support.OPEN, inProgress: support.IN_PROGRESS },
    shuttle: { requested: shuttle.REQUESTED, assigned: shuttle.ASSIGNED },
    changeRequests: { pending: changes.PENDING },
  };
}
