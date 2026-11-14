import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { idParams } from '@airrest/validation';
import { pickupPointsOf } from '../../../data/pickupPoints';
import { PERM } from '../../../config/permissions';
import type { AuthContext } from '../../../lib/jwt';
import { resolvePayerKey } from '../../../services/delay/apiKeys';
import { ingestFlight } from '../../../services/delay/ingest';
import { getBatch, paxContactBody, placeBatch, previewBatch, updatePassengerContact, type UpgradeReq } from '../../../services/delay/batches';
import { listPayerFlightPassengers, listPayerFlights } from '../../../services/delay/queries';
import { simulateDelayFlight } from '../../../services/delay/simulate';
import { resendConfirmedEmail } from '../../../services/delay/confirmedEmails';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';

const A = (req: { auth?: unknown }) => req.auth as AuthContext;

// Xác thực khóa API ở header x-payer-key (không dùng JWT). Sai/thu hồi -> 401.
const payerKey: RequestHandler = async (req, _res, next) => {
  req.payerKey = await resolvePayerKey(req.header('x-payer-key'));
  next();
};
// Giới hạn theo khóa (đã xác thực nên không dò được): 60 lần/phút/khóa.
const ingestLimit = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.payerKey?.keyId ?? 'anon',
  message: (req: { id?: unknown }) => ({ error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau', details: undefined, requestId: String(req.id ?? '') } }),
});
// Idempotency theo từng khóa (middleware gốc dùng req.auth.sub hoặc IP).
const ingestIdem: RequestHandler = (req, res, next) => idempotent(`payer-ingest:${req.payerKey!.keyId}`)(req, res, next);

export const payerRouter = Router();

payerRouter.post('/ingest/flights', payerKey, ingestLimit, ingestIdem, async (req, res) => {
  const k = req.payerKey!;
  res.json(await ingestFlight({ payerId: k.payerId, actor: { type: 'PAYER', id: k.payerId }, source: 'API', apiKeyId: k.keyId }, req.body));
});

payerRouter.post('/simulate-delay', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ body: z.object({ delayUntil: z.string().datetime({ offset: true }) }).strict() }), idempotent('payer-simulate'), async (req, res) => {
  res.status(201).json(await simulateDelayFlight(A(req), req.valid.body as { delayUntil: string }));
});

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.coerce.number().int().min(0).optional() });
payerRouter.get('/flights', authenticate, requirePermission(PERM.PAYER_DELAY_READ), validate({ query: listQuery }), async (req, res) => {
  res.json(await listPayerFlights(A(req), req.valid.query as { limit: number; cursor?: number }));
});
payerRouter.get('/flights/:id/passengers', authenticate, requirePermission(PERM.PAYER_DELAY_READ), validate({ params: idParams }), async (req, res) => {
  res.json(await listPayerFlightPassengers(A(req), (req.valid.params as { id: string }).id));
});

// Đặt phòng nghỉ cho khách delay (lô). Mọi truy vấn khóa theo payer của tài khoản; dữ liệu của đơn vị khác -> 404.
const batchBody = z.object({ passengerIds: z.array(z.string().uuid()).min(1).max(300), pickupPoint: z.string().trim().min(1).max(200).optional() }).strict();
// Nâng hạng chỉ ở bước đặt: unitKey = khóa phòng do preview trả (rooms[].unitKey), roomTypeId = hạng cao hơn lấy từ rooms[].upgradeOptions.
const placeBody = batchBody.extend({ upgrades: z.array(z.object({ unitKey: z.string().min(1).max(4000), roomTypeId: z.string().uuid() }).strict()).max(300).optional() }).strict();
payerRouter.post('/flights/:id/batches/preview', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ params: idParams, body: batchBody }), async (req, res) => {
  res.json(await previewBatch({ auth: A(req), flightId: (req.valid.params as { id: string }).id, passengerIds: (req.valid.body as { passengerIds: string[] }).passengerIds }));
});
payerRouter.post('/flights/:id/batches', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ params: idParams, body: placeBody }), idempotent('payer-batch'), async (req, res) => {
  res.status(201).json(await placeBatch({ auth: A(req), flightId: (req.valid.params as { id: string }).id, ...(req.valid.body as { passengerIds: string[]; pickupPoint?: string; upgrades?: UpgradeReq[] }), idempotencyKey: req.header('Idempotency-Key')! }));
});
payerRouter.get('/pickup-points', authenticate, requirePermission(PERM.PAYER_DELAY_READ), validate({ query: z.object({ airport: z.string().trim().length(3).transform((v) => v.toUpperCase()) }) }), async (req, res) => {
  const airport = (req.valid.query as { airport: string }).airport;
  const items = pickupPointsOf(airport);
  res.json({ airport, items, default: items[0] });
});
payerRouter.get('/batches/:id', authenticate, requirePermission(PERM.PAYER_DELAY_READ), validate({ params: idParams }), async (req, res) => {
  res.json(await getBatch(A(req), (req.valid.params as { id: string }).id));
});
payerRouter.patch('/passengers/:id', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ params: idParams, body: paxContactBody }), async (req, res) => {
  res.json(await updatePassengerContact(A(req), (req.valid.params as { id: string }).id, req.valid.body as { email?: string; phone?: string }));
});
// Gửi lại email xác nhận phòng cho khách (sau khi sửa email). Chỉ khi phòng đã CONFIRMED; tối đa 3 lần/giờ/khách.
payerRouter.post('/passengers/:id/resend-email', authenticate, requirePermission(PERM.PAYER_DELAY_MANAGE), validate({ params: idParams }), idempotent('payer-resend-email'), async (req, res) => {
  res.json(await resendConfirmedEmail(A(req), (req.valid.params as { id: string }).id));
});
