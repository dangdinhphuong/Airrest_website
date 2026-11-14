import type { Db } from '../../database/pg';

// Chuyến mà tài xế đã nhận (ACCEPTED trở đi): từ đây hủy xe không hoàn phí chiều đó.
export const TAKEN_TRIP = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD', 'DROPPED_OFF'];

export interface RefundableLeg { id: string; priceVnd: number }

/**
 * Các chiều xe cùng đơn (billed), còn REQUESTED, chưa có tài xế nhận (chuyến chỉ ở OFFERED/NEEDS_EXTERNAL hoặc chưa điều), giá > 0.
 * KHÔNG dẫn tới hoàn tiền (chính sách: khách không đi xe thì không hoàn); chỉ để giảm tổng đơn AT_HOTEL khi hủy riêng chiều. Gọi trong transaction đã khóa đơn.
 */
export async function untakenLegs(tx: Db, bookingId: string, onlyId?: string): Promise<RefundableLeg[]> {
  return (
    await tx.query<RefundableLeg>(
      `SELECT s.id, s.price_vnd FROM shuttle_requests s
       WHERE s.booking_id = $1 AND s.billed AND s.status = 'REQUESTED' AND s.price_vnd > 0 AND ($3::uuid IS NULL OR s.id = $3)
         AND NOT EXISTS (SELECT 1 FROM shuttle_trips t WHERE t.request_id = s.id AND t.status = ANY($2::text[]))
       ORDER BY s.seq`,
      [bookingId, TAKEN_TRIP, onlyId ?? null],
    )
  ).rows;
}

/** Chỉ còn cho dữ liệu cũ: tổng đã hoàn riêng các chiều xe trước chính sách mới (SHUTTLE_CANCELLED), phần này đã không còn trong tổng đơn. Luồng mới không tạo thêm. */
export async function legRefundedVnd(tx: Db, bookingId: string): Promise<number> {
  return Number((await tx.query<{ s: string | null }>("SELECT sum(amount_vnd) AS s FROM refunds WHERE booking_id = $1 AND reason_code = 'SHUTTLE_CANCELLED'", [bookingId])).rows[0]?.s ?? 0);
}
