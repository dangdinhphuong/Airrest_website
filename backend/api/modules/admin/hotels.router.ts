import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
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

const address = z.object({ line: z.string().min(1).max(200), ward: z.string().max(100).optional(), district: z.string().max(100).optional(), city: z.string().min(1).max(100), country: z.string().length(2).default('VN') });
const location = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });
const airports = z.array(z.object({ iata: z.string().length(3).transform((s) => s.toUpperCase()), km: z.number().min(0).max(200), minutes: z.number().int().min(0).max(600) })).min(1).max(10);
const contact = z.object({ phone: z.string().min(8).max(20), email: z.string().email().optional() });
const policy = z.object({ cancellationTemplate: TEMPLATE, cleaningBufferMin: z.number().int().min(0).max(240), noShowGraceMin: z.number().int().min(0).max(600).optional(), receptionCloseHour: z.number().int().min(0).max(26).optional() });
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
  owner: z.object({ email: z.string().email().max(200), fullName: z.string().trim().min(2).max(100), password: z.string().min(12).max(128) }),
});
const patchBody = z
  .object({ name: z.string().trim().min(2).max(150), description: z.string().max(5000), address, location, airports, amenities: z.array(z.string().max(40)).max(40), contact, policy, approval })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');
const listQuery = z.object({
  status: hotelStatus.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  airport: z.string().length(3).transform((s) => s.toUpperCase()).optional(),
  pendingPayout: z.enum(['true']).optional(),
  limit: limitQuery,
  after: seqCursor.optional(),
});
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
const payoutBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MOMO'), accountNo: z.string().regex(/^\+?\d{9,15}$/, 'SĐT ví MoMo không hợp lệ'), accountName: z.string().trim().min(2).max(100) }),
  z.object({ type: z.literal('BANK'), accountNo: z.string().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'), accountName: z.string().trim().min(2).max(100), bankCode: z.string().trim().min(2).max(20) }),
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

async function checkBuffer(minutes: number) {
  const max = (await getConfig('cancellation.limits')).value.cleaningBufferMaxMin;
  if (minutes > max) throw new AppError(422, 'CLEANING_BUFFER_TOO_LONG', `Khoảng đệm dọn phòng tối đa ${max} phút`);
}

adminHotelsRouter.get('/hotels', read, validate({ query: listQuery }), async (req, res) => {
  const { status, q, airport, pendingPayout, limit, after } = req.valid.query as z.infer<typeof listQuery>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (status) add('status = ?', status);
  if (airport) add('airports @> ?::jsonb', json([{ iata: airport }]));
  if (pendingPayout) where.push("payout_account->'pendingChange' IS NOT NULL");
  if (q) add("name ILIKE '%' || ? || '%'", escapeLike(q)); // shortcut: quét ILIKE, thêm pg_trgm khi nhiều khách sạn
  if (after !== undefined) add('seq > ?', after);
  const rows = (await db.query<HotelDoc>(`SELECT * FROM hotels ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq LIMIT ${limit + 1}`, params)).rows;
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
  const role = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL", [HOTEL_OWNER_ROLE.key])).rows[0];
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', 'Chưa có vai trò chủ khách sạn (chạy npm run db:seed)');

  const hotelId = randomUUID();
  const ownerId = randomUUID();
  const passwordHash = await hashPassword(b.owner.password);
  let hotel: HotelDoc;
  try {
    hotel = await withTransaction(async (tx) => {
      const created = (
        await tx.query<HotelDoc>(
          `INSERT INTO hotels (id, code, name, slug, status, owner_account_id, description, address, location, airports, amenities, contact, policy, approval, rating, incident_score)
           VALUES ($1,$2,$3,$4,'PENDING_APPROVAL',$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12::jsonb,'{"manual":true}','{"avg":0,"count":0}',0) RETURNING *`,
          [hotelId, b.code, b.name, b.code.toLowerCase(), ownerId, b.description ?? null, json(b.address), json({ type: 'Point', coordinates: [b.location.lng, b.location.lat] }), json(b.airports), b.amenities, json(b.contact), json(b.policy)],
        )
      ).rows[0]!;
      await tx.query(
        `INSERT INTO accounts (id, type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner, created_by)
         VALUES ($1,'HOTEL',$2,$3,$4,'INVITED',$5,$6::uuid[],true,$7)`,
        [ownerId, b.owner.email.toLowerCase(), passwordHash, b.owner.fullName, hotelId, [role.id], req.auth!.sub],
      );
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.CREATE', entity: { type: 'hotel', id: hotelId }, hotelId, after: { code: b.code, name: b.name, ownerEmail: b.owner.email.toLowerCase() }, requestId: String(req.id) }, tx);
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

// --- Tài khoản nhận tiền: người đề xuất ≠ người duyệt (BA §3.6b four-eyes; FR-ADM-15) ---
adminHotelsRouter.put('/hotels/:id/payout-account', manage, validate({ params: idParams, body: payoutBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const b = req.valid.body as z.infer<typeof payoutBody>;
  const pending = {
    type: b.type,
    labelMasked: maskLabel(b.type, b.accountNo),
    detailsEnc: encryptJson({ accountNo: b.accountNo, accountName: b.accountName, ...(b.type === 'BANK' && { bankCode: b.bankCode }) }),
    requestedBy: req.auth!.sub,
    requestedAt: new Date(),
  };
  await withTransaction(async (tx) => {
    // Điều kiện "chưa có đề xuất chờ" nằm trong WHERE -> không ghi đè đề xuất đang được người khác xem xét.
    const r = (
      await tx.query<HotelDoc>(
        `UPDATE hotels SET payout_account = jsonb_set(COALESCE(payout_account, '{}'::jsonb), '{pendingChange}', $2::jsonb), updated_at = now()
         WHERE id = $1 AND (payout_account IS NULL OR payout_account->'pendingChange' IS NULL) RETURNING *`,
        [id, json(pending)],
      )
    ).rows[0];
    if (!r) {
      const h = (await tx.query('SELECT 1 FROM hotels WHERE id = $1', [id])).rows[0];
      throw h ? new AppError(409, 'PENDING_CHANGE_EXISTS', 'Đang có đề xuất đổi tài khoản nhận tiền chờ duyệt') : new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    }
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.REQUEST', entity: { type: 'hotel', id }, hotelId: id, before: { label: r.payoutAccount?.labelMasked }, after: { label: pending.labelMasked, type: pending.type }, requestId: String(req.id) }, tx);
  });
  res.status(202).json({ hotel: pub(await loadHotel(id)) });
});

adminHotelsRouter.post('/hotels/:id/payout-account/approve', approveSensitive, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const me = req.auth!.sub;
  await withTransaction(async (tx) => {
    const h = await loadHotel(id, tx, true);
    const p = h.payoutAccount?.pendingChange;
    if (!p) throw new AppError(409, 'NO_PENDING_CHANGE', 'Không có đề xuất nào chờ duyệt');
    if (p.requestedBy === me) throw new AppError(403, 'FOUR_EYES_REQUIRED', 'Người đề xuất không được tự duyệt, cần một Admin khác');
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
