import { Router } from 'express';
import { z } from 'zod';
import { payerCreateBody, payerHotelRateBody, payerStationCreateBody } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { idParams, limitQuery, seqCursor, uuid } from '../../../lib/zod';
import { actorOf, writeAudit } from '../../../services/audit';
import { issuePayerKey } from '../../../services/delay/apiKeys';
import * as svc from '../../../services/delay/adminPayers';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';

// Quản trị đơn vị chi trả. Mount: v1Router.use('/admin/payers', adminPayersRouter). Chỉ tài khoản có quyền admin:payer:* (không có ở vai trò nhân viên payer).
export const adminPayersRouter = Router();
const read = [authenticate, requirePermission(PERM.ADMIN_PAYER_READ)];
const manage = [authenticate, requirePermission(PERM.ADMIN_PAYER_MANAGE)];
const ctx = (req: { auth?: unknown; id?: unknown }): svc.Ctx => ({ auth: req.auth as AuthContext, requestId: String(req.id) });

const idP = validate({ params: idParams });
const subParams = (name: string, body?: z.ZodTypeAny) => validate({ params: z.object({ id: uuid, [name]: uuid }), body });
const patchOf = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().strict().refine((b) => Object.keys(b).length > 0, 'Không có trường nào để cập nhật');

const patchPayerBody = patchOf({
  name: z.string().trim().min(2).max(200),
  kind: z.enum(['AIRLINE', 'GROUND_HANDLER', 'AIRPORT']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  contact: payerCreateBody.shape.contact.unwrap(),
  sharedRoomPolicy: z.enum(['PRIVATE', 'SHARED']),
  allowUpgrade: z.boolean(),
});
const listQuery = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), limit: limitQuery, after: seqCursor.optional() });
const stationPatch = patchOf({ name: z.string().trim().min(2).max(200), active: z.boolean() });
const rateQuery = z.object({ hotelId: uuid.optional() });
const keyBody = z.object({ name: z.string().trim().min(2).max(100) }).strict();
const staffBody = z.object({ email: z.string().trim().email().max(200), fullName: z.string().trim().min(2).max(100), password: z.string().min(12).max(128), stationId: uuid.optional() }).strict();
const staffPatch = patchOf({ status: z.enum(['ACTIVE', 'LOCKED']), fullName: z.string().trim().min(2).max(100) });

adminPayersRouter.get('/', ...read, validate({ query: listQuery }), async (req, res) => {
  res.json(await svc.listPayers(req.valid.query as z.infer<typeof listQuery>));
});
adminPayersRouter.post('/', ...manage, validate({ body: payerCreateBody }), idempotent('admin-payer-create'), async (req, res) => {
  res.status(201).json({ payer: await svc.createPayer(ctx(req), req.valid.body as z.infer<typeof payerCreateBody>) });
});
adminPayersRouter.get('/:id', ...read, idP, async (req, res) => {
  res.json({ payer: await svc.getPayer((req.valid.params as { id: string }).id) });
});
adminPayersRouter.patch('/:id', ...manage, validate({ params: idParams, body: patchPayerBody }), async (req, res) => {
  res.json({ payer: await svc.patchPayer(ctx(req), (req.valid.params as { id: string }).id, req.valid.body as svc.PayerPatch) });
});

// Trạm
adminPayersRouter.get('/:id/stations', ...read, idP, async (req, res) => {
  res.json({ items: await svc.listStations((req.valid.params as { id: string }).id) });
});
adminPayersRouter.post('/:id/stations', ...manage, validate({ params: idParams, body: payerStationCreateBody }), async (req, res) => {
  res.status(201).json({ station: await svc.createStation(ctx(req), (req.valid.params as { id: string }).id, req.valid.body as z.infer<typeof payerStationCreateBody>) });
});
adminPayersRouter.patch('/:id/stations/:stationId', ...manage, subParams('stationId', stationPatch), async (req, res) => {
  const p = req.valid.params as { id: string; stationId: string };
  res.json({ station: await svc.patchStation(ctx(req), p.id, p.stationId, req.valid.body as { name?: string; active?: boolean }) });
});

// Giá hợp đồng
adminPayersRouter.get('/:id/hotel-rates', ...read, validate({ params: idParams, query: rateQuery }), async (req, res) => {
  res.json({ items: await svc.listRates((req.valid.params as { id: string }).id, (req.valid.query as z.infer<typeof rateQuery>).hotelId) });
});
adminPayersRouter.put('/:id/hotel-rates', ...manage, validate({ params: idParams, body: payerHotelRateBody }), async (req, res) => {
  const r = await svc.putRate(ctx(req), (req.valid.params as { id: string }).id, req.valid.body as z.infer<typeof payerHotelRateBody>);
  res.status(r.created ? 201 : 200).json({ rate: r.rate });
});

// Khóa API: khóa thô chỉ có trong response của POST này. Cố ý KHÔNG dùng idempotent() vì nó lưu response (có khóa thô) vào DB.
adminPayersRouter.post('/:id/api-keys', ...manage, validate({ params: idParams, body: keyBody }), async (req, res) => {
  const c = ctx(req);
  const id = (req.valid.params as { id: string }).id;
  await svc.getPayer(id);
  const k = await issuePayerKey(id, (req.valid.body as z.infer<typeof keyBody>).name, c.auth.sub);
  await writeAudit({ actor: actorOf(c.auth), action: 'PAYER_KEY.CREATE', entity: { type: 'payer_api_key', id: k.id }, after: { payerId: id, prefix: k.key.slice(0, 10) }, requestId: c.requestId });
  res.status(201).set('Cache-Control', 'no-store').json({ id: k.id, key: k.key, keyPrefix: k.key.slice(0, 10) });
});
adminPayersRouter.get('/:id/api-keys', ...read, idP, async (req, res) => {
  res.json({ items: await svc.listKeys((req.valid.params as { id: string }).id) });
});
adminPayersRouter.delete('/:id/api-keys/:keyId', ...manage, subParams('keyId'), async (req, res) => {
  const p = req.valid.params as { id: string; keyId: string };
  await svc.revokeKey(ctx(req), p.id, p.keyId);
  res.status(204).end();
});

// Nhân viên
adminPayersRouter.get('/:id/staff', ...read, idP, async (req, res) => {
  res.json({ items: await svc.listStaff((req.valid.params as { id: string }).id) });
});
adminPayersRouter.post('/:id/staff', ...manage, validate({ params: idParams, body: staffBody }), idempotent('admin-payer-staff-create'), async (req, res) => {
  res.status(201).json({ staff: await svc.createStaff(ctx(req), (req.valid.params as { id: string }).id, req.valid.body as z.infer<typeof staffBody>) });
});
adminPayersRouter.patch('/:id/staff/:staffId', ...manage, subParams('staffId', staffPatch), async (req, res) => {
  const p = req.valid.params as { id: string; staffId: string };
  res.json({ staff: await svc.patchStaff(ctx(req), p.id, p.staffId, req.valid.body as { status?: string; fullName?: string }) });
});
