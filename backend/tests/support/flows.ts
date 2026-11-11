import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { db, one } from './db';

type App = Parameters<typeof request>[0];
const DAY = 86400_000;

// app đã `trust proxy 1`: mỗi n là một bucket rate limit riêng.
export const guestIp = (n: number): Record<string, string> => ({ 'X-Forwarded-For': `10.9.0.${n}` });

export async function createBookingVia(app: App, o: { hotelId: string; roomTypeId: string; phone?: string; paymentMethod?: 'AT_HOTEL' | 'VNPAY'; qty?: number; offDays?: number }) {
  const phone = o.phone ?? '0912345678';
  const off = o.offDays ?? 10;
  const res = await request(app)
    .post('/v1/bookings')
    .set('Idempotency-Key', `fl-${randomUUID()}`)
    .send({
      hotelId: o.hotelId, roomTypeId: o.roomTypeId, qty: o.qty ?? 1, paymentMethod: o.paymentMethod ?? 'AT_HOTEL',
      from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(),
      guest: { fullName: 'Khách Test', phone },
    });
  if (res.status !== 201) throw new Error(`createBookingVia ${res.status} ${JSON.stringify(res.body)}`);
  const code = res.body.booking.code as string;
  return { id: (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [code]))!.id, code, phone };
}

export async function setStay(bookingId: string, from: Date, nights = 1) {
  const to = new Date(from.getTime() + nights * DAY);
  await db.query("UPDATE bookings SET stay = jsonb_build_object('type','NIGHT','from',$2::timestamptz,'to',$3::timestamptz,'nights',$4::int), stay_from = $2 WHERE id = $1", [bookingId, from, to, nights]);
  await db.query('UPDATE room_reservations SET starts_at = $2, ends_at = $3 WHERE booking_id = $1', [bookingId, from, to]);
}

const RES_STATE: Record<string, string> = { CONFIRMED: 'CONFIRMED', CHECKED_IN: 'CHECKED_IN', PENDING: 'HOLD' };
export async function setStatus(bookingId: string, status: string) {
  await db.query('UPDATE bookings SET status = $2 WHERE id = $1', [bookingId, status]);
  if (RES_STATE[status]) await db.query('UPDATE room_reservations SET state = $2 WHERE booking_id = $1', [bookingId, RES_STATE[status]]);
}

// Đơn VNPAY: giả lập cổng báo thành công để có paid_vnd + payment SUCCEEDED.
export async function payBooking(app: App, code: string) {
  const p = (await one<{ txnRef: string }>('SELECT p.txn_ref FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.code = $1 ORDER BY p.created_at DESC LIMIT 1', [code]))!;
  const res = await request(app).post('/v1/payments/vnpay/dev-simulate').send({ orderId: p.txnRef });
  if (res.status !== 200) throw new Error(`payBooking ${res.status}`);
}

