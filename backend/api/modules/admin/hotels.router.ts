import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { airportByIata } from '../../../data/airports';
import { HOTEL_OWNER_ROLE } from '../../../config/roles';
import { PERM } from '../../../config/permissions';
import { db, json, withTransaction, type Db } from '../../../database/pg';
import type { HotelDoc, PayoutAccountData } from '../../../database/types';
import { actorOf, writeAudit } from '../../../services/audit';
import { encryptJson } from '../../../lib/crypto';
import { AppError, duplicateConstraint, isDuplicateKey } from '../../../lib/errors';
import { getHotelStats } from '../../../services/dashboard/hotelStats';
import { hashPassword } from '../../../lib/password';
import { getConfig } from '../../../services/systemConfig';
import { escapeLike, idParams, limitQuery, seqCursor } from '../../../lib/zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// FR-ADM-01 (đối tác), FR-ADM-15 (đổi tài khoản nhận tiền cần người duyệt thứ hai), FR-ADM-08 (thống kê khách sạn).
export const adminHotelsRouter = Router();
const read = requirePermission(PERM.ADMIN_HOTEL_READ);
const manage = requirePermission(PERM.ADMIN_HOTEL_MANAGE);
const approveSensitive = requirePermission(PERM.ADMIN_HOTEL_APPROVE_SENSITIVE);

const DAY_MS = 86_400_000;
const TEMPLATE = z.enum(['FLEXIBLE', 'STANDARD', 'NON_REFUNDABLE']);
const hotelStatus = z.enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'HIDDEN_DEBT']);

export const address = z.object({ line: z.string().min(1).max(200), ward: z.string().max(100).optional(), district: z.string().max(100).optional(), city: z.string().min(1).max(100), country: z.string().length(2).default('VN') });
export const location = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });
export const airports = z.array(z.object({ iata: z.string().length(3).transform((s) => s.toUpperCase()).refine((c) => !!airportByIata(c), 'Mã sân bay không có trong danh mục'), km: z.number().min(0).max(200), minutes: z.number().int().min(0).max(600) })).min(1).max(10);
export const contact = z.object({ phone: z.string().min(8).max(20), email: z.string().email().optional() });
export const policy = z.object({ cancellationTemplate: TEMPLATE, cleaningBufferMin: z.number().int().min(0).max(240), noShowGraceMin: z.number().int().min(0).max(600).optional(), receptionCloseHour: z.number().int().min(0).max(26).optional() });
const approval = z.object({ manual: z.boolean(), manualUntil: z.coerce.date().optional() });

const createBody = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Mã khách sạn chỉ gồm A-Z, 0-9, dấu gạch'),
  name: z.string().trim().min(2).max(150),
  description: z.string().max(5000).optional(),
  address,
  location,
  airports,
  amenities: z.array(z.string().max(40)).max(40).default([]),
  contact,
  policy,
  // Chọn doanh nghiệp đã duyệt (khuyến nghị) HOẶC owner cũ (tương thích: tạo doanh nghiệp ACTIVE + tài khoản chủ INVITED như trước).
  businessId: z.string().uuid().optional(),
  owner: z.object({ email: z.string().email().max(200), fullName: z.string().trim().min(2).max(100), password: z.string().min(12).max(128) }).optional(),
}).refine((b) => !!b.businessId !== !!b.owner, 'Cần đúng một trong businessId hoặc owner');
const patchBody = z
  .object({ name: z.string().trim().min(2).max(150), description: z.string().max(5000), address, location, airports, amenities: z.array(z.string().max(40)).max(40), contact, policy, approval })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const listQuery = z.object({
  status: hotelStatus.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  // SĐT chủ/liên hệ: chuẩn hóa về chữ số, bỏ 0 đầu hoặc 84 (+84)
  phone: z.string().trim().max(20).regex(/^[+\d\s().-]*$/, 'Số điện thoại không hợp lệ').transform((v) => v.replace(/\D/g, '').replace(/^(84|0)/, '')).refine((v) => v.length >= 3, 'Nhập ít nhất 3 chữ số').optional(),
  airport: z.string().length(3).transform((s) => s.toUpperCase()).optional(),
  pendingPayout: z.enum(['true']).optional(),
  limit: limitQuery,
  after: seqCursor.optional(),
});
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
const payoutBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MOMO'), accountNo: z.string().regex(/^\+?\d{9,15}$/, 'SĐT ví MoMo không hợp lệ'), accountName: z.string().trim().min(2).max(100) }),
  z.object({ type: z.literal('BANK'), accountNo: z.string().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'), accountName: z.string().trim().min(2).max(100), bankCode: z.string().trim().min(2).max(20).optional() }),
]);
const statsQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

