import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MEDIA_FOLDERS, presignImageUpload, type ImageType, type MediaFolder } from '../../../lib/storage';
import { actorOf, writeAudit } from '../../../services/audit';
import { getHotelProfile, HOTEL_IMAGE_KEY_RE, MAX_HOTEL_IMAGES, updateHotelProfile, type HotelProfilePatch } from '../../../services/hotels/profile';
import { authenticate, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Hồ sơ + ảnh do chính khách sạn quản lý (khóa theo hotelId trong token). Quyền dùng chung với quản lý phòng: room:manage.
export const hotelProfileRouter = Router();
hotelProfileRouter.use(authenticate);
const need = requirePermission(PERM.ROOM_MANAGE);

const patchBody = z
  .object({
    description: z.string().trim().max(5000),
    phone: z.string().trim().min(8).max(20),
    receptionCloseHour: z.number().int().min(0).max(26).nullable(),
    cancellationTemplate: z.enum(['FLEXIBLE', 'STANDARD', 'NON_REFUNDABLE']),
    amenities: z.array(z.string().trim().min(1).max(40)).max(40),
    images: z.array(z.string().regex(HOTEL_IMAGE_KEY_RE, 'Khóa ảnh không hợp lệ')).max(MAX_HOTEL_IMAGES),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');

hotelProfileRouter.get('/', need, async (req, res) => {
  res.json({ profile: await getHotelProfile(req.auth as AuthContext) });
});

hotelProfileRouter.patch('/', need, validate({ body: patchBody }), async (req, res) => {
  res.json({ profile: await updateHotelProfile(req.auth as AuthContext, req.valid.body as HotelProfilePatch, String(req.id)) });
});

export const hotelMediaRouter = Router();
hotelMediaRouter.use(authenticate);

const uploadBody = z.object({
  folder: z.enum(MEDIA_FOLDERS).default('hotels'),
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]]),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});

hotelMediaRouter.post('/upload-url', need, validate({ body: uploadBody }), async (req, res) => {
  const b = req.valid.body as z.infer<typeof uploadBody>;
  const out = await presignImageUpload(b.folder as MediaFolder, b.contentType);
  await writeAudit({ actor: actorOf(req.auth as AuthContext), action: 'MEDIA.UPLOAD_URL', entity: { type: 'media', id: out.key }, hotelId: (req.auth as AuthContext).hotelId, after: { size: b.size, contentType: b.contentType }, requestId: String(req.id) });
  res.status(201).json(out);
});
