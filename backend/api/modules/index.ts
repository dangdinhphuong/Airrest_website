import { Router } from 'express';
import { adminRouter } from './admin/admin.router';
import { authRouter } from './auth/auth.router';
import { bookingsRouter, hotelBookingsRouter } from './bookings/bookings.router';
import { paymentsRouter } from './payments/payments.router';
import { hotelsRouter } from './hotels/hotels.router';
import { roomBlocksRouter, roomTypesRouter } from './rooms/rooms.router';

// Gắn mọi module vào /v1. Thêm module mới: tạo thư mục modules/<ten>/ rồi thêm 1 dòng ở đây.
export const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/hotels', hotelsRouter);
v1Router.use('/bookings', bookingsRouter);
v1Router.use('/hotel/bookings', hotelBookingsRouter);
v1Router.use('/hotel/room-types', roomTypesRouter);
v1Router.use('/hotel/room-blocks', roomBlocksRouter);
v1Router.use('/payments', paymentsRouter);
v1Router.use('/admin', adminRouter);