// Không bao giờ trả detailsEnc; chỉ trả nhãn đã che (4 số cuối).
const pub = (h: HotelDoc) => {
  const { payoutAccount: p, ...rest } = h;
  return {
    ...rest,
    payoutAccount: p && {
      type: p.type,
      labelMasked: p.labelMasked,
      verifiedAt: p.verifiedAt,
      changedAt: p.changedAt,
      pendingChange: p.pendingChange && { type: p.pendingChange.type, labelMasked: p.pendingChange.labelMasked, requestedBy: p.pendingChange.requestedBy, requestedAt: p.pendingChange.requestedAt },
    },
  };
};
const maskLabel = (type: string, no: string) => `${type === 'MOMO' ? 'MoMo' : 'TK'} ****${no.slice(-4)}`;

const loadHotel = async (id: string, tx: Db = db, lock = false) => {
  const h = (await tx.query<HotelDoc>(`SELECT * FROM hotels WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
  if (!h) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  return h;
};

// OQ-2-02: duyệt tay chỉ được bật tối đa 90 ngày.
function checkApproval(a: z.infer<typeof approval>, now: Date) {
  if (!a.manual) return { manual: false };
  if (!a.manualUntil || a.manualUntil.getTime() > now.getTime() + 90 * DAY_MS || a.manualUntil <= now) {
    throw new AppError(422, 'MANUAL_APPROVAL_LIMIT', 'Duyệt tay cần ngày kết thúc trong tương lai và tối đa 90 ngày');
  }
  return { manual: true, manualUntil: a.manualUntil };
}

// Trùng tên khách sạn (không phân biệt hoa thường, gộp khoảng trắng). Chỉ kiểm tên; email chủ/số điện thoại có thể trùng giữa các khách sạn là việc khác.
// shortcut: chưa bỏ dấu (cần unaccent) và chưa có unique index, hai yêu cầu đồng thời vẫn có thể lọt; thêm index chuẩn hóa khi cần chặt.
export async function assertNameFree(name: string, exceptId?: string) {
  const norm = "lower(regexp_replace(btrim(?), '\\s+', ' ', 'g'))";
  const dup = (await db.query(`SELECT 1 FROM hotels WHERE lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = ${norm.replace('?', '$1')} AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`, [name, exceptId ?? null])).rows[0];
  if (dup) throw new AppError(409, 'HOTEL_NAME_EXISTS', 'Tên khách sạn đã tồn tại');
}

export async function checkBuffer(minutes: number) {
  const max = (await getConfig('cancellation.limits')).value.cleaningBufferMaxMin;
  if (minutes > max) throw new AppError(422, 'CLEANING_BUFFER_TOO_LONG', `Khoảng đệm dọn phòng tối đa ${max} phút`);
}

adminHotelsRouter.get('/hotels', read, validate({ query: listQuery }), async (req, res) => {
  const { status, q, phone, airport, pendingPayout, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('status = ?', status);
  if (airport) add('airports @> ?::jsonb', json([{ iata: airport }]));
  if (pendingPayout) where.push("payout_account->'pendingChange' IS NOT NULL");
  if (q) { // tên / mã / địa chỉ (dòng, phường, quận, thành phố). shortcut: quét ILIKE, thêm pg_trgm + unaccent khi nhiều khách sạn
    const n = params.push(escapeLike(q));
    where.push(`(name ILIKE '%' || $${n} || '%' OR code ILIKE '%' || $${n} || '%' OR concat_ws(' ', address->>'line', address->>'ward', address->>'district', address->>'city') ILIKE '%' || $${n} || '%')`);
  }
  // Tài khoản chủ chưa lưu số điện thoại riêng; số chủ khai khi đăng ký nằm ở contact.phone. So khớp theo chữ số, bỏ 0 đầu / 84.
  if (phone) where.push(`regexp_replace(regexp_replace(coalesce(contact->>'phone', ''), '\\D', '', 'g'), '^(84|0)', '') LIKE '%' || $${params.push(phone)} || '%'`);
  if (after !== undefined) add('seq < ?', after);
  const rows = (await db.query<HotelDoc>(`SELECT * FROM hotels ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq DESC LIMIT ${limit + 1}`, params)).rows;
  const page = rows.slice(0, limit);
  res.json({ items: page.map(pub), nextCursor: rows.length > limit ? page[page.length - 1]?.seq : null });
});

adminHotelsRouter.get('/hotels/:id', read, validate({ params: idParams }), async (req, res) => {
  res.json({ hotel: pub(await loadHotel((req.valid.params as z.infer<typeof idParams>).id)) });
});

// Đăng ký đối tác: tạo khách sạn (chờ duyệt) + tài khoản chủ. Chủ chỉ đăng nhập được sau khi khách sạn được duyệt.
adminHotelsRouter.post('/hotels', manage, validate({ body: createBody }), async (req, res) => {
  const b = req.valid.body as z.infer<typeof createBody>;
  await checkBuffer(b.policy.cleaningBufferMin);
  await assertNameFree(b.name);
  const role = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL", [HOTEL_OWNER_ROLE.key])).rows[0];
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', 'Chưa có vai trò chủ khách sạn (chạy npm run db:seed)');

  const hotelId = randomUUID();
  let hotel: HotelDoc;
  try {
    hotel = await withTransaction(async (tx) => {
      let businessId = b.businessId;
      let ownerId: string;
      if (b.businessId) {
        const biz = (await tx.query<{ status: string }>('SELECT status FROM businesses WHERE id = $1 FOR SHARE', [b.businessId])).rows[0];
        if (!biz) throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Không tìm thấy doanh nghiệp');
        if (biz.status !== 'ACTIVE') throw new AppError(409, 'BUSINESS_NOT_ACTIVE', 'Doanh nghiệp chưa được duyệt hoặc đang bị tạm ngưng');
        const owner = (await tx.query<{ id: string }>('SELECT id FROM accounts WHERE business_id = $1 AND is_owner ORDER BY seq LIMIT 1', [b.businessId])).rows[0];
        if (!owner) throw new AppError(409, 'BUSINESS_NO_OWNER', 'Doanh nghiệp chưa có tài khoản chủ');
        ownerId = owner.id;
      } else {
        // Luồng cũ: doanh nghiệp + chủ tạo cùng lúc; chủ INVITED tới khi khách sạn được duyệt.
        const o = b.owner!;
        ownerId = randomUUID();
        businessId = ownerId;
        await tx.query(`INSERT INTO businesses (id, name, representative, email, phone, status, approved_at, approved_by) VALUES ($1,$2,$3,$4,$5,'ACTIVE',now(),$6)`, [businessId, b.name, o.fullName, o.email.toLowerCase(), b.contact.phone, req.auth!.sub]);
      }
      const created = (
        await tx.query<HotelDoc>(
          `INSERT INTO hotels (id, code, name, slug, status, owner_account_id, business_id, description, address, location, airports, amenities, contact, policy, approval, rating, incident_score)
           VALUES ($1,$2,$3,$4,'PENDING_APPROVAL',$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13::jsonb,'{"manual":true}','{"avg":0,"count":0}',0) RETURNING *`,
          [hotelId, b.code, b.name, b.code.toLowerCase(), ownerId, businessId, b.description ?? null, json(b.address), json({ type: 'Point', coordinates: [b.location.lng, b.location.lat] }), json(b.airports), b.amenities, json(b.contact), json(b.policy)],
        )
      ).rows[0]!;
      if (b.owner) {
        await tx.query(
          `INSERT INTO accounts (id, type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner, created_by, business_id, phone)
           VALUES ($1,'HOTEL',$2,$3,$4,'INVITED',$5,$6::uuid[],true,$7,$8,$9)`,
          [ownerId, b.owner.email.toLowerCase(), await hashPassword(b.owner.password), b.owner.fullName, hotelId, [role.id], req.auth!.sub, businessId, b.contact.phone],
        );
      } else {
        await tx.query('UPDATE accounts SET hotel_id = $2, updated_at = now() WHERE id = $1 AND hotel_id IS NULL', [ownerId, hotelId]); // khách sạn đầu tiên = khách sạn làm việc mặc định
      }
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.CREATE', entity: { type: 'hotel', id: hotelId }, hotelId, after: { code: b.code, name: b.name, businessId, ...(b.owner && { ownerEmail: b.owner.email.toLowerCase() }) }, requestId: String(req.id) }, tx);
      return created;
    });
  } catch (e) {
    if (isDuplicateKey(e)) {
      const dupEmail = duplicateConstraint(e).includes('email');
      throw new AppError(409, dupEmail ? 'EMAIL_EXISTS' : 'HOTEL_CODE_EXISTS', dupEmail ? 'Email đã được dùng' : 'Mã khách sạn đã tồn tại');
    }
    throw e;
  }
  res.status(201).json({ hotel: pub(hotel) });
});

// Cột tương ứng của từng trường được sửa: [tên cột, có phải jsonb].
const PATCH_COLS = {
  name: ['name', false],
  description: ['description', false],
  address: ['address', true],
  location: ['location', true],
  airports: ['airports', true],
  amenities: ['amenities', false],
  contact: ['contact', true],
  policy: ['policy', true],
  approval: ['approval', true],
} as const;

// Không sửa trạng thái / tài khoản nhận tiền ở đây (có route riêng, có kiểm soát).
adminHotelsRouter.patch('/hotels/:id', manage, validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const patch = req.valid.body as z.infer<typeof patchBody>;
  const now = new Date();
  if (patch.policy) await checkBuffer(patch.policy.cleaningBufferMin);
  if (patch.name) await assertNameFree(patch.name, id);
  const { location: loc, approval: appr, ...rest } = patch;
  const set: Record<string, unknown> = {
    ...rest,
    ...(loc && { location: { type: 'Point', coordinates: [loc.lng, loc.lat] } }),
    ...(appr && { approval: checkApproval(appr, now) }),
  };

  const updated = await withTransaction(async (tx) => {
    const before = await loadHotel(id, tx, true);
    const params: unknown[] = [id, now];
    const sets = ['updated_at = $2'];
    for (const [k, v] of Object.entries(set)) {
      const [col, isJson] = PATCH_COLS[k as keyof typeof PATCH_COLS];
      sets.push(`${col} = $${params.push(isJson ? json(v) : v)}${isJson ? '::jsonb' : ''}`);
    }
    const next = (await tx.query<HotelDoc>(`UPDATE hotels SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)).rows[0]!;
    const keys = Object.keys(patch);
    await writeAudit(
      { actor: actorOf(req.auth), action: 'HOTEL.UPDATE', entity: { type: 'hotel', id }, hotelId: id, before: Object.fromEntries(keys.map((k) => [k, (before as never)[k]])), after: Object.fromEntries(keys.map((k) => [k, set[k]])), requestId: String(req.id) },
      tx,
    );
    return next;
  });
  res.json({ hotel: pub(updated) });
});

