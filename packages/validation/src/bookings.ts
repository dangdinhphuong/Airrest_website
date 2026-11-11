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

export const createBookingBody = z
  .object({
    hotelId: uuid,
    roomTypeId: uuid,
    qty: z.number().int().min(1).max(5).default(1),
    paymentMethod: z.enum(['AT_HOTEL', 'VNPAY']).default('AT_HOTEL'),
    from: z.coerce.date(),
    to: z.coerce.date(),
    guest: z.object({
      fullName: z.string().trim().min(2).max(100),
      phone,
      email: z.string().email().max(200).optional(),
    }),
  })
  .refine((b) => b.to > b.from, { message: '`to` phải sau `from`', path: ['to'] })
  .refine((b) => b.from.getTime() > Date.now() - 5 * 60_000, { message: '`from` đã ở quá khứ', path: ['from'] });

export type CreateBookingBody = z.infer<typeof createBookingBody>;

export const lookupBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^AR-[0-9A-Z]{8}$/, 'Mã đặt phòng không hợp lệ'),
  phone,
});
export type LookupBody = z.infer<typeof lookupBody>;

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
