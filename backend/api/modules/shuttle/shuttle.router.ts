import { Router } from 'express';
import { assignShuttleBody, callNowBody, createShuttleBody, idParams, lookupBody, shuttleCancelBody, shuttleListQuery, shuttleQuoteBody, shuttleStaffCancelBody, type AssignShuttleBody, type CallNowBody, type CreateShuttleBody, type LookupBody, type ShuttleListQuery, type ShuttleQuoteBody } from '@airrest/validation';
import { rateLimit } from 'express-rate-limit';
import { PERM } from '../../../config/permissions';
import { db } from '../../../database/pg';
import type { BookingStatus } from '../../../database/types';
import { AppError } from '../../../lib/errors';
import { signGuestToken, type AuthContext } from '../../../lib/jwt';
import { assignShuttle, callShuttleNow, cancelShuttleByGuest, cancelShuttleByStaff, completeShuttle, createShuttleRequest, listStaffShuttles, quoteShuttle } from '../../../services/shuttle/shuttle.service';
import { lookupBooking } from '../../../services/bookings/bookings.service';
import { guestShuttleState } from '../../../services/shuttle/guestView';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';

// Khách: xe đưa đón gắn booking, xác thực bằng mã booking + SĐT.
export const guestShuttleRouter = Router();
guestShuttleRouter.use(strictRateLimit);

guestShuttleRouter.post('/quote', validate({ body: shuttleQuoteBody }), async (req, res) => {
  res.json({ quote: await quoteShuttle(req.valid.body as ShuttleQuoteBody) });
});
guestShuttleRouter.post('/', validate({ body: createShuttleBody }), idempotent('shuttle.create'), async (req, res) => {
  res.status(201).json({ shuttle: await createShuttleRequest(req.valid.body as CreateShuttleBody, String(req.id)) });
});
guestShuttleRouter.post('/call-now', validate({ body: callNowBody }), idempotent('shuttle.callnow'), async (req, res) => {
  res.status(201).json({ shuttle: await callShuttleNow(req.valid.body as CallNowBody, String(req.id)) });
});
guestShuttleRouter.post('/lookup', validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ guestToken: signGuestToken(booking.code), ...(await guestShuttleState(booking)) }); // { guestToken, stage, shuttles, events }
});
guestShuttleRouter.post('/:id/cancel', validate({ params: idParams, body: shuttleCancelBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { code, phone } = req.valid.body as LookupBody;
  res.json({ shuttle: await cancelShuttleByGuest(id, code, phone, String(req.id)) });
});

// Nhân sự khách sạn / OPS (shuttle:handle). Xe của khách sạn khác -> 404.
export const hotelShuttleRouter = Router();
hotelShuttleRouter.use(authenticate, requirePermission(PERM.SHUTTLE_HANDLE));

hotelShuttleRouter.get('/', validate({ query: shuttleListQuery }), async (req, res) => {
  res.json(await listStaffShuttles(req.auth as AuthContext, req.valid.query as ShuttleListQuery));
});
hotelShuttleRouter.post('/:id/assign', validate({ params: idParams, body: assignShuttleBody }), async (req, res) => {
  res.json({ shuttle: await assignShuttle(req.auth as AuthContext, (req.valid.params as { id: string }).id, req.valid.body as AssignShuttleBody, String(req.id)) });
});
hotelShuttleRouter.post('/:id/complete', validate({ params: idParams }), async (req, res) => {
  res.json({ shuttle: await completeShuttle(req.auth as AuthContext, (req.valid.params as { id: string }).id, String(req.id)) });
});
hotelShuttleRouter.post('/:id/cancel', validate({ params: idParams, body: shuttleStaffCancelBody }), async (req, res) => {
  res.json({ shuttle: await cancelShuttleByStaff(req.auth as AuthContext, (req.valid.params as { id: string }).id, (req.valid.body as { note: string }).note, String(req.id)) });
});

// Theo dõi xe của khách: Bearer guestToken (cấp sau khi tra cứu mã + SĐT đúng), CHỈ đơn trong token. Không dùng strictRateLimit (bản đồ hỏi lại thường xuyên):
// giới hạn riêng 120/phút theo đơn (token), token sai bị authenticate chặn 401 trước và vẫn nằm dưới giới hạn chung theo IP của /v1.
export const trackShuttleRouter = Router();
trackShuttleRouter.get(
  '/shuttle',
  authenticate,
  rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => `track:${(req as { auth?: AuthContext }).auth?.bookingCode ?? 'x'}`,
    validate: { keyGeneratorIpFallback: false },
    message: (req: { id?: unknown }) => ({ error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau', details: undefined, requestId: String(req.id ?? '') } }),
  }),
  async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.kind !== 'GUEST' || !auth.bookingCode) throw new AppError(403, 'FORBIDDEN', 'Chỉ dành cho token theo dõi của khách');
    const b = (await db.query<{ id: string; status: BookingStatus; hotelId: string; hotelSnapshot: { name: string } }>('SELECT id, status, hotel_id, hotel_snapshot FROM bookings WHERE code = $1', [auth.bookingCode])).rows[0];
    if (!b) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn');
    res.json(await guestShuttleState(b)); // { stage, shuttles[].trips[] (có route + position khi OWN chạy), events }
  },
);
