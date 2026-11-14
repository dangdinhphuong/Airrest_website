import type { Db } from '../../database/pg';
import { AppError } from '../../lib/errors';

// Kỳ = tháng dương lịch theo giờ Việt Nam ('YYYY-MM'). Đơn thuộc kỳ theo THÁNG CỦA stay.to (giờ VN).
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const assertPeriod = (p: string): string => {
  if (!PERIOD_RE.test(p)) throw new AppError(422, 'INVALID_PERIOD', "Kỳ phải có dạng 'YYYY-MM'");
  return p;
};
export const nextPeriod = (p: string): string => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return m === 12 ? `${y! + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
/** Kỳ đã kết thúc khi đã sang tháng sau theo giờ VN (UTC+7, không có giờ mùa hè). */
export const periodEnded = (p: string, now = new Date()): boolean => {
  const [y, m] = nextPeriod(p).split('-').map(Number) as [number, number];
  return now.getTime() >= Date.UTC(y, m - 1, 1) - 7 * 3600_000;
};

/**
 * Hoa hồng Airrest của MỘT dòng = floor(giá hợp đồng × pct / 100), làm tròn XUỐNG từng dòng (không làm tròn trên tổng).
 * pct có tối đa 2 số lẻ (numeric(5,2)) nên tính bằng phần trăm-của-phần-trăm (số nguyên) để không dính sai số số thực.
 */
export const commissionOf = (amountVnd: number, pct: number): number => {
  if (!Number.isSafeInteger(amountVnd) || amountVnd < 0) throw new Error('amountVnd phải là số nguyên VND >= 0');
  return Math.floor((amountVnd * Math.round(pct * 100)) / 10_000);
};

export const BILLABLE = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW']; // NO_SHOW vẫn tính: khách sạn đã giữ phòng
const VN = "'Asia/Ho_Chi_Minh'";

export interface RoomRow { bookingId: string; bookingCode: string; payerId: string; hotelId: string; groupCode: string | null; flightCode: string | null; amountVnd: number; upgradeVnd: number; commissionVnd: number; noRate: boolean }
// RoomRow: amountVnd = giá phòng CHUẨN (dòng ROOM), upgradeVnd = phần chênh nâng hạng (dòng UPGRADE_DELTA); amountVnd + upgradeVnd = giá hợp đồng hạng đã nâng (= pricing.roomVnd).
// Hoa hồng tính trên TỔNG (amountVnd + upgradeVnd) và ghi ở dòng ROOM; dòng UPGRADE_DELTA có commission = 0. Khách sạn nhận trên tổng giá hợp đồng nên bảng chi trả KS dùng tổng.
export interface ShuttleRow { bookingId: string; payerId: string; hotelId: string; groupCode: string | null; flightCode: string | null; amountVnd: number; memo: string }

// Điều kiện chung: đơn PAYER thật (booking, lô và chuyến đều KHÔNG simulated), trạng thái tính tiền, stay.to thuộc kỳ (giờ VN).
const FROM = `FROM bookings b JOIN delay_batches bt ON bt.id = b.batch_id JOIN flights f ON f.id = bt.flight_id LEFT JOIN delay_groups g ON g.id = b.group_id`;
const WHERE = `b.payment_method = 'PAYER' AND b.simulated = false AND bt.simulated = false AND f.simulated = false
  AND b.status = ANY($1::text[]) AND to_char(((b.stay->>'to')::timestamptz) AT TIME ZONE ${VN}, 'YYYY-MM') = $2
  AND ($3::uuid IS NULL OR bt.payer_id = $3) AND ($4::uuid IS NULL OR b.hotel_id = $4)`;

/** Dòng phòng + hoa hồng. pct = chụp lúc đặt (pricing.params.commissionPct) nếu có, không thì giá hợp đồng hiệu lực theo ngày vào (rồi giá active mới nhất). */
export async function collectRoomRows(tx: Db, period: string, f: { payerId?: string; hotelId?: string } = {}): Promise<RoomRow[]> {
  const rows = (
    await tx.query<{ id: string; code: string; payerId: string; hotelId: string; groupCode?: string; pnr?: string; flightCode: string; room: number; delta: number; pct?: number }>(
      `SELECT b.id, b.code, bt.payer_id, b.hotel_id, g.code AS group_code, g.pnr, f.code AS flight_code, COALESCE((b.pricing->>'roomVnd')::bigint, 0) AS room,
              COALESCE((SELECT sum(o.upgrade_delta_vnd) FROM delay_room_offers o WHERE o.booking_id = b.id), 0) AS delta,
              COALESCE((b.pricing->'params'->>'commissionPct')::numeric, rate.commission_pct) AS pct
       ${FROM}
       LEFT JOIN LATERAL (SELECT r.commission_pct FROM payer_hotel_rates r
          WHERE r.payer_id = bt.payer_id AND r.hotel_id = b.hotel_id AND r.room_type_id = (b.lines->0->>'roomTypeId')::uuid AND r.active
          ORDER BY (r.valid_from <= (b.stay_from AT TIME ZONE ${VN})::date AND (r.valid_to IS NULL OR r.valid_to >= (b.stay_from AT TIME ZONE ${VN})::date)) DESC, r.valid_from DESC LIMIT 1) rate ON true
       WHERE ${WHERE} ORDER BY b.seq`,
      [BILLABLE, period, f.payerId ?? null, f.hotelId ?? null],
    )
  ).rows;
  // shortcut: đơn nhiều loại phòng dùng pct của loại phòng ĐẦU TIÊN cho cả đơn; tách theo loại khi hợp đồng có hoa hồng khác nhau giữa các loại.
  return rows.map((r) => ({ bookingId: r.id, bookingCode: r.code, payerId: r.payerId, hotelId: r.hotelId, groupCode: r.groupCode ?? r.pnr ?? null, flightCode: r.flightCode, amountVnd: r.room - Math.min(r.delta, r.room), upgradeVnd: Math.min(r.delta, r.room), commissionVnd: r.pct === undefined ? 0 : commissionOf(r.room, r.pct), noRate: r.pct === undefined }));
}

/** Tiền xe: shuttle_requests chưa hủy của các đơn tính tiền trong kỳ (price_vnd > 0). */
export async function collectShuttleRows(tx: Db, period: string, payerId: string): Promise<ShuttleRow[]> {
  const rows = (
    await tx.query<{ id: string; payerId: string; hotelId: string; groupCode?: string; pnr?: string; flightCode: string; price: number; direction: string; airport: string }>(
      `SELECT b.id, bt.payer_id, b.hotel_id, g.code AS group_code, g.pnr, f.code AS flight_code, s.price_vnd AS price, s.direction, s.airport_iata AS airport
       ${FROM} JOIN shuttle_requests s ON s.booking_id = b.id
       WHERE ${WHERE} AND s.status <> 'CANCELLED' AND s.price_vnd > 0 ORDER BY s.seq`,
      [BILLABLE, period, payerId, null],
    )
  ).rows;
  return rows.map((r) => ({ bookingId: r.id, payerId: r.payerId, hotelId: r.hotelId, groupCode: r.groupCode ?? r.pnr ?? null, flightCode: r.flightCode, amountVnd: r.price, memo: `Xe ${r.direction} ${r.airport}` }));
}
