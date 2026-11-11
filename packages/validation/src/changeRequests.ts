import { z } from 'zod';
import { lookupBody } from './bookings';

export const REASON_CODES = ['CHANGE_OF_PLAN', 'FLIGHT_CANCELLED', 'FLIGHT_RESCHEDULED', 'HEALTH', 'OTHER'] as const;
const common = { reasonCode: z.enum(REASON_CODES), reasonNote: z.string().trim().max(500).optional() };

export const createChangeRequestBody = z
  .discriminatedUnion('type', [
    lookupBody.extend({ type: z.literal('CANCEL'), ...common }),
    lookupBody.extend({ type: z.literal('CHANGE'), ...common, newFrom: z.coerce.date(), newTo: z.coerce.date() }),
  ])
  .superRefine((b, ctx) => {
    if (b.reasonCode === 'OTHER' && (b.reasonNote ?? '').length < 3) ctx.addIssue({ code: 'custom', path: ['reasonNote'], message: 'Lý do khác cần mô tả tối thiểu 3 ký tự' });
    if (b.type === 'CHANGE') {
      if (b.newTo <= b.newFrom) ctx.addIssue({ code: 'custom', path: ['newTo'], message: '`newTo` phải sau `newFrom`' });
      if (b.newFrom.getTime() <= Date.now() - 5 * 60_000) ctx.addIssue({ code: 'custom', path: ['newFrom'], message: '`newFrom` đã ở quá khứ' });
    }
  });
export type CreateChangeRequestBody = z.infer<typeof createChangeRequestBody>;

export const decideBody = z.object({ note: z.string().trim().max(500).optional() });
export const rejectRequestBody = z.object({ note: z.string().trim().min(3).max(500) });
export const staffRequestsQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().min(0).optional(),
});
export type StaffRequestsQuery = z.infer<typeof staffRequestsQuery>;
