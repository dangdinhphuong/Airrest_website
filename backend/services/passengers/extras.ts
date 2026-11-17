import { z } from 'zod';
import { db } from '../../database/pg';
import { AppError } from '../../lib/errors';

// Yêu thích, thông báo, mã giảm giá của khách đã đăng nhập. Mọi truy vấn khóa theo accountId lấy từ token.

export const hotelIdParams = z.object({ hotelId: z.string().uuid() });

// Chỉ trả id: ảnh khách sạn là khóa R2 cần chuyển thành URL, FE đã có sẵn getHotel/toHotelView cho việc đó.
export async function listFavorites(accountId: string) {
  const rows = (await db.query<{ hotelId: string }>('SELECT hotel_id FROM passenger_favorites WHERE account_id = $1 ORDER BY created_at DESC LIMIT 100', [accountId])).rows;
  return { hotelIds: rows.map((r) => r.hotelId) };
}

export async function addFavorite(accountId: string, hotelId: string) {
  const ok = (await db.query('SELECT 1 FROM hotels WHERE id = $1', [hotelId])).rowCount;
  if (!ok) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  await db.query('INSERT INTO passenger_favorites (account_id, hotel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [accountId, hotelId]);
}

export async function removeFavorite(accountId: string, hotelId: string) {
  await db.query('DELETE FROM passenger_favorites WHERE account_id = $1 AND hotel_id = $2', [accountId, hotelId]);
}

// Thông báo = các lần đổi trạng thái đơn của chính khách (statusHistory), mới nhất trước; không cần bảng riêng nên không phải móc vào từng chỗ đổi trạng thái.
// Chưa đọc = sự kiện sau notif_seen_at (chưa từng đọc: trong 7 ngày gần nhất).
export async function listNotifications(accountId: string) {
  const rows = (
    await db.query<{ code: string; hotel: string; to: string; at: string; unread: boolean }>(
      `SELECT b.code, b.hotel_snapshot->>'name' AS hotel, e->>'to' AS "to", e->>'at' AS at,
              (e->>'at')::timestamptz > COALESCE(a.notif_seen_at, now() - interval '7 days') AS unread
       FROM accounts a
       JOIN bookings b ON b.account_id = a.id
       CROSS JOIN LATERAL jsonb_array_elements(b.status_history) e
       WHERE a.id = $1 AND (e->>'at')::timestamptz > now() - interval '60 days'
       ORDER BY (e->>'at')::timestamptz DESC LIMIT 50`,
      [accountId],
    )
  ).rows;
  return { items: rows, unread: rows.filter((r) => r.unread).length };
}

export async function markNotificationsRead(accountId: string) {
  await db.query('UPDATE accounts SET notif_seen_at = now() WHERE id = $1', [accountId]);
}

// Mã còn hiệu lực (bật, trong khoảng thời gian). Mã dùng chung cho mọi khách.
export async function listVouchers() {
  const rows = (
    await db.query(
      `SELECT id, code, title, description, discount_type, value, min_total_vnd, expires_at
       FROM vouchers WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (expires_at IS NULL OR expires_at > now())
       ORDER BY expires_at NULLS LAST, created_at DESC LIMIT 50`,
    )
  ).rows;
  return { items: rows };
}
