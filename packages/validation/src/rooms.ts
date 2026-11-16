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

// Cấu hình đặt theo giờ của loại phòng (lưu trong room_types.pricing.hourly). Tắt (`enabled:false`) thì không cần giá.
const hour24 = z.number().int().min(0).max(24);
export const hourlyConfigBody = z
  .object({
    enabled: z.boolean(),
    firstHourVnd: z.number().int().min(1000).max(100_000_000).optional(),
    nextHourVnd: z.number().int().min(0).max(100_000_000).optional(),
    minHours: z.number().int().min(1).max(24).default(1),
    maxHours: z.number().int().min(1).max(24).default(12),
    cleaningMin: z.number().int().min(0).max(240).default(30),
    openFromHour: hour24.optional(),
    openToHour: hour24.optional(),
  })
  .strict()
  .refine((h) => !h.enabled || (h.firstHourVnd !== undefined && h.nextHourVnd !== undefined), { message: 'Bật đặt theo giờ cần giá giờ đầu và giá giờ tiếp theo', path: ['firstHourVnd'] })
  .refine((h) => h.minHours <= h.maxHours, { message: 'Số giờ tối thiểu không được lớn hơn tối đa', path: ['minHours'] })
  .refine((h) => h.openFromHour === undefined || h.openToHour === undefined || h.openFromHour < h.openToHour, { message: 'Giờ mở bán phải trước giờ đóng bán', path: ['openFromHour'] });
export type HourlyConfigBody = z.infer<typeof hourlyConfigBody>;

// Tiện nghi phòng: danh sách mã hằng số (nhãn hiển thị do giao diện giữ).
export const ROOM_AMENITY_CODES = ['WIFI', 'AIR_CONDITIONER', 'BATHTUB', 'SHOWER', 'BALCONY', 'TV', 'MINIBAR', 'SAFE', 'KETTLE', 'HAIR_DRYER', 'DESK', 'FRIDGE', 'WARDROBE', 'BREAKFAST'] as const;
export const MAX_ROOM_TYPE_IMAGES = 10;
export const MAX_ROOM_IMAGES = 5;
// Khóa ảnh do server cấp (rooms/<năm>/<uuid>.<đuôi>), cùng dạng với HOTEL_IMAGE_KEY_RE nhưng chỉ nhận thư mục rooms.
export const ROOM_IMAGE_KEY_RE = /^rooms\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const amenityList = z.array(z.enum(ROOM_AMENITY_CODES)).max(ROOM_AMENITY_CODES.length).refine((a) => new Set(a).size === a.length, 'Tiện nghi bị trùng');
const imageKeys = (max: number) =>
  z.array(z.string().regex(ROOM_IMAGE_KEY_RE, 'Khóa ảnh không hợp lệ')).max(max, `Tối đa ${max} ảnh`).refine((a) => new Set(a).size === a.length, 'Ảnh bị trùng');
const plain = (max: number) => z.string().trim().max(max);

// Trường mô tả thêm của loại phòng (dùng chung create/patch). Chỉ lưu text thuần, giao diện tự escape khi hiển thị.
const roomTypeExtra = {
  description: plain(2000),
  view: plain(100),
  amenities: amenityList,
  smoking: z.boolean(),
  maxAdults: z.number().int().min(1).max(10),
  maxChildren: z.number().int().min(0).max(10),
  images: imageKeys(MAX_ROOM_TYPE_IMAGES),
};

