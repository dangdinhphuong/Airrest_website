import { z } from 'zod';
import { lookupBody } from './bookings';

const direction = z.enum(['TO_HOTEL', 'TO_AIRPORT']);
export const shuttleQuoteBody = lookupBody.extend({
  direction,
  airport: z.string().regex(/^[A-Za-z]{3}$/, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase()),
  pickupAt: z.coerce.date(),
});
export type ShuttleQuoteBody = z.infer<typeof shuttleQuoteBody>;
export const createShuttleBody = shuttleQuoteBody.extend({ location: z.string().trim().max(200).optional(), note: z.string().trim().max(300).optional() });
export type CreateShuttleBody = z.infer<typeof createShuttleBody>;
export const shuttleCancelBody = lookupBody;

export const shuttleListQuery = z.object({
  status: z.enum(['REQUESTED', 'ASSIGNED', 'DONE', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).optional(),
});
export type ShuttleListQuery = z.infer<typeof shuttleListQuery>;
export const assignShuttleBody = z.object({ driverName: z.string().trim().min(2).max(100), driverPhone: lookupBody.shape.phone });
export type AssignShuttleBody = z.infer<typeof assignShuttleBody>;
export const shuttleStaffCancelBody = z.object({ note: z.string().trim().min(3).max(300) });
