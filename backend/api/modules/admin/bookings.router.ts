import { Router } from 'express';
import { adminBookingListQuery, idParams, type AdminBookingListQuery } from '@airrest/validation';
import { PERM } from '../../../config/permissions';
import { getBookingDetail, listBookings } from '../../../services/bookings/bookings.service';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

// Admin xem booking của MỌI khách sạn (chỉ đọc). Quyền admin:booking:read riêng, không cần hotel:scope:all.
export const adminBookingsRouter = Router();
const need = requirePermission(PERM.ADMIN_BOOKING_READ);

adminBookingsRouter.get('/bookings', need, validate({ query: adminBookingListQuery }), async (req, res) => {
  res.json(await listBookings({}, req.valid.query as AdminBookingListQuery));
});

adminBookingsRouter.get('/bookings/:id', need, validate({ params: idParams }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  res.json(await getBookingDetail({}, id));
});
