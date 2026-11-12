import { z } from 'zod';
import { FLIGHT_CODE_RE } from '@airrest/shared-types';

export const flightCodeSchema = z.string().transform((s) => s.toUpperCase()).pipe(z.string().regex(FLIGHT_CODE_RE, 'Mã chuyến bay gồm 2 chữ cái + 1-4 chữ số'));
export const flightDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Ngày phải dạng YYYY-MM-DD');

export const updateFlightBodySchema = z.object({
  status: z.enum(['ONTIME', 'DELAYED', 'CANCELLED']),
  newDepartureAt: z.string().datetime({ offset: true }).nullable().optional(),
  cause: z.enum(['AIRLINE', 'FORCE', 'UNKNOWN']).optional(),
  reason: z.string().trim().min(3).max(200),
});
export type UpdateFlightBody = z.infer<typeof updateFlightBodySchema>;

const iata = z.string().trim().length(3, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/, 'Mã sân bay gồm 3 chữ cái'));

export const createFlightBodySchema = z.object({
  code: flightCodeSchema,
  airline: z.string().trim().min(2).max(100).default('Hãng mô phỏng'),
  origin: iata,
  dest: iata.nullable().optional(),
  scheduledDepartureAt: z.string().datetime({ offset: true }),
  distanceKm: z.number().int().min(0).max(20000).nullable().optional(),
  simScenario: z.enum(['approve', 'reject', 'hotelfull', 'noreply']).default('approve'),
  reason: z.string().trim().min(3).max(200),
});
export type CreateFlightBody = z.infer<typeof createFlightBodySchema>;
