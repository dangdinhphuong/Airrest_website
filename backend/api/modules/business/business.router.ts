import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PERM } from '../../../config/permissions';
import { db, json, withTransaction } from '../../../database/pg';
import type { HotelDoc } from '../../../database/types';
import { AppError, duplicateConstraint, isDuplicateKey } from '../../../lib/errors';
import { idParams } from '../../../lib/zod';
import { actorOf, writeAudit } from '../../../services/audit';
import { registerBody, registerBusiness } from '../../../services/business/business.service';
import { businessRevenueSummary, hotelRevenue, parseRange, toCsv } from '../../../services/business/revenue';
import { authenticate, requirePermission } from '../../middleware/auth';
import { businessRegisterRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { address, airports, assertNameFree, checkBuffer, contact, location, policy } from '../admin/hotels.router';

// POST /api/v1/auth/business/register: công khai, rate limit riêng; luôn trả 202 cùng nội dung (không lộ email/mã số thuế đã tồn tại).
export const businessAuthRouter = Router();
businessAuthRouter.post('/register', businessRegisterRateLimit, validate({ body: registerBody }), async (req, res) => {
  res.status(202).json(await registerBusiness(req.valid.body as z.infer<typeof registerBody>, String(req.id)));
});

// ---- /api/v1/hotel/hotels: chủ doanh nghiệp tạo/liệt kê khách sạn của CHÍNH doanh nghiệp trong token (không nhận businessId từ body) ----
export const businessHotelsRouter = Router();
businessHotelsRouter.use(authenticate, requirePermission(PERM.BUSINESS_HOTEL_MANAGE));
const needBusiness = (req: { auth?: { businessId?: string } }) => {
  if (!req.auth?.businessId) throw new AppError(403, 'FORBIDDEN', 'Chỉ dành cho tài khoản chủ doanh nghiệp');
  return req.auth.businessId;
};

const createBody = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Mã khách sạn chỉ gồm A-Z, 0-9, dấu gạch'),
  name: z.string().trim().min(2).max(150),
  description: z.string().max(5000).optional(),
  address,
  location,
  contact,
  airports: airports.optional(), // khung tạo: có thể bổ sung sau khi khai báo chi tiết
  amenities: z.array(z.string().max(40)).max(40).default([]),
  policy: policy.default({ cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 }),
});

businessHotelsRouter.get('/', async (req, res) => {
  const businessId = needBusiness(req);
  const items = (await db.query('SELECT id, code, name, status, address, contact, created_at, approved_at, paused_at, pause_reason FROM hotels WHERE business_id = $1 ORDER BY seq', [businessId])).rows;
  const chain = (await db.query<{ pausedAt?: string; pauseReason?: string }>('SELECT paused_at, pause_reason FROM businesses WHERE id = $1', [businessId])).rows[0];
  res.json({ items, currentHotelId: req.auth!.hotelId ?? null, chain: { pausedAt: chain?.pausedAt ?? null, pauseReason: chain?.pauseReason ?? null } });
});

