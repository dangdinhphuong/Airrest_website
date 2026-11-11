import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../database/pg';
import type { HotelDoc, RoomTypeDoc } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { seqCursor, uuid } from '../../../lib/zod';
import { validate } from '../../middleware/validate';

export const hotelsRouter = Router();

const listQuery = z.object({
  airport: z.string().length(3).transform((s) => s.toUpperCase()),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: seqCursor.optional(), // seq của phần tử cuối trang trước
});

const idParams = z.object({ id: uuid });

// Chỉ trả trường công khai. Không bao giờ trả payoutAccount, contact nội bộ, incidentScore.
const PUBLIC_COLS = 'id, seq, name, code, location, airports, amenities, rating';

// Công khai: danh sách khách sạn theo sân bay, phân trang kiểu keyset (ổn định khi dữ liệu thay đổi).
// Bản đầy đủ (lọc giá, tồn phòng theo giờ) = FR-SRC-01/02.
hotelsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { airport, limit, cursor } = req.valid.query as z.infer<typeof listQuery>;
  const items = (
    await db.query<HotelDoc>(
      `SELECT ${PUBLIC_COLS} FROM hotels WHERE status = 'ACTIVE' AND airports @> $1::jsonb AND seq > $2 ORDER BY seq LIMIT ${limit + 1}`,
      [JSON.stringify([{ iata: airport }]), cursor ?? 0],
    )
  ).rows;
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  res.json({ items: page, nextCursor: hasMore ? page[page.length - 1]?.seq : null });
});

hotelsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const hotel = (await db.query<HotelDoc>(`SELECT ${PUBLIC_COLS} FROM hotels WHERE id = $1 AND status = 'ACTIVE'`, [id])).rows[0];
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const roomTypes = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE hotel_id = $1 AND active', [hotel.id])).rows;
  res.json({ hotel, roomTypes });
});
