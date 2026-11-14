import { z } from 'zod';
import { lookupBody } from './bookings';

const direction = z.enum(['TO_HOTEL', 'TO_AIRPORT']);
export const shuttleQuoteBody = lookupBody.extend({
  direction,
  airport: z.string().regex(/^[A-Za-z]{3}$/, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase()),
  pickupAt: z.coerce.date(),
  passengers: z.number().int().min(1).max(30).optional(), // số khách đi xe; bỏ trống = `guests` của đơn, không được vượt `guests`
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

// "Gọi xe ngay": luôn chiều TO_AIRPORT, giờ đón = bây giờ + SHUTTLE_CALL_NOW_MIN; sân bay mặc định = sân bay đầu tiên của khách sạn.
export const callNowBody = lookupBody.extend({
  airport: z.string().regex(/^[A-Za-z]{3}$/, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase()).optional(),
  passengers: z.number().int().min(1).max(30).optional(), // bỏ trống = `guests` của đơn
  location: z.string().trim().max(200).optional(),
  note: z.string().trim().max(300).optional(),
});
export type CallNowBody = z.infer<typeof callNowBody>;

// ---- Chuyến xe (khách sạn / tài xế) ----
const TRIP_STATUS = z.enum(['OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ONBOARD', 'DROPPED_OFF', 'CANCELLED', 'REJECTED', 'NEEDS_EXTERNAL']);
export const boardQuery = z.object({
  status: z.enum(['REQUESTED', 'ASSIGNED', 'DONE', 'CANCELLED']).optional(), // mặc định REQUESTED + ASSIGNED
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type BoardQuery = z.infer<typeof boardQuery>;
export const driverTripsQuery = z.object({ status: TRIP_STATUS.optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }); // mặc định: các chuyến đang hoạt động
export type DriverTripsQuery = z.infer<typeof driverTripsQuery>;
export const rejectTripBody = z.object({ reason: z.string().trim().max(300).optional() });
export const reassignTripBody = z.object({ vehicleId: z.string().uuid('Mã không hợp lệ') });
export const tripCancelBody = z.object({ note: z.string().trim().min(3).max(300) });
// shareUrl chỉ giới hạn độ dài thô ở đây; luật bảo mật (https, tên miền cho phép...) ở services/shuttle/externalLink.ts -> 422 EXTERNAL_LINK_NOT_ALLOWED.
export const externalTripBody = z.object({
  provider: z.enum(['GRAB', 'XANHSM', 'OTHER']),
  shareUrl: z.string().trim().min(1).max(2000),
  driverName: z.string().trim().min(2).max(100).optional(),
  plate: z.string().trim().min(2).max(20).optional(),
  phone: lookupBody.shape.phone.optional(),
  etaAt: z.coerce.date().optional(),
});
export type ExternalTripBody = z.infer<typeof externalTripBody>;
export const eventsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.coerce.number().int().min(0).optional() });
export type EventsQuery = z.infer<typeof eventsQuery>;

// Báo giá TRƯỚC khi có đơn (công khai). `pickupAt` tùy chọn: phụ thu đêm phụ thuộc giờ đón, thiếu thì tính giá ban ngày. `passengers`/`guests` chỉ để echo (giá không phụ thuộc số người).
export const hotelShuttleQuoteBody = z.object({
  legs: z
    .array(
      z.object({
        direction,
        airport: z.string().regex(/^[A-Za-z]{3}$/, 'Mã sân bay gồm 3 chữ cái').transform((s) => s.toUpperCase()).optional(),
        pickupAt: z.string().datetime({ offset: true }).transform((s) => new Date(s)).optional(),
      }),
    )
    .min(1)
    .max(2),
  passengers: z.number().int().min(1).max(30).optional(),
  guests: z.number().int().min(1).max(30).optional(),
}).refine((s) => new Set(s.legs.map((l) => l.direction)).size === s.legs.length, { message: 'Mỗi chiều chỉ được chọn một lần', path: ['legs'] });
export type HotelShuttleQuoteBody = z.infer<typeof hotelShuttleQuoteBody>;
