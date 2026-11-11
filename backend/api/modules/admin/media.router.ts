import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { actorOf, writeAudit } from '../../../services/audit';
import type { AuthContext } from '../../../lib/jwt';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MEDIA_FOLDERS, presignImageUpload, type ImageType, type MediaFolder } from '../../../lib/storage';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Ảnh khách sạn/phòng lên Cloudflare R2. Chưa có route cho tài khoản khách sạn tự tải (chỉ Admin có quyền quản lý khách sạn).
export const mediaRouter = Router();

const body = z.object({
  folder: z.enum(MEDIA_FOLDERS),
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]]),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});

mediaRouter.post('/media/upload-url', requirePermission(PERM.ADMIN_HOTEL_MANAGE), validate({ body }), async (req, res) => {
  const b = req.valid.body as z.infer<typeof body>;
  const out = await presignImageUpload(b.folder as MediaFolder, b.contentType);
  await writeAudit({ actor: actorOf(req.auth as AuthContext), action: 'MEDIA.UPLOAD_URL', entity: { type: 'media', id: out.key }, after: { size: b.size, contentType: b.contentType }, requestId: String(req.id) });
  res.status(201).json(out);
});
