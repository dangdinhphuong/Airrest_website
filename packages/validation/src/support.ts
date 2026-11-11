import { z } from 'zod';
import { lookupBody } from './bookings';

const phone = lookupBody.shape.phone;
const message = z.string().trim().min(3).max(2000);

export const createTicketBody = z.object({
  bookingCode: lookupBody.shape.code.optional(),
  phone,
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().max(200).optional(),
  subject: z.string().trim().min(3).max(150),
  message,
});
export type CreateTicketBody = z.infer<typeof createTicketBody>;

const ticketCode = z.string().trim().toUpperCase().regex(/^SP-[0-9A-Z]{8}$/, 'Mã ticket không hợp lệ');
export const ticketLookupBody = z.object({ code: ticketCode, phone });
export type TicketLookupBody = z.infer<typeof ticketLookupBody>;
export const ticketReplyBody = ticketLookupBody.extend({ message });
export type TicketReplyBody = z.infer<typeof ticketReplyBody>;

export const ticketListQuery = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  assignee: z.union([z.literal('me'), z.string().uuid()]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuery>;

export const ticketPatchBody = z
  .object({ status: z.enum(['IN_PROGRESS', 'RESOLVED']), assigneeId: z.string().uuid() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
export type TicketPatchBody = z.infer<typeof ticketPatchBody>;

export const staffMessageBody = z.object({ message: z.string().trim().min(1).max(2000), internal: z.boolean().default(false) });
export type StaffMessageBody = z.infer<typeof staffMessageBody>;
