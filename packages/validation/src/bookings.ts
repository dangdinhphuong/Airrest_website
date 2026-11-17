import { z } from 'zod';
import { toE164VN } from '@airrest/utils';

const uuid = z.string().uuid('Mã không hợp lệ');
const phone = z
  .string()
  .transform((s, ctx) => {
    const p = toE164VN(s);
    if (!p) ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' });
    return p ?? '';
  });

const airportCode = z.string().regex(/^[A-Za-z]{3}$/, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase());
const direction = z.enum(['TO_HOTEL', 'TO_AIRPORT']);

// Xe đưa đón đặt cùng đơn: chỉ chiều/giờ/điểm đón. Giá và số khách đi xe (= `guests` của đơn) do server quyết định; `strict` để client gửi `passengers`/giá bị 422.
export const bookingShuttleBody = z
  .object({
    legs: z
      .array(
        z
          .object({
            direction,
            pickupAt: z.string().datetime({ offset: true, message: 'pickupAt phải là ISO 8601 có múi giờ' }).transform((s) => new Date(s)),
            airport: airportCode.optional(),
            location: z.string().trim().max(200).optional(),
            note: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict()
  .refine((s) => new Set(s.legs.map((l) => l.direction)).size === s.legs.length, { message: 'Mỗi chiều chỉ được chọn một lần', path: ['legs'] });

// Dòng phòng của đơn: 1..10 dòng, mỗi (loại phòng, kind) một dòng. Input cũ `roomTypeId` + `qty` vẫn nhận (quy về một dòng theo đêm); gửi lẫn cả hai kiểu -> 422.
// kind mặc định NIGHT. Dòng HOURLY (nhà nghỉ) cần `startsAt` (ISO có múi giờ) + `hours`; ràng buộc theo cấu hình loại phòng kiểm ở server.
const roomLine = z
  .object({
    roomTypeId: uuid,
    qty: z.number().int().min(1).max(5).default(1),
    kind: z.enum(['NIGHT', 'HOURLY']).default('NIGHT'),
    ratePlan: z.enum(['STANDARD', 'NON_REFUNDABLE']).default('STANDARD'), // NON_REFUNDABLE: rẻ hơn, hủy mất tiền theo gói không hoàn; chỉ dòng theo đêm
    startsAt: z.string().datetime({ offset: true, message: 'startsAt phải là ISO 8601 có múi giờ' }).transform((s) => new Date(s)).optional(),
    hours: z.number().int().min(1).max(24).optional(),
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.kind === 'HOURLY') {
      if (l.ratePlan !== 'STANDARD') ctx.addIssue({ code: 'custom', message: 'Dòng theo giờ không có mức không hoàn hủy', path: ['ratePlan'] });
      if (!l.startsAt) ctx.addIssue({ code: 'custom', message: 'Dòng theo giờ cần `startsAt`', path: ['startsAt'] });
      if (l.hours === undefined) ctx.addIssue({ code: 'custom', message: 'Dòng theo giờ cần `hours`', path: ['hours'] });
    } else if (l.startsAt || l.hours !== undefined) ctx.addIssue({ code: 'custom', message: '`startsAt`/`hours` chỉ dùng cho dòng theo giờ (kind = HOURLY)', path: ['kind'] });
  });
const roomsFields = { rooms: z.array(roomLine).min(1).max(10).optional(), roomTypeId: uuid.optional(), qty: z.number().int().min(1).max(5).optional() };
type RoomLineIn = { roomTypeId: string; kind?: 'NIGHT' | 'HOURLY'; ratePlan?: 'STANDARD' | 'NON_REFUNDABLE' };
const checkRooms = (b: { rooms?: RoomLineIn[]; roomTypeId?: string; qty?: number }, ctx: z.RefinementCtx) => {
  if (b.rooms && (b.roomTypeId !== undefined || b.qty !== undefined)) ctx.addIssue({ code: 'custom', message: 'Dùng `rooms` hoặc `roomTypeId` + `qty`, không gửi cả hai', path: ['rooms'] });
  else if (!b.rooms && !b.roomTypeId) ctx.addIssue({ code: 'custom', message: 'Thiếu `rooms` (hoặc `roomTypeId`)', path: ['rooms'] });
  else if (b.rooms && new Set(b.rooms.map((r) => `${r.roomTypeId}:${r.kind}`)).size !== b.rooms.length) ctx.addIssue({ code: 'custom', message: 'roomTypeId không được trùng giữa các dòng (cùng kind)', path: ['rooms'] });
};
// Một đơn một chính sách hủy: các dòng theo đêm phải cùng mức giá (không trộn Linh hoạt và Không hoàn hủy).
const checkPlans = (b: { rooms?: RoomLineIn[] }, ctx: z.RefinementCtx) => {
  const plans = new Set((b.rooms ?? []).filter((r) => r.kind !== 'HOURLY').map((r) => r.ratePlan ?? 'STANDARD'));
  if (plans.size > 1) ctx.addIssue({ code: 'custom', message: 'Một đơn chỉ dùng một mức giá: không trộn Linh hoạt với Không hoàn hủy', path: ['rooms'] });
};
const allHourly = (b: { rooms?: RoomLineIn[] }) => !!b.rooms && b.rooms.every((r) => r.kind === 'HOURLY');
// Đơn có dòng theo đêm: from/to bắt buộc. Đơn toàn giờ: cửa sổ do server suy ra từ các dòng (from/to gửi lên bị bỏ qua).
const checkWindow = (b: { rooms?: RoomLineIn[]; from?: Date; to?: Date }, ctx: z.RefinementCtx) => {
  if (allHourly(b)) return;
  if (!b.from) ctx.addIssue({ code: 'custom', message: 'Thiếu `from`', path: ['from'] });
  if (!b.to) ctx.addIssue({ code: 'custom', message: 'Thiếu `to`', path: ['to'] });
  else if (b.from && b.to <= b.from) ctx.addIssue({ code: 'custom', message: '`to` phải sau `from`', path: ['to'] });
};
type LineOut = { roomTypeId: string; qty: number; kind: 'NIGHT' | 'HOURLY'; ratePlan?: 'STANDARD' | 'NON_REFUNDABLE'; startsAt?: Date; hours?: number };
const finalize = <T extends { rooms?: Array<Omit<LineOut, 'qty'> & { qty?: number }>; roomTypeId?: string; qty?: number; from?: Date; to?: Date }>({ rooms, roomTypeId, qty, from, to, ...rest }: T) => {
  const lines: LineOut[] = rooms ? rooms.map((r) => ({ ...r, qty: r.qty ?? 1 })) : [{ roomTypeId: roomTypeId!, qty: qty ?? 1, kind: 'NIGHT', ratePlan: 'STANDARD' }];
  if (lines.every((l) => l.kind === 'HOURLY')) {
    from = new Date(Math.min(...lines.map((l) => l.startsAt!.getTime())));
    to = new Date(Math.max(...lines.map((l) => l.startsAt!.getTime() + l.hours! * 3600_000)));
  }
  return { ...rest, rooms: lines, from: from as Date, to: to as Date };
};

export const createBookingBody = z
  .object({
    hotelId: uuid,
    ...roomsFields,
    guests: z.number().int().min(1).max(30).default(1), // số người ở; kiểm sức chứa loại phòng × qty ở server
    children: z.number().int().min(0).max(30).default(0), // trẻ em nằm TRONG `guests` (guests = người lớn + trẻ em); không dùng riêng cho sức chứa/xe
    shuttle: bookingShuttleBody.optional(),
    paymentMethod: z.enum(['AT_HOTEL', 'VNPAY', 'MOMO', 'SEPAY']).default('AT_HOTEL'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    guest: z.object({
      fullName: z.string().trim().min(2).max(100),
      phone,
      email: z.string().email().max(200).optional(),
    }),
  })
  .refine((b) => b.children <= b.guests, { message: '`children` không được vượt `guests` (guests đã gồm trẻ em)', path: ['children'] })
  .superRefine(checkRooms)
  .superRefine(checkPlans)
  .superRefine(checkWindow)
  .refine((b) => allHourly(b) || !b.from || b.from.getTime() > Date.now() - 5 * 60_000, { message: '`from` đã ở quá khứ', path: ['from'] })
  .transform(finalize);

export type CreateBookingBody = z.infer<typeof createBookingBody>;

// Báo giá TRƯỚC khi gửi yêu cầu (cùng cách tính với tạo đơn): không cần thông tin khách, không giữ phòng.
export const bookingQuoteBody = z
  .object({
    hotelId: uuid,
    ...roomsFields,
    shuttle: bookingShuttleBody.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine(checkRooms)
  .superRefine(checkPlans)
  .superRefine(checkWindow)
  .transform(finalize);
export type BookingQuoteBody = z.infer<typeof bookingQuoteBody>;

export const lookupBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^AR-[0-9A-Z]{8}$/, 'Mã đặt phòng không hợp lệ'),
  phone,
});
export type LookupBody = z.infer<typeof lookupBody>;

// Tra cứu đơn chỉ bằng mã (khách chưa đăng nhập): SĐT tùy chọn; có SĐT mới được thông tin xe/tài xế và thao tác (thanh toán, hủy, đổi).
export const lookupByCodeBody = lookupBody.extend({ phone: lookupBody.shape.phone.optional() });
export type LookupByCodeBody = z.infer<typeof lookupByCodeBody>;

export const groupLookupBody = z.object({
  groupCode: z.string().trim().toUpperCase().regex(/^NH-[0-9A-Z]{8}$/, 'Mã nhóm không hợp lệ'),
  phone,
});
export type GroupLookupBody = z.infer<typeof groupLookupBody>;

export const rejectBookingBody = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectBookingBody = z.infer<typeof rejectBookingBody>;

export const idParams = z.object({ id: uuid });

const BOOKING_STATUS = z.enum(['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW']);
const listBase = z.object({
  status: BOOKING_STATUS.optional(),
  code: z.string().trim().toUpperCase().min(2).max(12).optional(), // tiền tố mã đặt phòng
  from: z.coerce.date().optional(), // lọc theo ngày nhận phòng: from <= stay_from < to
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).optional(), // seq của phần tử cuối trang trước
});
const validRange = (q: { from?: Date; to?: Date }) => !q.from || !q.to || q.to > q.from;
const rangeMsg = { message: '`to` phải sau `from`', path: ['to'] };

export const staffListQuery = listBase.refine(validRange, rangeMsg);
export const adminBookingListQuery = listBase.extend({ hotelId: uuid.optional() }).refine(validRange, rangeMsg);
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuery>;
export type StaffListQuery = z.infer<typeof staffListQuery>;
