import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { z } from 'zod';
import { HOTEL_OWNER_ROLE } from '../../config/roles';
import { PERM } from '../../config/permissions';
import { col } from '../../db/collections';
import { withTransaction } from '../../db/mongo';
import type { HotelDoc, PayoutAccountData } from '../../db/types';
import { actorOf, writeAudit } from '../../lib/audit';
import { encryptJson } from '../../lib/crypto';
import { AppError, isDuplicateKey } from '../../lib/errors';
import { isActive } from '../../lib/inventory';
import { hashPassword } from '../../lib/password';
import { getConfig } from '../../lib/systemConfig';
import { escapeRegex, idParams, limitQuery, oid } from '../../lib/zod';
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
const policy = z.object({ cancellationTemplate: TEMPLATE, cleaningBufferMin: z.number().int().min(0).max(240), noShowGraceMin: z.number().int().min(0).max(600).optional() });
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
  after: oid.optional(),
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

const loadHotel = async (id: string, session?: import('mongodb').ClientSession) => {
  const h = await col.hotels().findOne({ _id: new ObjectId(id) }, { session });
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
  const rows = await col
    .hotels()
    .find({
      ...(status && { status }),
      ...(airport && { 'airports.iata': airport }),
      ...(pendingPayout && { 'payoutAccount.pendingChange': { $exists: true } }),
      ...(q && { name: { $regex: escapeRegex(q), $options: 'i' } }), // shortcut: quét regex, thêm searchText khi nhiều khách sạn
      ...(after && { _id: { $gt: new ObjectId(after) } }),
    })
    .sort({ _id: 1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);
  res.json({ items: page.map(pub), nextCursor: rows.length > limit ? page[page.length - 1]?._id : null });
});

adminHotelsRouter.get('/hotels/:id', read, validate({ params: idParams }), async (req, res) => {
  res.json({ hotel: pub(await loadHotel((req.valid.params as z.infer<typeof idParams>).id)) });
});

// Đăng ký đối tác: tạo khách sạn (chờ duyệt) + tài khoản chủ. Chủ chỉ đăng nhập được sau khi khách sạn được duyệt.
adminHotelsRouter.post('/hotels', manage, validate({ body: createBody }), async (req, res) => {
  const b = req.valid.body as z.infer<typeof createBody>;
  await checkBuffer(b.policy.cleaningBufferMin);
  const role = await col.roles().findOne({ key: HOTEL_OWNER_ROLE.key, scope: 'SYSTEM', hotelId: { $exists: false } });
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', 'Chưa có vai trò chủ khách sạn (chạy npm run db:seed)');

  const now = new Date();
  const hotelId = new ObjectId();
  const ownerId = new ObjectId();
  const hotel: HotelDoc = {
    _id: hotelId,
    code: b.code,
    name: b.name,
    slug: b.code.toLowerCase(),
    status: 'PENDING_APPROVAL',
    ownerAccountId: ownerId,
    ...(b.description && { description: b.description }),
    address: b.address,
    location: { type: 'Point', coordinates: [b.location.lng, b.location.lat] },
    airports: b.airports,
    amenities: b.amenities,
    contact: b.contact,
    policy: b.policy,
    approval: { manual: false },
    rating: { avg: 0, count: 0 },
    incidentScore: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await withTransaction(async (session) => {
      await col.accounts().insertOne(
        { _id: ownerId, type: 'HOTEL', email: b.owner.email.toLowerCase(), passwordHash: await hashPassword(b.owner.password), fullName: b.owner.fullName, status: 'INVITED', hotelId, roleIds: [role._id], isOwner: true, createdBy: new ObjectId(req.auth!.sub), createdAt: now, updatedAt: now },
        { session },
      );
      await col.hotels().insertOne(hotel, { session });
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.CREATE', entity: { type: 'hotel', id: hotelId.toHexString() }, hotelId, after: { code: b.code, name: b.name, ownerEmail: b.owner.email.toLowerCase() }, requestId: String(req.id) }, session);
    });
  } catch (e) {
    if (isDuplicateKey(e)) {
      const dupEmail = JSON.stringify((e as { keyPattern?: unknown }).keyPattern ?? {}).includes('email');
      throw new AppError(409, dupEmail ? 'EMAIL_EXISTS' : 'HOTEL_CODE_EXISTS', dupEmail ? 'Email đã được dùng' : 'Mã khách sạn đã tồn tại');
    }
    throw e;
  }
  res.status(201).json({ hotel: pub(hotel) });
});

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
    updatedAt: now,
  };

  const updated = await withTransaction(async (session) => {
    const before = await loadHotel(id, session);
    await col.hotels().updateOne({ _id: before._id }, { $set: set }, { session });
    const keys = Object.keys(patch);
    await writeAudit(
      { actor: actorOf(req.auth), action: 'HOTEL.UPDATE', entity: { type: 'hotel', id }, hotelId: before._id, before: Object.fromEntries(keys.map((k) => [k, (before as never)[k]])), after: Object.fromEntries(keys.map((k) => [k, set[k]])), requestId: String(req.id) },
      session,
    );
    return { ...before, ...set } as HotelDoc;
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
  extra?: Record<string, unknown>;
  onOwner?: 'ACTIVATE';
}) {
  const { id, from, to, action, reason, req, extra, onOwner } = opts;
  return withTransaction(async (session) => {
    const now = new Date();
    const r = await col.hotels().findOneAndUpdate(
      { _id: new ObjectId(id), status: { $in: from } },
      { $set: { status: to, updatedAt: now, ...extra } },
      { session, returnDocument: 'before' },
    );
    if (!r) {
      const exists = await col.hotels().countDocuments({ _id: new ObjectId(id) }, { session });
      throw exists ? new AppError(409, 'INVALID_STATE', `Trạng thái khách sạn không cho phép thao tác (cần: ${from.join('/')})`) : new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    }
    if (onOwner === 'ACTIVATE' && r.ownerAccountId) {
      await col.accounts().updateOne({ _id: r.ownerAccountId, status: 'INVITED' }, { $set: { status: 'ACTIVE', updatedAt: now } }, { session });
    }
    await writeAudit(
      { actor: actorOf(req.auth), action, entity: { type: 'hotel', id }, hotelId: r._id, before: { status: r.status }, after: { status: to }, ...(reason && { reasonNote: reason }), requestId: String(req.id) },
      session,
    );
    return r;
  });
}