export const createRoomTypeBody = z.object({
  code: z.string().regex(/^[A-Z0-9]{2,8}$/, 'Mã loại phòng gồm 2-8 chữ in hoa hoặc số'),
  name: z.string().trim().min(2).max(100),
  capacity: z.number().int().min(1).max(10),
  beds: z.number().int().min(1).max(10),
  areaM2: z.number().int().min(0).max(500).default(0),
  totalRooms: z.number().int().min(0).max(500),
  baseNightVnd: z.number().int().min(1000).max(100_000_000),
  hourly: hourlyConfigBody.optional(),
  nonRefundablePct: z.number().int().min(1).max(50).optional(), // % giảm của mức "Không hoàn hủy"; bỏ trống = không bán mức này
  description: roomTypeExtra.description.optional(),
  view: roomTypeExtra.view.optional(),
  amenities: roomTypeExtra.amenities.optional(),
  smoking: roomTypeExtra.smoking.optional(),
  maxAdults: roomTypeExtra.maxAdults.optional(),
  maxChildren: roomTypeExtra.maxChildren.optional(),
  images: roomTypeExtra.images.optional(),
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
    hourly: hourlyConfigBody,
    nonRefundablePct: z.number().int().min(1).max(50).nullable(), // null = ngừng bán mức Không hoàn hủy
    ...roomTypeExtra,
    // null = xóa giá trị
    description: roomTypeExtra.description.nullable(),
    view: roomTypeExtra.view.nullable(),
    maxAdults: roomTypeExtra.maxAdults.nullable(),
    maxChildren: roomTypeExtra.maxChildren.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
export type PatchRoomTypeBody = z.infer<typeof patchRoomTypeBody>;

// ---------- Tầng + phòng riêng lẻ ----------
export const floorBody = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.number().int().min(-5).max(200),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  note: plain(500).optional(),
});
export type FloorBody = z.infer<typeof floorBody>;
export const patchFloorBody = z
  .object({ name: floorBody.shape.name, level: floorBody.shape.level, sortOrder: z.number().int().min(0).max(1000), note: plain(500).nullable() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
export type PatchFloorBody = z.infer<typeof patchFloorBody>;

const roomNumber = z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Số phòng gồm 1-10 chữ, số hoặc dấu gạch ngang');
const roomExtra = {
  note: plain(500),
  view: plain(100),
  smoking: z.boolean(),
  maxAdults: z.number().int().min(1).max(10),
  maxChildren: z.number().int().min(0).max(10),
  amenitiesExtra: amenityList,
  images: imageKeys(MAX_ROOM_IMAGES),
};
const roomStatus = z.enum(['ACTIVE', 'INACTIVE']);
export const createRoomBody = z.object({
  floorId: uuid,
  roomTypeId: uuid,
  number: roomNumber,
  status: roomStatus.default('ACTIVE'),
  note: roomExtra.note.optional(),
  view: roomExtra.view.optional(),
  smoking: roomExtra.smoking.optional(),
  maxAdults: roomExtra.maxAdults.optional(),
  maxChildren: roomExtra.maxChildren.optional(),
  amenitiesExtra: roomExtra.amenitiesExtra.default([]),
  images: roomExtra.images.default([]),
});
export type CreateRoomBody = z.infer<typeof createRoomBody>;
export const patchRoomBody = z
  .object({
    floorId: uuid,
    roomTypeId: uuid,
    number: roomNumber,
    status: roomStatus,
    note: roomExtra.note.nullable(),
    view: roomExtra.view.nullable(),
    smoking: roomExtra.smoking.nullable(),
    maxAdults: roomExtra.maxAdults.nullable(),
    maxChildren: roomExtra.maxChildren.nullable(),
    amenitiesExtra: roomExtra.amenitiesExtra,
    images: roomExtra.images,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
export type PatchRoomBody = z.infer<typeof patchRoomBody>;

// Thêm hàng loạt theo dải số: prefix + từ..đến (tối đa 100 phòng một lần). Tất cả hoặc không gì cả.
export const bulkRoomsBody = z
  .object({ floorId: uuid, roomTypeId: uuid, prefix: z.string().trim().regex(/^[A-Za-z0-9-]{0,6}$/, 'Tiền tố tối đa 6 ký tự').default(''), from: z.number().int().min(0).max(99999), to: z.number().int().min(0).max(99999), status: roomStatus.default('ACTIVE') })
  .refine((b) => b.to >= b.from, { message: 'Số cuối phải lớn hơn hoặc bằng số đầu', path: ['to'] })
  .refine((b) => b.to - b.from < 100, { message: 'Tối đa 100 phòng mỗi lần', path: ['to'] })
  .refine((b) => `${b.prefix}${b.to}`.length <= 10, { message: 'Số phòng tối đa 10 ký tự', path: ['to'] });
export type BulkRoomsBody = z.infer<typeof bulkRoomsBody>;

export const roomListQuery = hotelTargetQuery.extend({ floorId: uuid.optional(), roomTypeId: uuid.optional() });
export type RoomListQuery = z.infer<typeof roomListQuery>;

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
