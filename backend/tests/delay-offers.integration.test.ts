import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../api/middleware/errorHandler';
import { hotelDelayRouter } from '../api/modules/hotelDelay/hotelDelay.router';
import { PERM } from '../config/permissions';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { expireOverdueBookings } from '../services/bookings/decisions';
import { delayBus, type DelayEvent } from '../services/delay/events';
import { confirmOffer, expireOffer, rejectOffer, sweepExpiredOffers } from '../services/delay/offers';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: offer delay (xác nhận / từ chối / hết hạn / chuyển KS)', () => {
  const hotels: string[] = [];
  const rtOf: Record<string, string> = {};
  const auths: Record<string, any> = {};
  const tokens: Record<string, string> = {};
  let payer = '', station = '', batch = '', flight = '';
  const from = new Date(Date.now() + 2 * DAY), to = new Date(Date.now() + 3 * DAY);
  const events: DelayEvent[] = [];
  let seq = 0;

  const mkAuth = (h: string) => ({ sub: 'x', kind: 'ACCOUNT', accountType: 'HOTEL', hotelId: h, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] }) as any;
  const mkGroup = async (people: Array<{ age: number; rep?: boolean }>) => {
    const n = ++seq;
    const pnr = `PNR${String(n).padStart(3, '0')}`;
    const groupId = (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, no_split) VALUES ($1,$2,$3) RETURNING id', [batch, pnr, people.length > 1]))!.id;
    const paxIds: string[] = [];
    for (const [i, p] of people.entries()) {
      paxIds.push((await one<{ id: string }>(
        `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, is_representative) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [payer, station, flight, groupId, pnr, `Khach ${n} ${i}`, p.age, p.age < 2 ? 'INFANT' : p.age < 12 ? 'CHILD' : 'ADULT', i === 0],
      ))!.id);
    }
    return { groupId, paxIds, pnr };
  };
  // Một offer đang PENDING ở khách sạn `hotel` (booking PAYER thật qua createPayerBooking).
  const mkOffer = async (hotel: string, g: { groupId: string; paxIds: string[] }, extra: { transferCount?: number; rejected?: string[] } = {}) => {
    const b = await createPayerBooking({ hotelId: hotel, rooms: [{ roomTypeId: rtOf[hotel]!, qty: 1 }], from, to, guest: { fullName: 'Đại Diện', phone: '0912345678' }, guests: g.paxIds.length, batchId: batch, groupId: g.groupId });
    const id = (await one<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, transfer_count, rejected_hotel_ids, pax_ids) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8::uuid[],$9::uuid[]) RETURNING id`,
      [batch, g.groupId, b.id, hotel, rtOf[hotel], b.expiresAt, extra.transferCount ?? 0, extra.rejected ?? [], g.paxIds],
    ))!.id;
    return { id, bookingId: b.id };
  };
  const offersOf = (groupId: string) => db.query<any>('SELECT * FROM delay_room_offers WHERE group_id = $1 ORDER BY seq', [groupId]).then((r) => r.rows);
  const bookingStatus = async (id: string) => (await one<any>('SELECT status FROM bookings WHERE id = $1', [id]))!.status;
  const groupStatus = async (id: string) => (await one<any>('SELECT status FROM delay_groups WHERE id = $1', [id]))!.status;
  const pastDue = (id: string) => db.query("UPDATE delay_room_offers SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);

  beforeAll(async () => {
    await freshDb({ roles: true });
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('OF','Offer Co','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN9','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    batch = (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id) VALUES ($1,$2,$3) RETURNING id', [payer, station, flight]))!.id;
    for (let i = 0; i < 5; i++) {
      const h = await mkHotel({ code: `OF${i}` });
      const rt = await mkRoomType(h, 50, 600_000, { code: `R${i}` });
      await db.query('UPDATE room_types SET capacity = 2 WHERE id = $1', [rt]);
      await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, valid_from) VALUES ($1,$2,$3,450000,'2020-01-01')", [payer, h, rt]);
      hotels.push(h); rtOf[h] = rt; auths[h] = mkAuth(h);
      tokens[h] = (await mkStaff(h, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    }
    delayBus.on('event', (e: DelayEvent) => events.push(e));
  });
  afterAll(async () => closeDb());

  it('confirm: số phòng bắt buộc, sai số lượng -> 422, KS khác -> 404; booking CONFIRMED, nhóm CONFIRMED', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[0]!, g);
    await expect(confirmOffer(o.id, [], auths[hotels[0]!])).rejects.toMatchObject({ status: 422, code: 'ROOM_NUMBERS_MISMATCH' });
    await expect(confirmOffer(o.id, ['101', '102'], auths[hotels[0]!])).rejects.toMatchObject({ status: 422 });
    await expect(confirmOffer(o.id, ['101'], auths[hotels[1]!])).rejects.toMatchObject({ status: 404 });
    await expect(rejectOffer(o.id, 'x', auths[hotels[1]!])).rejects.toMatchObject({ status: 404 });
    expect(await bookingStatus(o.bookingId)).toBe('PENDING');
    await confirmOffer(o.id, ['101'], auths[hotels[0]!]);
    const [row] = await offersOf(g.groupId);
    expect(row).toMatchObject({ status: 'CONFIRMED', roomNumbers: ['101'] });
    expect(row.respondedAt).toBeTruthy();
    expect(await bookingStatus(o.bookingId)).toBe('CONFIRMED');
    expect(await groupStatus(g.groupId)).toBe('CONFIRMED');
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_OFFER_CONFIRMED'", [o.bookingId])).toBe(1);
    await expect(confirmOffer(o.id, ['101'], auths[hotels[0]!])).rejects.toMatchObject({ status: 409 });
  });

  it('reject: chuyển NGAY sang KS khác, booking cũ REJECTED + nhả HOLD, không hoàn tiền, offer mới transfer_count+1, không gửi lại KS cũ', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[0]!, g);
    events.length = 0;
    await rejectOffer(o.id, 'Hết phòng', auths[hotels[0]!]);
    expect(await bookingStatus(o.bookingId)).toBe('REJECTED');
    expect((await one<any>("SELECT count(*)::int AS n FROM room_reservations WHERE booking_id = $1 AND state = 'HOLD'", [o.bookingId]))!.n).toBe(0);
    expect(await count('refunds', 'booking_id = $1', [o.bookingId])).toBe(0);
    const [old, next] = await offersOf(g.groupId);
    expect(old).toMatchObject({ status: 'REJECTED', rejectReason: 'Hết phòng' });
    expect(next).toMatchObject({ status: 'PENDING', transferCount: 1, paxIds: g.paxIds });
    expect(next.hotelId).not.toBe(hotels[0]);
    expect(next.rejectedHotelIds).toContain(hotels[0]);
    expect(await bookingStatus(next.bookingId)).toBe('PENDING');
    expect((await one<any>('SELECT pricing FROM bookings WHERE id = $1', [next.bookingId]))!.pricing.roomVnd).toBe(450_000); // giá hợp đồng
    expect(await groupStatus(g.groupId)).toBe('OFFERED');
    // realtime: đóng offer cũ + gửi offer mới, không PII
    expect(events.find((e) => e.type === 'offer:closed')).toMatchObject({ hotelId: hotels[0], payload: { offerId: o.id, status: 'REJECTED' } });
    const sent = events.find((e) => e.type === 'offer') as Extract<DelayEvent, { type: 'offer' }>;
    expect(sent.hotelId).toBe(next.hotelId);
    expect(Object.keys(sent.payload).sort()).toEqual(['cluster', 'expiresAt', 'groupId', 'offerId', 'rooms']);
    await expect(rejectOffer(o.id, 'lại', auths[hotels[0]!])).rejects.toMatchObject({ status: 409 });
  });

  it('hết hạn qua sweep -> chuyển; offer chưa hết hạn không bị quét', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[0]!, g);
    await sweepExpiredOffers();
    expect((await offersOf(g.groupId)).length).toBe(1);
    await pastDue(o.id);
    await sweepExpiredOffers();
    const [old, next] = await offersOf(g.groupId);
    expect(old.status).toBe('EXPIRED');
    expect(await bookingStatus(o.bookingId)).toBe('EXPIRED');
    expect(await count('refunds', 'booking_id = $1', [o.bookingId])).toBe(0);
    expect(next).toMatchObject({ status: 'PENDING', transferCount: 1 });
    expect(next.hotelId).not.toBe(hotels[0]);
  });

  it('cụm có trẻ em chuyển nguyên cụm (một offer mới chứa đủ khách)', async () => {
    const g = await mkGroup([{ age: 35 }, { age: 6 }]);
    const o = await mkOffer(hotels[0]!, g);
    await rejectOffer(o.id, 'Không nhận', auths[hotels[0]!]);
    const rows = await offersOf(g.groupId);
    expect(rows).toHaveLength(2);
    expect([...rows[1].paxIds].sort()).toEqual([...g.paxIds].sort());
    expect(rows[1].status).toBe('PENDING');
  });

  it('không quay lại KS đã từ chối; quá 3 lần chuyển -> FAILED + cảnh báo đỏ quầy (không PII)', async () => {
    const g = await mkGroup([{ age: 30 }]);
    let cur = await mkOffer(hotels[0]!, g);
    events.length = 0;
    const seen = [hotels[0]];
    for (let i = 0; i < 3; i++) {
      const row = (await one<any>('SELECT hotel_id FROM delay_room_offers WHERE id = $1', [cur.id]))!;
      await rejectOffer(cur.id, 'từ chối', auths[row.hotelId]);
      const last = (await offersOf(g.groupId)).at(-1);
      expect(seen).not.toContain(last.hotelId);
      seen.push(last.hotelId);
      cur = { id: last.id, bookingId: last.bookingId };
    }
    expect(await groupStatus(g.groupId)).toBe('OFFERED');
    await rejectOffer(cur.id, 'từ chối lần 4', auths[seen.at(-1)!]); // transfer_count = 3 -> hết lượt
    expect(await groupStatus(g.groupId)).toBe('FAILED');
    expect(await offersOf(g.groupId)).toHaveLength(4);
    const alert = events.find((e) => e.type === 'alert') as Extract<DelayEvent, { type: 'alert' }>;
    expect(alert).toMatchObject({ payerId: payer, stationId: station, payload: { kind: 'DELAY_TRANSFER_FAILED', reason: 'MAX_TRANSFERS', groupId: g.groupId } });
    expect(JSON.stringify(alert)).not.toMatch(/Khach|0912/);
  });

  it('quá 15 phút kể từ lượt gửi đầu -> FAILED + cảnh báo', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[0]!, g);
    await db.query("UPDATE delay_room_offers SET created_at = now() - interval '16 minutes' WHERE id = $1", [o.id]);
    events.length = 0;
    await rejectOffer(o.id, 'không', auths[hotels[0]!]);
    expect(await groupStatus(g.groupId)).toBe('FAILED');
    expect(await offersOf(g.groupId)).toHaveLength(1);
    expect(events.find((e) => e.type === 'alert')).toMatchObject({ payload: { reason: 'MAX_WAIT' } });
  });

  it('confirm và expire đồng thời: chỉ một bên thắng, trạng thái nhất quán', async () => {
    for (let i = 0; i < 4; i++) {
      const g = await mkGroup([{ age: 30 }]);
      const o = await mkOffer(hotels[0]!, g);
      const [c, e] = await Promise.allSettled([confirmOffer(o.id, ['201'], auths[hotels[0]!]), expireOffer(o.id)]);
      const rows = await offersOf(g.groupId);
      if (c.status === 'fulfilled') {
        expect(e).toMatchObject({ status: 'fulfilled', value: false });
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('CONFIRMED');
        expect(await bookingStatus(o.bookingId)).toBe('CONFIRMED');
      } else {
        expect(e).toMatchObject({ status: 'fulfilled', value: true });
        expect(rows[0].status).toBe('EXPIRED');
        expect(rows).toHaveLength(2);
        expect(await bookingStatus(o.bookingId)).toBe('EXPIRED');
      }
    }
  });

  it('job cũ expireOverdueBookings không đụng đơn PAYER', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[0]!, g);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = $1", [o.bookingId]);
    await expireOverdueBookings();
    expect(await bookingStatus(o.bookingId)).toBe('PENDING');
    expect((await offersOf(g.groupId))[0].status).toBe('PENDING');
  });

  it('API KS: liệt kê (không PII), confirm/reject theo hotelScope', async () => {
    const g = await mkGroup([{ age: 30 }]);
    const o = await mkOffer(hotels[2]!, g);
    // Router chưa được đăng ký ở modules/index.ts (người điều phối làm) nên gắn riêng ở đây.
    const app = express().use(express.json()).use('/api/v1/hotel/delay-offers', hotelDelayRouter).use(errorHandler);
    const auth = (h: string) => ({ Authorization: `Bearer ${tokens[h]}` });
    const list = await request(app).get('/api/v1/hotel/delay-offers?status=PENDING').set(auth(hotels[2]!));
    expect(list.status).toBe(200);
    const item = list.body.items.find((x: any) => x.id === o.id);
    expect(item).toMatchObject({ representative: 'Đại Diện', guests: 1, roomType: 'Deluxe' });
    expect(item.secondsLeft).toBeGreaterThan(200);
    expect(JSON.stringify(item)).not.toContain('0912345678');
    expect((await request(app).get('/api/v1/hotel/delay-offers').set(auth(hotels[3]!))).body.items.find((x: any) => x.id === o.id)).toBeUndefined();
    expect((await request(app).post(`/api/v1/hotel/delay-offers/${o.id}/confirm`).set(auth(hotels[3]!)).send({ roomNumbers: ['1'] })).status).toBe(404);
    expect((await request(app).post(`/api/v1/hotel/delay-offers/${o.id}/confirm`).set(auth(hotels[2]!)).send({ roomNumbers: [] })).status).toBe(422);
    expect((await request(app).post(`/api/v1/hotel/delay-offers/${o.id}/confirm`).set(auth(hotels[2]!)).send({ roomNumbers: ['305'] })).status).toBe(200);
    expect((await request(app).get('/api/v1/hotel/delay-offers')).status).toBe(401);
  });
});
