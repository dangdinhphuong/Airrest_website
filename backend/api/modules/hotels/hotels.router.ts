import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../database/pg';
import type { HotelDoc, RoomTypeDoc } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { seqCursor, uuid } from '../../../lib/zod';
import { validate } from '../../middleware/validate';
import { hotelFeatures, publicRooms } from '../../../services/hotels/catalog';

export const hotelsRouter = Router();

const listQuery = z.object({
  airport: z.string().length(3).transform((s) => s.toUpperCase()),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: seqCursor.optional(), // seq của phần tử cuối trang trước
  // Cửa sổ tính số phòng còn; mặc định từ bây giờ tới 24 giờ sau, tối đa 31 ngày.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const idQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const DAY_MS = 86_400_000;
function windowOf(q: { from?: Date; to?: Date }) {
  const from = q.from ?? new Date();
  const to = q.to ?? new Date(from.getTime() + DAY_MS);
  if (to <= from) throw new AppError(422, 'VALIDATION_ERROR', '`to` phải sau `from`');
  if (to.getTime() - from.getTime() > 31 * DAY_MS) throw new AppError(422, 'VALIDATION_ERROR', 'Khoảng thời gian tối đa 31 ngày');
  return { from, to };
}

const idParams = z.object({ id: uuid });

// Chỉ trả trường công khai. Không bao giờ trả payoutAccount, contact nội bộ, incidentScore.
const PUBLIC_COLS = 'id, seq, name, code, location, airports, amenities, rating, policy, address, description';

// `policy` chỉ để suy ra cờ tính năng, không trả nguyên văn.
const toPublic = ({ policy, ...h }: HotelDoc) => ({ ...h, features: hotelFeatures({ amenities: h.amenities, policy }) });

// Công khai: danh sách khách sạn theo sân bay, phân trang kiểu keyset (ổn định khi dữ liệu thay đổi).
// Bản đầy đủ (lọc giá, tồn phòng theo giờ) = FR-SRC-01/02.
hotelsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { airport, limit, cursor, from, to } = req.valid.query as z.infer<typeof listQuery>;
  const window = windowOf({ from, to });
  const items = (
    await db.query<HotelDoc>(
      `SELECT ${PUBLIC_COLS} FROM hotels WHERE status = 'ACTIVE' AND airports @> $1::jsonb AND seq > $2 ORDER BY seq LIMIT ${limit + 1}`,
      [JSON.stringify([{ iata: airport }]), cursor ?? 0],
    )
  ).rows;
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const rooms = await publicRooms(page.map((h) => h.id), window);
  res.json({ items: page.map((h) => ({ ...toPublic(h), rooms: rooms.get(h.id) ?? [] })), nextCursor: hasMore ? page[page.length - 1]?.seq : null, window });
});

hotelsRouter.get('/:id', validate({ params: idParams, query: idQuery }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const window = windowOf(req.valid.query as z.infer<typeof idQuery>);
  const hotel = (await db.query<HotelDoc>(`SELECT ${PUBLIC_COLS} FROM hotels WHERE id = $1 AND status = 'ACTIVE'`, [id])).rows[0];
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const roomTypes = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE hotel_id = $1 AND active', [hotel.id])).rows;
  res.json({ hotel: toPublic(hotel), roomTypes, rooms: (await publicRooms([hotel.id], window)).get(hotel.id) ?? [], window });
});
