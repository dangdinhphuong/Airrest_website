import { z } from 'zod';

const uuid = z.string().uuid('Mã không hợp lệ');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
  }, 'Ngày không tồn tại');

export const hotelTargetQuery = z.object({ hotelId: uuid.optional() });

export const roomTypeListQuery = hotelTargetQuery.extend({
  includeRetired: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const createRoomTypeBody = z.object({
  code: z.string().regex(/^[A-Z0-9]{2,8}$/, 'Mã loại phòng gồm 2-8 chữ in hoa hoặc số'),
  name: z.string().trim().min(2).max(100),
  capacity: z.number().int().min(1).max(10),
  beds: z.number().int().min(1).max(10),
  areaM2: z.number().int().min(0).max(500).default(0),
  totalRooms: z.number().int().min(0).max(500),
  baseNightVnd: z.number().int().min(1000).max(100_000_000),
});
export type CreateRoomTypeBody = z.infer<typeof createRoomTypeBody>;

// Không dùng .partial() trên schema có default: sẽ vô tình ghi đè areaM2 về 0 khi sửa.
export const patchRoomTypeBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    capacity: z.number().int().min(1).max(10),
    beds: z.number().int().min(1).max(10),
    areaM2: z.number().int().min(0).max(500),
    totalRooms: z.number().int().min(0).max(500),
    baseNightVnd: z.number().int().min(1000).max(100_000_000),
    active: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
export type PatchRoomTypeBody = z.infer<typeof patchRoomTypeBody>;

export const inventoryQuery = hotelTargetQuery
  .extend({ from: date, to: date })
  .refine((q) => q.to >= q.from, { message: '`to` phải từ `from` trở đi', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < 62, { message: 'Tối đa 62 ngày', path: ['to'] });
export type InventoryQuery = z.infer<typeof inventoryQuery>;

export const createBlockBody = z
  .object({
    roomTypeId: uuid,
    kind: z.enum(['LOCK', 'MAINTENANCE']),
    qty: z.number().int().min(1).max(500).optional(),
    from: z.coerce.date(),
    to: z.coerce.date(),
    reason: z.string().trim().min(3).max(200),
  })
  .refine((b) => b.to > b.from, { message: '`to` phải sau `from`', path: ['to'] });
export type CreateBlockBody = z.infer<typeof createBlockBody>;

export const blockListQuery = hotelTargetQuery.extend({
  roomTypeId: uuid.optional(),
  active: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).optional(),
});
export type BlockListQuery = z.infer<typeof blockListQuery>;