// Tạm dừng nhận đặt mới (cả chuỗi hoặc từng khách sạn). Đơn đã đặt/đang lưu trú KHÔNG bị ảnh hưởng.
const pauseBody = z.object({ reason: z.string().trim().min(3).max(300) });
const setPause = (table: 'hotels' | 'businesses', pause: boolean) => async (req: import('express').Request, res: import('express').Response) => {
  const businessId = needBusiness(req);
  const id = table === 'hotels' ? (req.valid.params as z.infer<typeof idParams>).id : businessId;
  const reason = pause ? (req.valid.body as z.infer<typeof pauseBody>).reason : null;
  const scope = table === 'hotels' ? 'id = $1 AND business_id = $2' : 'id = $2 AND $1::uuid IS NOT NULL';
  await withTransaction(async (tx) => {
    const cur = (await tx.query<{ status?: string; pausedAt?: string }>(`SELECT ${table === 'hotels' ? 'status, ' : ''}paused_at FROM ${table} WHERE ${scope} FOR UPDATE`, [id, businessId])).rows[0];
    if (!cur) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    if (pause && table === 'hotels' && cur.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE', 'Chỉ tạm dừng được khách sạn đang hoạt động');
    if (!!cur.pausedAt === pause) throw new AppError(409, 'INVALID_STATE', pause ? 'Đã đang tạm dừng' : 'Không ở trạng thái tạm dừng');
    await tx.query(`UPDATE ${table} SET paused_at = ${pause ? 'now()' : 'NULL'}, pause_reason = $3, updated_at = now() WHERE ${scope}`, [id, businessId, reason]);
    await writeAudit({ actor: actorOf(req.auth), action: pause ? 'HOTEL.PAUSE' : 'HOTEL.RESUME', entity: { type: table === 'hotels' ? 'hotel' : 'business', id }, ...(table === 'hotels' && { hotelId: id }), after: { paused: pause, reason }, requestId: String(req.id) }, tx);
  });
  res.json({ ok: true, paused: pause });
};
// 'chain' đứng trước '/:id' để không bị hiểu là mã khách sạn.
businessHotelsRouter.post('/chain/pause', validate({ body: pauseBody }), setPause('businesses', true));
businessHotelsRouter.post('/chain/resume', setPause('businesses', false));
businessHotelsRouter.post('/:id/pause', validate({ params: idParams, body: pauseBody }), setPause('hotels', true));
businessHotelsRouter.post('/:id/resume', validate({ params: idParams }), setPause('hotels', false));

// Tạo ở DRAFT; chủ gửi hồ sơ (submit) để admin duyệt bằng luồng duyệt khách sạn hiện có.
businessHotelsRouter.post('/', validate({ body: createBody }), async (req, res) => {
  const businessId = needBusiness(req);
  const b = req.valid.body as z.infer<typeof createBody>;
  await checkBuffer(b.policy.cleaningBufferMin);
  await assertNameFree(b.name);
  const id = randomUUID();
  try {
    const hotel = await withTransaction(async (tx) => {
      const created = (
        await tx.query<HotelDoc>(
          `INSERT INTO hotels (id, code, name, slug, status, owner_account_id, business_id, description, address, location, airports, amenities, contact, policy, approval, rating, incident_score)
           VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13::jsonb,'{"manual":true}','{"avg":0,"count":0}',0) RETURNING *`,
          [id, b.code, b.name, b.code.toLowerCase(), req.auth!.sub, businessId, b.description ?? null, json(b.address), json({ type: 'Point', coordinates: [b.location.lng, b.location.lat] }), json(b.airports ?? []), b.amenities, json(b.contact), json(b.policy)],
        )
      ).rows[0]!;
      await tx.query('UPDATE accounts SET hotel_id = $2, updated_at = now() WHERE id = $1 AND hotel_id IS NULL', [req.auth!.sub, id]);
      await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.CREATE', entity: { type: 'hotel', id }, hotelId: id, after: { code: b.code, name: b.name, businessId, status: 'DRAFT' }, requestId: String(req.id) }, tx);
      return created;
    });
    res.status(201).json({ hotel });
  } catch (e) {
    if (isDuplicateKey(e) && !duplicateConstraint(e).includes('email')) throw new AppError(409, 'HOTEL_CODE_EXISTS', 'Mã khách sạn đã tồn tại');
    throw e;
  }
});

// Gửi hồ sơ: DRAFT -> PENDING_APPROVAL (khách sạn của doanh nghiệp khác = 404).
businessHotelsRouter.post('/:id/submit', validate({ params: idParams }), async (req, res) => {
  const businessId = needBusiness(req);
  const { id } = req.valid.params as z.infer<typeof idParams>;
  const hotel = await withTransaction(async (tx) => {
    const h = (await tx.query<{ status: string }>('SELECT status FROM hotels WHERE id = $1 AND business_id = $2 FOR UPDATE', [id, businessId])).rows[0];
    if (!h) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
    if (h.status !== 'DRAFT') throw new AppError(409, 'INVALID_STATE', 'Chỉ gửi hồ sơ được khách sạn đang ở trạng thái nháp');
    const row = (await tx.query<HotelDoc>("UPDATE hotels SET status = 'PENDING_APPROVAL', updated_at = now() WHERE id = $1 RETURNING *", [id])).rows[0]!;
    await writeAudit({ actor: actorOf(req.auth), action: 'HOTEL.SUBMIT', entity: { type: 'hotel', id }, hotelId: id, before: { status: 'DRAFT' }, after: { status: 'PENDING_APPROVAL' }, requestId: String(req.id) }, tx);
    return row;
  });
  res.json({ hotel });
});

// ---- /api/v1/hotel/reports: báo cáo doanh thu ----
export const businessReportsRouter = Router();
businessReportsRouter.use(authenticate);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD (giờ Việt Nam)');
const format = z.enum(['json', 'csv']).default('json');
const revenueQuery = z.object({ hotelId: z.string().uuid(), from: date, to: date, groupBy: z.enum(['day', 'month']).default('day'), format });
const summaryQuery = z.object({ from: date, to: date, format });

const sendCsv = (res: import('express').Response, name: string, csv: string) => res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${name}.csv"`).send(csv);

// Nhân viên (booking:read) chỉ khách sạn của mình; chủ doanh nghiệp (business:report:read) mọi khách sạn của doanh nghiệp. Khác -> 404 (không lộ khách sạn tồn tại).
businessReportsRouter.get('/revenue', requirePermission(PERM.BOOKING_READ), validate({ query: revenueQuery }), async (req, res) => {
  const auth = req.auth!;
  const q = req.valid.query as z.infer<typeof revenueQuery>;
  const own = auth.hotelId === q.hotelId;
  const inBusiness = !own && !!auth.businessId && auth.permissions.includes(PERM.BUSINESS_REPORT_READ) && !!(await db.query('SELECT 1 FROM hotels WHERE id = $1 AND business_id = $2', [q.hotelId, auth.businessId])).rows[0];
  if (!own && !inBusiness) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Không tìm thấy khách sạn');
  const r = await hotelRevenue(q.hotelId, parseRange(q.from, q.to), q.groupBy);
  if (q.format === 'csv') {
    return sendCsv(res, `doanh-thu-${q.from}_${q.to}`, toCsv(['Kỳ', 'Số đơn', 'Đã thực hiện (VND)', 'Dự kiến (VND)', 'Phí dịch vụ đã thực hiện (VND)', 'Phí dịch vụ dự kiến (VND)'], [...r.items.map((i) => [i.bucket, i.bookings, i.realizedVnd, i.expectedVnd, i.serviceFeeRealizedVnd, i.serviceFeeExpectedVnd]), ['Tổng', r.totals.bookings, r.totals.realizedVnd, r.totals.expectedVnd, r.totals.serviceFeeRealizedVnd, r.totals.serviceFeeExpectedVnd]]));
  }
  res.json(r);
});

businessReportsRouter.get('/revenue/summary', requirePermission(PERM.BUSINESS_REPORT_READ), validate({ query: summaryQuery }), async (req, res) => {
  const businessId = needBusiness(req);
  const q = req.valid.query as z.infer<typeof summaryQuery>;
  const r = await businessRevenueSummary(businessId, parseRange(q.from, q.to));
  if (q.format === 'csv') {
    const t = r.totals;
    return sendCsv(res, `doanh-thu-doanh-nghiep-${q.from}_${q.to}`, toCsv(['Mã', 'Khách sạn', 'Số đơn', 'Đã thực hiện (VND)', 'Dự kiến (VND)', 'Phí dịch vụ đã thực hiện (VND)', 'Phí dịch vụ dự kiến (VND)', 'Kết toán gross (VND)', 'Hoa hồng (VND)', 'Kết toán net (VND)'], [...r.hotels.map((h) => [h.code, h.name, h.bookings, h.realizedVnd, h.expectedVnd, h.serviceFeeRealizedVnd, h.serviceFeeExpectedVnd, h.settlement.grossVnd, h.settlement.commissionVnd, h.settlement.netVnd]), ['', 'Tổng cộng', t.bookings, t.realizedVnd, t.expectedVnd, t.serviceFeeRealizedVnd, t.serviceFeeExpectedVnd, t.settlement.grossVnd, t.settlement.commissionVnd, t.settlement.netVnd]]));
  }
  res.json(r);
});
