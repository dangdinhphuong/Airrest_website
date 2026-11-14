import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../database/pg';
import type { HotelDoc, RoomTypeDoc } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { seqCursor, uuid } from '../../../lib/zod';
import { validate } from '../../middleware/validate';
import { hotelShuttleQuoteBody, type HotelShuttleQuoteBody } from '@airrest/validation';
import { quoteHotelShuttle } from '../../../services/shuttle/shuttle.service';
import { hotelFeatures, hourlySlots, publicRooms, searchHotels } from '../../../services/hotels/catalog';
import { imageViews } from '../../../services/hotels/profile';

export const hotelsRouter = Router();

const flag = z.enum(['true', 'false']).transform((v) => v === 'true').optional();
const SEARCH_KEYS = ['sort', 'guests', 'rooms', 'maxKm', 'priceUnder', 'minPrice', 'maxPrice', 'minRating', 'minReviews', 'shuttle', 'freeCancel', 'hourly', 'family', 'reception24'] as const;
const SEARCH_POOL = 200; // số khách sạn tối đa của một sân bay được đem lọc

const listQuery = z.object({
  airport: z.string().length(3).transform((s) => s.toUpperCase()).optional(), // bỏ trống = toàn hệ thống (luôn ở chế độ tìm kiếm)
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: seqCursor.optional(), // seq của phần tử cuối trang trước
  // Cửa sổ tính số phòng còn; mặc định từ bây giờ tới 24 giờ sau, tối đa 31 ngày.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Tìm kiếm có lọc/sắp xếp (tất cả tuỳ chọn; có bất kỳ tham số nào dưới đây thì bỏ phân trang cursor, trả kèm `total`).
  sort: z.enum(['distance', 'price', 'rating']).optional(),
  guests: z.coerce.number().int().min(1).max(30).optional(), // tổng số người (gồm trẻ em)
  rooms: z.coerce.number().int().min(1).max(5).optional(),
  maxKm: z.coerce.number().positive().optional(), // khoảng cách tối đa tới sân bay
  priceUnder: z.coerce.number().int().positive().optional(), // giá/đêm của loại phòng đại diện < giá trị này
  minPrice: z.coerce.number().int().min(0).optional(), // giá/đêm >= (VND)
  maxPrice: z.coerce.number().int().min(0).optional(), // giá/đêm <= (VND)
  minRating: z.coerce.number().min(0).max(10).optional(),
  minReviews: z.coerce.number().int().min(0).optional(), // số lượt đánh giá tối thiểu
  shuttle: flag, freeCancel: flag, hourly: flag, family: flag, reception24: flag,
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
const PUBLIC_COLS = 'id, seq, name, code, location, airports, amenities, rating, policy, address, description, images';

// `policy` chỉ để suy ra cờ tính năng, không trả nguyên văn.
const toPublic = ({ policy, ...h }: HotelDoc) => ({ ...h, images: imageViews(h.images), features: hotelFeatures({ amenities: h.amenities, policy }) });

// Công khai: danh sách khách sạn theo sân bay, phân trang kiểu keyset (ổn định khi dữ liệu thay đổi).
// Bản đầy đủ (lọc giá, tồn phòng theo giờ) = FR-SRC-01/02.
hotelsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const q = req.valid.query as z.infer<typeof listQuery>;
  const { airport, limit, cursor, from, to } = q;
  const window = windowOf({ from, to });
  if (!airport || SEARCH_KEYS.some((k) => q[k] !== undefined)) { // chế độ tìm kiếm: lọc + sắp xếp + cắt top `limit` ở backend
    // shortcut: không có airport thì pool là SEARCH_POOL khách sạn đầu theo seq, nâng lên lọc/sắp ở SQL khi hệ thống vượt SEARCH_POOL khách sạn.
    const pool = (await db.query<HotelDoc>(`SELECT ${PUBLIC_COLS} FROM hotels WHERE status = 'ACTIVE' AND ($1::jsonb IS NULL OR airports @> $1::jsonb) ORDER BY seq LIMIT ${SEARCH_POOL}`, [airport ? JSON.stringify([{ iata: airport }]) : null])).rows;
    const rooms = await publicRooms(pool.map((h) => h.id), window);
    const withRooms = pool.map((h) => ({ ...h, rooms: rooms.get(h.id) ?? [] }));
    const { items: found, total, priceRange } = searchHotels(withRooms, airport ?? '', { ...q, sort: q.sort ?? (airport ? 'distance' : 'rating'), rooms: q.rooms ?? 1, limit });
    res.json({ items: found.map(({ rooms: r, ...h }) => ({ ...toPublic(h), rooms: r })), nextCursor: null, total, priceRange, window });
    return;
  }
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

// Báo giá xe TRƯỚC khi có đơn (bước đặt phòng). Công khai, chỉ chịu giới hạn chung của /v1 (không strictRateLimit); không lộ dữ liệu nội bộ.
hotelsRouter.post('/:id/shuttle-quote', validate({ params: idParams, body: hotelShuttleQuoteBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  res.json(await quoteHotelShuttle(id, req.valid.body as HotelShuttleQuoteBody));
});

// Giờ vào còn trống của một loại phòng bật đặt theo giờ trong một ngày (giờ VN): mỗi 30 phút + mốc "Bây giờ", kèm lý do khi không đặt được. Chỉ đọc.
const slotsQuery = z.object({
  roomTypeId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Ngày không tồn tại'),
  hours: z.coerce.number().int().min(1).max(24),
  qty: z.coerce.number().int().min(1).max(5).default(1),
});
hotelsRouter.get('/:id/hourly-slots', validate({ params: idParams, query: slotsQuery }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  res.json(await hourlySlots(id, req.valid.query as z.infer<typeof slotsQuery>));
});
