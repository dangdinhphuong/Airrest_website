import { z } from 'zod';
import { lookupBody } from './bookings';

// Khóa ảnh tài xế do server cấp ở POST /v1/hotel/media/upload-url (folder 'drivers'): drivers/<năm>/<uuid>.<jpg|png|webp>.
export const DRIVER_PHOTO_KEY_RE = /^drivers\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const photoKey = z.string().regex(DRIVER_PHOTO_KEY_RE, 'Khóa ảnh không hợp lệ');
const uuid = z.string().uuid('Mã không hợp lệ');
const plate = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/\s+/g, ' '))
  .pipe(z.string().regex(/^[0-9A-Z][0-9A-Z.\- ]{2,12}[0-9A-Z]$/, 'Biển số không hợp lệ'));
const seats = z.number().int().min(1).max(50);
const model = z.string().trim().max(100);
const nonEmpty = (b: object) => Object.keys(b).length > 0;

export const vehicleCreateBody = z.object({ plate, seats, model: model.optional(), active: z.boolean().default(true), driverId: uuid.optional() }).strict();
export type VehicleCreateBody = z.infer<typeof vehicleCreateBody>;
export const vehiclePatchBody = z.object({ plate, seats, model: model.nullable(), active: z.boolean(), driverId: uuid.nullable() }).partial().strict().refine(nonEmpty, 'Không có trường nào để cập nhật');
export type VehiclePatchBody = z.infer<typeof vehiclePatchBody>;

const password = z.string().min(12, 'Mật khẩu tối thiểu 12 ký tự').max(200);
export const driverCreateBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    password,
    fullName: z.string().trim().min(2).max(100),
    phone: lookupBody.shape.phone,
    photoKey: photoKey.optional(),
    vehicleId: uuid.optional(),
  })
  .strict();
export type DriverCreateBody = z.infer<typeof driverCreateBody>;
export const driverPatchBody = z
  .object({ fullName: z.string().trim().min(2).max(100), phone: lookupBody.shape.phone, photoKey: photoKey.nullable(), active: z.boolean(), vehicleId: uuid.nullable(), password })
  .partial()
  .strict()
  .refine(nonEmpty, 'Không có trường nào để cập nhật');
export type DriverPatchBody = z.infer<typeof driverPatchBody>;
export const accountIdParams = z.object({ id: uuid });
