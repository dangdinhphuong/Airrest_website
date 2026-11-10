import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { z } from 'zod';
import { col } from '../../db/collections';
import { AppError } from '../../lib/errors';
import { validate } from '../../middleware/validate';

export const hotelsRouter = Router();

const listQuery = z.object({
  airport: z.string().length(3).transform((s) => s.toUpperCase()),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().regex(/^[a-f\d]{24}$/i).optional(), // _id của phần tử cuối trang trước
});

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });

// Chỉ trả trường công khai. Không bao giờ trả payoutAccount, contact nội bộ, incidentScore.
const publicProjection = { name: 1, code: 1, location: 1, airports: 1, amenities: 1, rating: 1 } as const;

// Công khai: danh sách khách sạn theo sân bay, phân trang kiểu keyset (ổn định khi dữ liệu thay đổi).
// Bản đầy đủ (lọc giá, tồn phòng theo giờ) = FR-SRC-01/02: xem docs/mongodb mục 9.1.
hotelsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { airport, limit, cursor } = req.valid.query as z.infer<typeof listQuery>;
  const items = await col
    .hotels()
    .find(
      { status: 'ACTIVE', 'airports.iata': airport, ...(cursor ? { _id: { $gt: new ObjectId(cursor) } } : {}) },
      { projection: publicProjection },
    )
    .sort({ _id: 1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  res.json({ items: page, nextCursor: hasMore ? page[page.length - 1]?._id : null });
});

hotelsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const hotel = await col.hotels().findOne({ _id: new ObjectId(id), status: 'ACTIVE' }, { projection: publicProjection });
  if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const roomTypes = await col.roomTypes().find({ hotelId: hotel._id, active: true }).toArray();
  res.json({ hotel, roomTypes });
});
