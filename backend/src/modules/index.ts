import { Router } from 'express';
import { adminRouter } from './admin/admin.router';
import { authRouter } from './auth/auth.router';
import { bookingsRouter, hotelBookingsRouter } from './bookings/bookings.router';
import { hotelsRouter } from './hotels/hotels.router';

// Gắn mọi module vào /v1. Thêm module mới: tạo thư mục modules/<ten>/ rồi thêm 1 dòng ở đây.
export const v1Router = Router();
v1Router.use('/auth', authRouter);
v1Router.use('/hotels', hotelsRouter);
v1Router.use('/bookings', bookingsRouter);
v1Router.use('/hotel/bookings', hotelBookingsRouter);
v1Router.use('/admin', adminRouter);
