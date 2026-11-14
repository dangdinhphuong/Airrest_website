import { z } from 'zod';
import { PNR_RE, paxCategoryFromAge } from '@airrest/shared-types';
import { lookupBody } from './bookings';

const uuid = z.string().uuid('Mã không hợp lệ');
const iata = z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/, 'Mã sân bay gồm 3 chữ cái'));

export const payerCreateBody = z
  .object({
    code: z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_-]{2,20}$/, 'Mã gồm 2-20 ký tự A-Z, 0-9, _ hoặc -')),
    name: z.string().trim().min(2).max(200),
    kind: z.enum(['AIRLINE', 'GROUND_HANDLER', 'AIRPORT']),
    contact: z.object({ name: z.string().trim().max(100).optional(), phone: lookupBody.shape.phone.optional(), email: z.string().trim().toLowerCase().email().max(200).optional() }).strict().optional(),
    sharedRoomPolicy: z.enum(['PRIVATE', 'SHARED']).default('PRIVATE'),
    allowUpgrade: z.boolean().default(false), // cho nhân viên quầy nâng hạng phòng (khách tự trả phần chênh)
  })
  .strict();
export type PayerCreateBody = z.infer<typeof payerCreateBody>;

export const payerStationCreateBody = z.object({ airportIata: iata, name: z.string().trim().min(2).max(200), active: z.boolean().default(true) }).strict();
export type PayerStationCreateBody = z.infer<typeof payerStationCreateBody>;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD');
export const payerHotelRateBody = z
  .object({
    hotelId: uuid,
    roomTypeId: uuid,
    nightRateVnd: z.number().int().min(0),
    hourlyRates: z.array(z.object({ hours: z.number().int().min(1).max(24), priceVnd: z.number().int().min(0) }).strict()).max(24).default([]),
    commissionPct: z.number().min(0).max(100).default(0),
    validFrom: date,
    validTo: date.nullable().optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((b) => !b.validTo || b.validTo >= b.validFrom, { message: 'validTo phải từ validFrom trở đi', path: ['validTo'] });
export type PayerHotelRateBody = z.infer<typeof payerHotelRateBody>;

// Một hành khách của chuyến delay; `category` luôn suy từ `age` (không nhận từ client).
export const delayPaxInput = z
  .object({
    pnr: z.string().trim().transform((s) => s.toUpperCase()).pipe(z.string().regex(PNR_RE, 'PNR gồm 5-8 ký tự A-Z, 0-9')),
    fullName: z.string().trim().min(2).max(100),
    age: z.number().int().min(0).max(120),
    isRepresentative: z.boolean().default(false),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    phone: lookupBody.shape.phone.optional(),
    specialNeeds: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  })
  .strict()
  .transform((p) => ({ ...p, category: paxCategoryFromAge(p.age) }));
export type DelayPaxInput = z.infer<typeof delayPaxInput>;