// Máy trạng thái: cập nhật có điều kiện theo trạng thái hiện tại -> hai Admin bấm cùng lúc chỉ một bên thành công.
async function transition(opts: {
  id: string;
  from: HotelDoc['status'][];
  to: HotelDoc['status'];
  action: string;
  reason?: string;
  req: import('express').Request;
  approve?: boolean;
  activateOwner?: boolean;
}) {
  const { id, from, to, action, reason, req, approve, activateOwner } = opts;
  return withTransaction(async (tx) => {
    const now = new Date();
    const old = (await tx.query<{ status: HotelDoc['status']; ownerAccountId?: string }>('SELECT status, owner_account_id FROM hotels WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!old) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    if (!from.includes(old.status)) throw new AppError(409, 'INVALID_STATE', `Trạng thái khách sạn không cho phép thao tác (cần: ${from.join('/')})`);
    await tx.query(
      `UPDATE hotels SET status = $2, updated_at = $3${approve ? ', approved_at = $3, approved_by = $4' : ''} WHERE id = $1`,
      approve ? [id, to, now, req.auth!.sub] : [id, to, now],
    );
    if (activateOwner && old.ownerAccountId) {
      await tx.query("UPDATE accounts SET status = 'ACTIVE', updated_at = $2 WHERE id = $1 AND status = 'INVITED'", [old.ownerAccountId, now]);
    }
    await writeAudit(
      { actor: actorOf(req.auth), action, entity: { type: 'hotel', id }, hotelId: id, before: { status: old.status }, after: { status: to }, ...(reason && { reasonNote: reason }), requestId: String(req.id) },
      tx,
    );
  });
}

adminHotelsRouter.post('/hotels/:id/approve', manage, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await transition({ id, from: ['PENDING_APPROVAL'], to: 'ACTIVE', action: 'HOTEL.APPROVE', req, approve: true, activateOwner: true });
  res.json({ hotel: pub(await loadHotel(id)) });
});

adminHotelsRouter.post('/hotels/:id/reject', manage, validate({ params: idParams, body: reasonBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { reason } = req.valid.body as z.infer<typeof reasonBody>;
  await transition({ id, from: ['PENDING_APPROVAL'], to: 'DRAFT', action: 'HOTEL.REJECT', reason, req });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// Tạm ngưng không tự hủy đơn đang có: trả về số đơn sắp tới để Admin xử lý (ADM-04).
adminHotelsRouter.post('/hotels/:id/suspend', manage, validate({ params: idParams, body: reasonBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { reason } = req.valid.body as z.infer<typeof reasonBody>;
  await transition({ id, from: ['ACTIVE'], to: 'SUSPENDED', action: 'HOTEL.SUSPEND', reason, req });
  const upcomingBookings = (
    await db.query<{ n: number }>("SELECT count(*) AS n FROM bookings WHERE hotel_id = $1 AND status IN ('PENDING_PAYMENT','PENDING','CONFIRMED') AND stay_from >= $2", [id, new Date()])
  ).rows[0]!.n;
  res.json({ hotel: pub(await loadHotel(id)), upcomingBookings });
});

adminHotelsRouter.post('/hotels/:id/activate', manage, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await transition({ id, from: ['SUSPENDED', 'HIDDEN_DEBT'], to: 'ACTIVE', action: 'HOTEL.ACTIVATE', req });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// --- Tài khoản nhận tiền: Admin có quyền quản lý khách sạn đổi thẳng, không cần người khác duyệt (ghi nhật ký, số tài khoản mã hóa) ---
adminHotelsRouter.put('/hotels/:id/payout-account', manage, validate({ params: idParams, body: payoutBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const b = req.valid.body as z.infer<typeof payoutBody>;
  const now = new Date();
  const next: PayoutAccountData = {
    type: b.type,
    labelMasked: maskLabel(b.type, b.accountNo),
    detailsEnc: encryptJson({ accountNo: b.accountNo, accountName: b.accountName, ...(b.type === 'BANK' && b.bankCode && { bankCode: b.bankCode }) }),
  };
  await withTransaction(async (tx) => {
    const h = await loadHotel(id, tx, true);
    // Ghi đè luôn; đề xuất chờ duyệt cũ (nếu còn từ trước khi bỏ bước duyệt) bị thay thế.
    await tx.query('UPDATE hotels SET payout_account = $2::jsonb, updated_at = $3 WHERE id = $1', [id, json({ ...next, verifiedAt: now, changedAt: now }), now]);
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.CHANGE', entity: { type: 'hotel', id }, hotelId: id, before: { label: h.payoutAccount?.labelMasked }, after: { label: next.labelMasked, type: next.type }, requestId: String(req.id) }, tx);
  });
  res.json({ hotel: pub(await loadHotel(id)) });
});

adminHotelsRouter.post('/hotels/:id/payout-account/approve', approveSensitive, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await withTransaction(async (tx) => {
    const h = await loadHotel(id, tx, true);
    const p = h.payoutAccount?.pendingChange;
    if (!p) throw new AppError(409, 'NO_PENDING_CHANGE', 'Không có đề xuất nào chờ duyệt');
    const now = new Date();
    const next: PayoutAccountData = { type: p.type, labelMasked: p.labelMasked, detailsEnc: p.detailsEnc };
    await tx.query('UPDATE hotels SET payout_account = $2::jsonb, updated_at = $3 WHERE id = $1', [id, json({ ...next, verifiedAt: now, changedAt: now }), now]);
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.CHANGE', entity: { type: 'hotel', id }, hotelId: id, before: { label: h.payoutAccount?.labelMasked }, after: { label: p.labelMasked, type: p.type, requestedBy: p.requestedBy }, requestId: String(req.id) }, tx);
  });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// Người đề xuất cũng được từ chối (= rút lại đề xuất).
adminHotelsRouter.post('/hotels/:id/payout-account/reject', approveSensitive, validate({ params: idParams, body: reasonBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { reason } = req.valid.body as z.infer<typeof reasonBody>;
  await withTransaction(async (tx) => {
    const h = await loadHotel(id, tx, true);
    const p = h.payoutAccount?.pendingChange;
    if (!p) throw new AppError(409, 'NO_PENDING_CHANGE', 'Không có đề xuất nào chờ duyệt');
    await tx.query("UPDATE hotels SET payout_account = payout_account - 'pendingChange', updated_at = now() WHERE id = $1", [id]);
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.REJECT', entity: { type: 'hotel', id }, hotelId: id, before: { pending: p.labelMasked }, reasonNote: reason, requestId: String(req.id) }, tx);
  });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// FR-ADM-08: thống kê khách sạn (logic ở services/dashboard/hotelStats.ts).
adminHotelsRouter.get('/hotels/:id/stats', read, validate({ params: idParams, query: statsQuery }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  res.json(await getHotelStats(id, req.valid.query as z.infer<typeof statsQuery>));
});