adminHotelsRouter.post('/hotels/:id/approve', manage, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  await transition({ id, from: ['PENDING_APPROVAL'], to: 'ACTIVE', action: 'HOTEL.APPROVE', req, extra: { approvedAt: new Date(), approvedBy: new ObjectId(req.auth!.sub) }, onOwner: 'ACTIVATE' });
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
  const upcomingBookings = await col.bookings().countDocuments({ hotelId: new ObjectId(id), status: { $in: ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED'] }, 'stay.from': { $gte: new Date() } });
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
  const pending: NonNullable<HotelDoc['payoutAccount']>['pendingChange'] = {
    type: b.type,
    labelMasked: maskLabel(b.type, b.accountNo),
    detailsEnc: encryptJson({ accountNo: b.accountNo, accountName: b.accountName, ...(b.type === 'BANK' && { bankCode: b.bankCode }) }),
    requestedBy: new ObjectId(req.auth!.sub),
    requestedAt: new Date(),
  };
  const hotel = await withTransaction(async (session) => {
    // Điều kiện "chưa có đề xuất chờ" nằm trong filter -> không ghi đè đề xuất đang được người khác xem xét.
    const r = await col.hotels().findOneAndUpdate(
      { _id: new ObjectId(id), 'payoutAccount.pendingChange': { $exists: false } },
      { $set: { 'payoutAccount.pendingChange': pending, updatedAt: new Date() } },
      { session, returnDocument: 'after' },
    );
    if (!r) {
      const h = await col.hotels().findOne({ _id: new ObjectId(id) }, { session });
      throw h ? new AppError(409, 'PENDING_CHANGE_EXISTS', 'Đang có đề xuất đổi tài khoản nhận tiền chờ duyệt') : new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    }
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.REQUEST', entity: { type: 'hotel', id }, hotelId: r._id, before: { label: r.payoutAccount?.labelMasked }, after: { label: pending.labelMasked, type: pending.type }, requestId: String(req.id) }, session);
    return r;
  });
  res.status(202).json({ hotel: pub((await col.hotels().findOne({ _id: hotel._id }))!) });
});

adminHotelsRouter.post('/hotels/:id/payout-account/approve', approveSensitive, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const me = req.auth!.sub;
  await withTransaction(async (session) => {
    const h = await loadHotel(id, session);
    const p = h.payoutAccount?.pendingChange;
    if (!p) throw new AppError(409, 'NO_PENDING_CHANGE', 'Không có đề xuất nào chờ duyệt');
    if (p.requestedBy.toHexString() === me) throw new AppError(403, 'FOUR_EYES_REQUIRED', 'Người đề xuất không được tự duyệt, cần một Admin khác');
    const now = new Date();
    const next: PayoutAccountData = { type: p.type, labelMasked: p.labelMasked, detailsEnc: p.detailsEnc };
    await col.hotels().updateOne({ _id: h._id }, { $set: { payoutAccount: { ...next, verifiedAt: now, changedAt: now }, updatedAt: now } }, { session });
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.CHANGE', entity: { type: 'hotel', id }, hotelId: h._id, before: { label: h.payoutAccount?.labelMasked }, after: { label: p.labelMasked, type: p.type, requestedBy: p.requestedBy.toHexString() }, requestId: String(req.id) }, session);
  });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// Người đề xuất cũng được từ chối (= rút lại đề xuất).
adminHotelsRouter.post('/hotels/:id/payout-account/reject', approveSensitive, validate({ params: idParams, body: reasonBody }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const { reason } = req.valid.body as z.infer<typeof reasonBody>;
  await withTransaction(async (session) => {
    const h = await loadHotel(id, session);
    const p = h.payoutAccount?.pendingChange;
    if (!p) throw new AppError(409, 'NO_PENDING_CHANGE', 'Không có đề xuất nào chờ duyệt');
    await col.hotels().updateOne({ _id: h._id }, { $unset: { 'payoutAccount.pendingChange': '' }, $set: { updatedAt: new Date() } }, { session });
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.PAYOUT_ACCOUNT.REJECT', entity: { type: 'hotel', id }, hotelId: h._id, before: { pending: p.labelMasked }, reasonNote: reason, requestId: String(req.id) }, session);
  });
  res.json({ hotel: pub(await loadHotel(id)) });
});

// FR-ADM-08: phòng tồn/đang có khách + doanh thu theo đơn. Phần khách sạn nhận = phòng + xe (không gồm phí dịch vụ, BR-PAY-02).
adminHotelsRouter.get('/hotels/:id/stats', read, validate({ params: idParams, query: statsQuery }), async (req, res) => {
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const q = req.valid.query as z.infer<typeof statsQuery>;
  const hotel = await loadHotel(id);
  const now = new Date();
  const to = q.to ?? now;
  const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
  if (from >= to) throw new AppError(422, 'INVALID_RANGE', 'Khoảng thời gian không hợp lệ');

  const [types, reservations, grouped] = await Promise.all([
    col.roomTypes().find({ hotelId: hotel._id, active: true }).toArray(),
    col.roomReservations().find({ hotelId: hotel._id, state: { $in: ['HOLD', 'CONFIRMED', 'CHECKED_IN'] }, from: { $lte: now }, to: { $gt: now } }).toArray(),
    col
      .bookings()
      .aggregate<{ _id: string; count: number; hotelShareVnd: number; serviceFeeVnd: number }>([
        { $match: { hotelId: hotel._id, 'stay.from': { $gte: from, $lt: to } } },
        { $group: { _id: '$status', count: { $sum: 1 }, hotelShareVnd: { $sum: { $add: ['$pricing.roomVnd', '$pricing.shuttleVnd'] } }, serviceFeeVnd: { $sum: '$pricing.serviceFeeVnd' } } },
      ])
      .toArray(),
  ]);

  const live = reservations.filter((r) => isActive(r, now));
  const sum = (f: (r: (typeof live)[number]) => boolean) => live.filter(f).reduce((s, r) => s + r.qty, 0);
  const totalSellable = types.reduce((s, t) => s + t.totalRooms, 0);
  const byStatus = Object.fromEntries(grouped.map((g) => [g._id, { count: Number(g.count), hotelShareVnd: Number(g.hotelShareVnd), serviceFeeVnd: Number(g.serviceFeeVnd) }]));
  const money = (statuses: string[], f: 'hotelShareVnd' | 'serviceFeeVnd') => statuses.reduce((s, st) => s + (byStatus[st]?.[f] ?? 0), 0);

  res.json({
    hotelId: hotel._id,
    asOf: now,
    rooms: {
      totalSellable,
      occupiedNow: sum((r) => r.state === 'CHECKED_IN'),
      reservedNow: sum((r) => r.state !== 'CHECKED_IN' && r.kind === 'BOOKING'),
      blockedNow: sum((r) => r.kind === 'BLOCK'),
      availableNow: Math.max(0, totalSellable - live.reduce((s, r) => s + r.qty, 0)),
    },
    revenue: {
      from,
      to,
      // Đã thực hiện = khách đã trả phòng; dự kiến = đã xác nhận/đang ở (chưa trả phòng).
      realized: { hotelShareVnd: money(['CHECKED_OUT'], 'hotelShareVnd'), serviceFeeVnd: money(['CHECKED_OUT'], 'serviceFeeVnd') },
      expected: { hotelShareVnd: money(['CONFIRMED', 'CHECKED_IN'], 'hotelShareVnd'), serviceFeeVnd: money(['CONFIRMED', 'CHECKED_IN'], 'serviceFeeVnd') },
      byStatus,
    },
  });
});
