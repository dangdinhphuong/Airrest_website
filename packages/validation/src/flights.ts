import { z } from 'zod';
import { FLIGHT_CODE_RE } from '@airrest/shared-types';

export const flightCodeSchema = z.string().transform((s) => s.toUpperCase()).pipe(z.string().regex(FLIGHT_CODE_RE, 'Mã chuyến bay gồm 2 chữ cái + 1-4 chữ số'));
export const flightDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Ngày không tồn tại');

export const updateFlightBodySchema = z.object({
  status: z.enum(['ONTIME', 'DELAYED', 'CANCELLED']),
  newDepartureAt: z.string().datetime({ offset: true }).nullable().optional(),
  cause: z.enum(['AIRLINE', 'FORCE', 'UNKNOWN']).optional(),
  reason: z.string().trim().min(3).max(200),
});
export type UpdateFlightBody = z.infer<typeof updateFlightBodySchema>;
