import { db, withTransaction } from '../../database/pg';
import { AppError, isDuplicateKey } from '../../lib/errors';

// Tên hiển thị = tên gọi (từ cuối của họ tên) để không lộ họ tên đầy đủ của khách.
const displayName = (fullName: string) => fullName.trim().split(/\s+/).pop() || 'Khách';

export async function listReviews(hotelId: string, q: { limit: number; cursor?: number }) {
  const rows = (
    await db.query<{ id: string; seq: number; reviewerName: string; score: number; comment?: string; createdAt: Date }>(
      'SELECT id, seq, reviewer_name, score, comment, created_at FROM hotel_reviews WHERE hotel_id = $1 AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT $3',
      [hotelId, q.cursor ?? null, q.limit + 1],
    )
  ).rows;
  const page = rows.slice(0, q.limit);
  const agg = (await db.query<{ avg: number; count: number }>('SELECT COALESCE(round(avg(score), 1), 0) AS avg, count(*)::int AS count FROM hotel_reviews WHERE hotel_id = $1', [hotelId])).rows[0]!;
  const dist = (await db.query<{ score: number; n: number }>('SELECT score, count(*)::int AS n FROM hotel_reviews WHERE hotel_id = $1 GROUP BY score', [hotelId])).rows;
  const distribution = Array.from({ length: 10 }, (_, i) => dist.find((d) => d.score === i + 1)?.n ?? 0); // [điểm 1..10] số lượt
  return { summary: { avg: Number(agg.avg), count: agg.count, distribution }, items: page.map(({ seq: _seq, ...r }) => r), nextCursor: rows.length > q.limit ? page[page.length - 1]!.seq : null };
}

// Chỉ khách có đơn đã trả phòng của chính khách sạn này (khớp CẢ mã lẫn SĐT) mới đánh giá được, mỗi đơn một lần.
export async function createReview(hotelId: string, b: { code: string; phone: string; score: number; comment?: string }) {
  return withTransaction(async (tx) => {
    const bk = (await tx.query<{ id: string; status: string; guest: { fullName: string } }>("SELECT id, status, guest FROM bookings WHERE code = $1 AND guest->>'phone' = $2 AND hotel_id = $3", [b.code, b.phone, hotelId])).rows[0];
    if (!bk) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn với thông tin đã nhập tại khách sạn này');
    if (bk.status !== 'CHECKED_OUT') throw new AppError(422, 'BOOKING_NOT_COMPLETED', 'Chỉ đánh giá được sau khi đã trả phòng');
    let review;
    try {
      review = (await tx.query('INSERT INTO hotel_reviews (hotel_id, booking_id, reviewer_name, score, comment) VALUES ($1,$2,$3,$4,$5) RETURNING id, reviewer_name, score, comment, created_at', [hotelId, bk.id, displayName(bk.guest.fullName), b.score, b.comment || null])).rows[0];
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(409, 'REVIEW_EXISTS', 'Đơn này đã được đánh giá');
      throw e;
    }
    await tx.query("UPDATE hotels SET rating = (SELECT jsonb_build_object('avg', round(avg(score), 2), 'count', count(*)) FROM hotel_reviews WHERE hotel_id = $1), updated_at = now() WHERE id = $1", [hotelId]);
    return review;
  });
}
