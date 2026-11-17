import { Router } from 'express';
import { authenticate, requirePassenger } from '../../middleware/auth';
import { passengerAuthRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  changePassengerPassword,
  changePasswordBody,
  listPassengerBookings,
  listPassengerTickets,
  loginBody,
  loginPassenger,
  meBookingsQuery,
  meTicketsQuery,
  patchProfileBody,
  registerBody,
  registerPassenger,
  updatePassengerProfile,
} from '../../../services/passengers/passengers.service';
import { addFavorite, hotelIdParams, listFavorites, listNotifications, listVouchers, markNotificationsRead, removeFavorite } from '../../../services/passengers/extras';
import type { z } from 'zod';

// /v1/auth/passenger/{register,login}: công khai, rate limit chặt.
export const passengerAuthRouter = Router();
passengerAuthRouter.post('/register', passengerAuthRateLimit, validate({ body: registerBody }), async (req, res) => {
  res.status(201).json(await registerPassenger(req.valid.body as z.infer<typeof registerBody>, String(req.id)));
});
passengerAuthRouter.post('/login', passengerAuthRateLimit, validate({ body: loginBody }), async (req, res) => {
  res.json(await loginPassenger(req.valid.body as z.infer<typeof loginBody>));
});

// /v1/me/*: chỉ tài khoản khách đã đăng nhập; mọi truy vấn khóa theo sub trong token.
export const meRouter = Router();
meRouter.use(authenticate, requirePassenger);
meRouter.patch('/password', passengerAuthRateLimit, validate({ body: changePasswordBody }), async (req, res) => {
  await changePassengerPassword(req.auth!.sub, req.valid.body as z.infer<typeof changePasswordBody>, String(req.id));
  res.status(204).end();
});
// Sửa họ tên / cấu hình cá nhân (sân bay, số khách, thanh toán mặc định); không nhận SĐT/email (BR-002).
meRouter.patch('/profile', validate({ body: patchProfileBody }), async (req, res) => {
  res.json({ user: await updatePassengerProfile(req.auth!.sub, req.valid.body as z.infer<typeof patchProfileBody>, String(req.id)) });
});
meRouter.get('/tickets', validate({ query: meTicketsQuery }), async (req, res) => {
  res.json(await listPassengerTickets(req.auth!.sub, req.valid.query as z.infer<typeof meTicketsQuery>));
});
meRouter.get('/bookings', validate({ query: meBookingsQuery }), async (req, res) => {
  res.json(await listPassengerBookings(req.auth!.sub, req.valid.query as z.infer<typeof meBookingsQuery>));
});

// Yêu thích / thông báo / mã giảm giá của khách.
meRouter.get('/favorites', async (req, res) => { res.json(await listFavorites(req.auth!.sub)); });
meRouter.put('/favorites/:hotelId', validate({ params: hotelIdParams }), async (req, res) => {
  await addFavorite(req.auth!.sub, (req.valid.params as { hotelId: string }).hotelId);
  res.status(204).end();
});
meRouter.delete('/favorites/:hotelId', validate({ params: hotelIdParams }), async (req, res) => {
  await removeFavorite(req.auth!.sub, (req.valid.params as { hotelId: string }).hotelId);
  res.status(204).end();
});
meRouter.get('/notifications', async (req, res) => { res.json(await listNotifications(req.auth!.sub)); });
meRouter.post('/notifications/read', async (req, res) => { await markNotificationsRead(req.auth!.sub); res.status(204).end(); });
meRouter.get('/vouchers', async (_req, res) => { res.json(await listVouchers()); });
