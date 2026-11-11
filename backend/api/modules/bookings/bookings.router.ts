import { Router } from 'express';
import { PERM } from '../../../config/permissions';
import { signGuestToken, type AuthContext } from '../../../lib/jwt';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  createBookingBody,
  idParams,
  lookupBody,
  rejectBookingBody,
  staffListQuery,
  type CreateBookingBody,
  type LookupBody,
  type RejectBookingBody,
  type StaffListQuery,
} from '@airrest/validation';
import { startBookingPayment } from '../../../services/payments/payments.service';
import { hotelScope } from '../../../services/scope';
import { confirmBooking, rejectBooking } from '../../../services/bookings/decisions';
import { checkIn, createBooking, getBookingDetail, getDecision, listHotelBookings, lookupBooking, toGuestView } from '../../../services/bookings/bookings.service';

// ---- Công khai (khách vãng lai, không cần tài khoản) ----
export const bookingsRouter = Router();

// FR-BKG-07/10/11: tạo đơn. Bắt buộc Idempotency-Key để bấm lặp/mạng chập không tạo đơn thứ hai.
bookingsRouter.post('/', validate({ body: createBookingBody }), idempotent('booking.create'), async (req, res) => {
  const booking = await createBooking(req.valid.body as CreateBookingBody, String(req.id));
  if (booking.payment.method !== 'VNPAY') return void res.status(201).json({ booking: toGuestView(booking) });
  // VNPay lỗi thì đơn vẫn giữ chỗ (PENDING_PAYMENT); khách lấy lại link ở POST /v1/payments/vnpay/link.
  const paymentLink = await startBookingPayment(booking.id, booking.code).catch((e: { code?: string }) => ({ error: e.code ?? 'VNPAY_UNAVAILABLE' }));
  res.status(201).json({ booking: toGuestView(booking), paymentLink });
});

// FR-BKG-08: tra cứu bằng Booking Code + SĐT. Trả thêm guestToken ngắn hạn để vào phòng Socket.io `booking:{code}`.
bookingsRouter.post('/lookup', strictRateLimit, validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ booking: toGuestView(booking, await getDecision(booking.id)), guestToken: signGuestToken(booking.code) });
});

// ---- Cổng khách sạn (cần đăng nhập + quyền, tự khóa theo hotelId trong token) ----
export const hotelBookingsRouter = Router();
hotelBookingsRouter.use(authenticate);

hotelBookingsRouter.get('/', requirePermission(PERM.BOOKING_READ), validate({ query: staffListQuery }), async (req, res) => {
  res.json(await listHotelBookings(req.auth as AuthContext, req.valid.query as StaffListQuery));
});

hotelBookingsRouter.get('/:id', requirePermission(PERM.BOOKING_READ), validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json(await getBookingDetail(hotelScope(req.auth as AuthContext), id));
});

hotelBookingsRouter.post(
  '/:id/check-in',
  requirePermission(PERM.BOOKING_CHECKIN),
  validate({ params: idParams }),
  async (req, res) => {
    const { id } = req.valid.params as { id: string };
    res.json({ booking: await checkIn(req.auth as AuthContext, id, String(req.id)) });
  },
);

// Khách sạn (hoặc admin có booking:decide + hotel:scope:all) xác nhận / từ chối đơn chờ. Từ chối bắt buộc lý do, kèm tối đa 3 gợi ý.
hotelBookingsRouter.post('/:id/confirm', requirePermission(PERM.BOOKING_DECIDE), validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json({ booking: await confirmBooking(req.auth as AuthContext, id, String(req.id)) });
});

hotelBookingsRouter.post('/:id/reject', requirePermission(PERM.BOOKING_DECIDE), validate({ params: idParams, body: rejectBookingBody }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { reason } = req.valid.body as RejectBookingBody;
  res.json(await rejectBooking(req.auth as AuthContext, id, { reason }, String(req.id)));
});
