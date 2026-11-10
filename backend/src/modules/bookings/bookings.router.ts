import { Router } from 'express';
import { PERM } from '../../config/permissions';
import { signGuestToken, type AuthContext } from '../../lib/jwt';
import { authenticate, requirePermission } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { strictRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  createBookingBody,
  idParams,
  lookupBody,
  staffListQuery,
  type CreateBookingBody,
  type LookupBody,
  type StaffListQuery,
} from './bookings.schema';
import { checkIn, createBooking, listHotelBookings, lookupBooking, toGuestView } from './bookings.service';

// ---- Công khai (khách vãng lai, không cần tài khoản) ----
export const bookingsRouter = Router();

// FR-BKG-07/10/11: tạo đơn. Bắt buộc Idempotency-Key để bấm lặp/mạng chập không tạo đơn thứ hai.
bookingsRouter.post('/', validate({ body: createBookingBody }), idempotent('booking.create'), async (req, res) => {
  const booking = await createBooking(req.valid.body as CreateBookingBody, String(req.id));
  res.status(201).json({ booking: toGuestView(booking) });
});

// FR-BKG-08: tra cứu bằng Booking Code + SĐT. Trả thêm guestToken ngắn hạn để vào phòng Socket.io `booking:{code}`.
bookingsRouter.post('/lookup', strictRateLimit, validate({ body: lookupBody }), async (req, res) => {
  const { code, phone } = req.valid.body as LookupBody;
  const booking = await lookupBooking(code, phone);
  res.json({ booking: toGuestView(booking), guestToken: signGuestToken(booking.code) });
});

// ---- Cổng khách sạn (cần đăng nhập + quyền, tự khóa theo hotelId trong token) ----
export const hotelBookingsRouter = Router();
hotelBookingsRouter.use(authenticate);

hotelBookingsRouter.get('/', requirePermission(PERM.BOOKING_READ), validate({ query: staffListQuery }), async (req, res) => {
  res.json(await listHotelBookings(req.auth as AuthContext, req.valid.query as StaffListQuery));
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
