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
