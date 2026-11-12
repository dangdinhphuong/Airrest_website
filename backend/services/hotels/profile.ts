import { db, json, withTransaction } from '../../database/pg';
import type { HotelDoc } from '../../database/types';
import { AppError } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { publicUrl } from '../../lib/storage';
import { actorOf, writeAudit } from '../audit';

export const HOTEL_IMAGE_KEY_RE = /^(hotels|rooms)\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const MAX_HOTEL_IMAGES = 10;

/** Khóa R2 -> [{key, url}] (url bỏ trống khi chưa cấu hình R2_PUBLIC_BASE_URL). Rỗng nếu chưa có ảnh. */
export const imageViews = (keys: string[] | undefined | null): Array<{ key: string; url: string | null }> => (keys ?? []).map((key) => ({ key, url: publicUrl(key) ?? null }));

export interface HotelProfilePatch {
  description?: string;
  phone?: string;
  receptionCloseHour?: number | null;
  cancellationTemplate?: 'FLEXIBLE' | 'STANDARD' | 'NON_REFUNDABLE';
  amenities?: string[];
  images?: string[];
}

// Chỉ các trường an toàn; KHÔNG gồm: tài khoản nhận tiền, trạng thái, mã, sân bay, hoa hồng, duyệt tay.
const view = (h: HotelDoc) => ({
  id: h.id, code: h.code, name: h.name, status: h.status,
  description: h.description ?? null,
  address: h.address ?? null,
  contact: { phone: h.contact?.phone ?? null, email: h.contact?.email ?? null },
  airports: h.airports,
  amenities: h.amenities,
  policy: { cancellationTemplate: h.policy.cancellationTemplate, receptionCloseHour: h.policy.receptionCloseHour ?? null, cleaningBufferMin: h.policy.cleaningBufferMin, noShowGraceMin: h.policy.noShowGraceMin ?? null },
  images: imageViews(h.images),
  updatedAt: h.updatedAt,
});

const hotelIdOf = (auth: AuthContext): string => {
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return auth.hotelId;
};

export async function getHotelProfile(auth: AuthContext) {
  const h = (await db.query<HotelDoc>('SELECT * FROM hotels WHERE id = $1', [hotelIdOf(auth)])).rows[0];
  if (!h) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  return view(h);
}

export async function updateHotelProfile(auth: AuthContext, patch: HotelProfilePatch, requestId?: string) {
  const id = hotelIdOf(auth);
  return withTransaction(async (tx) => {
    const before = (await tx.query<HotelDoc>('SELECT * FROM hotels WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!before) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    const policy = { ...before.policy };
    if (patch.cancellationTemplate) policy.cancellationTemplate = patch.cancellationTemplate;
    if (patch.receptionCloseHour !== undefined) {
      if (patch.receptionCloseHour === null) delete policy.receptionCloseHour;
      else policy.receptionCloseHour = patch.receptionCloseHour;
    }
    const contact = patch.phone ? { ...(before.contact ?? {}), phone: patch.phone } : before.contact;
    const next = (
      await tx.query<HotelDoc>(
        `UPDATE hotels SET description = $2, contact = $3::jsonb, policy = $4::jsonb, amenities = $5, images = $6::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, patch.description ?? before.description ?? null, contact ? json(contact) : null, json(policy), patch.amenities ?? before.amenities, json(patch.images ?? before.images ?? [])],
      )
    ).rows[0]!;
    const keys = Object.keys(patch);
    await writeAudit(
      { actor: actorOf(auth), action: 'HOTEL.PROFILE.UPDATE', entity: { type: 'hotel', id }, hotelId: id, before: { fields: keys, description: before.description, phone: before.contact?.phone, policy: before.policy, amenities: before.amenities, images: before.images ?? [] }, after: { fields: keys, description: next.description, phone: next.contact?.phone, policy: next.policy, amenities: next.amenities, images: next.images ?? [] }, requestId },
      tx,
    );
    return view(next);
  });
}
