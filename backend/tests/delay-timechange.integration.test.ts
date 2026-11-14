import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../api/middleware/errorHandler';
import { hotelExtensionsRouter, payerExtensionsRouter } from '../api/modules/delayTimeChange/delayTimeChange.router';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { delayBus, type DelayEvent } from '../services/delay/events';
import { confirmOffer } from '../services/delay/offers';
import { onFlightTimeChanged } from '../services/delay/timeChange';
import { updateFlight } from '../services/flights/flights.service';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const H = 3600_000;
const LEAD = 145 * 60_000; // 120' có mặt + 15' dự phòng + 10' xe (mkHotel)

run('tích hợp: đổi giờ bay / hủy chuyến sau khi đặt phòng (GĐ4)', () => {
  let payer = '', station = '', payerTok = '', otherPayerTok = '', hotel = '', rt = '', hotelTok = '', otherHotelTok = '', seq = 0;
  const events: DelayEvent[] = [];
  const app = express().use(express.json()).use('/v1/payer', payerExtensionsRouter).use('/v1/hotel/delay-offers', hotelExtensionsRouter).use(errorHandler);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const alerts = (kind: string) => events.filter((e) => e.type === 'alert' && e.payload.kind === kind) as Extract<DelayEvent, { type: 'alert' }>[];
  const authOf = (h: string) => ({ sub: 'x', kind: 'ACCOUNT', accountType: 'HOTEL', hotelId: h, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] }) as any;

  const mkPayerTok = async (payerId: string) => {
    const id = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, [await systemRoleId('payer_staff')]]);
    return signAccountToken({ sub: id, accountType: 'PAYER' });
  };

  // Chuyến + lô + một offer CONFIRMED: ở từ now+1h tới giờ rời to = now+10h, chuyến bay lúc to + 145'.
  async function scenario(o: { hotelId?: string; rtId?: string } = {}) {
    const n = ++seq;
    const from = new Date(Date.now() + H), to = new Date(Date.now() + 10 * H);
    const dep = new Date(to.getTime() + LEAD);
    const flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, new_dep, status, cause, simulated) VALUES ($1,'VNA','HAN',$2,$3,'DELAYED','AIRLINE',true) RETURNING id", [`VN${6000 + n}`, new Date(dep.getTime() - 5 * H), dep]))!.id;
    const batch = (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id) VALUES ($1,$2,$3) RETURNING id', [payer, station, flight]))!.id;
    const groupId = (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, no_split, code) VALUES ($1,$2,false,$3) RETURNING id', [batch, `PNR${String(n).padStart(3, "0")}`, `NH-TC${String(n).padStart(6, '0')}`]))!.id;
    const paxId = (await one<{ id: string }>("INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, is_representative, email) VALUES ($1,$2,$3,$4,$5,$6,30,'ADULT',true,$7) RETURNING id", [payer, station, flight, groupId, `PNR${String(n).padStart(3, "0")}`, `Khach ${n}`, `k${n}@example.com`]))!.id;
    const h = o.hotelId ?? hotel, r = o.rtId ?? rt;
    const b = await createPayerBooking({ hotelId: h, rooms: [{ roomTypeId: r, qty: 1 }], from, to, guest: { fullName: 'Đại Diện', phone: '0912345678' }, guests: 1, batchId: batch, groupId, contractRoomVnd: 450_000 });
    const offerId = (await one<{ id: string }>('INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, pax_ids) VALUES ($1,$2,$3,$4,$5,1,$6,$7::uuid[]) RETURNING id', [batch, groupId, b.id, h, r, b.expiresAt, [paxId]]))!.id;
    await confirmOffer(offerId, ['101'], authOf(h));
    events.length = 0;
    return { flight, batch, groupId, offerId, bookingId: b.id, from, to, dep };
  }
  const stayTo = async (bookingId: string) => new Date((await one<any>('SELECT stay FROM bookings WHERE id = $1', [bookingId]))!.stay.to);
  const resEnd = async (bookingId: string) => (await one<any>("SELECT max(ends_at) AS e FROM room_reservations WHERE booking_id = $1 AND state = 'CONFIRMED'", [bookingId]))!.e as Date;
  const offerRow = (id: string) => one<any>('SELECT * FROM delay_room_offers WHERE id = $1', [id]);
  const toAirport = (bookingId: string) => one<any>("SELECT * FROM shuttle_requests WHERE booking_id = $1 AND direction = 'TO_AIRPORT' AND status <> 'CANCELLED'", [bookingId]);

  beforeAll(async () => {
    await freshDb({ roles: true });
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('TC','Time Co','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    const p2 = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('TD','Other Co','AIRLINE') RETURNING id"))!.id;
    payerTok = await mkPayerTok(payer);
    otherPayerTok = await mkPayerTok(p2);
    hotel = await mkHotel({ code: 'TC1' });
    rt = await mkRoomType(hotel, 50, 600_000, { code: 'T1' });
    await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, valid_from) VALUES ($1,$2,$3,450000,'2020-01-01')", [payer, hotel, rt]);
    hotelTok = (await mkStaff(hotel, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    otherHotelTok = (await mkStaff(await mkHotel({ code: 'TC2' }), [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    delayBus.on('event', (e: DelayEvent) => events.push(e));
  });
  afterAll(async () => closeDb());

  it('bay SỚM: tự rút ngắn stay + hold + xe TO_AIRPORT, email đổi giờ, booking_events; chuyến không có offer thì không làm gì', async () => {
    const s = await scenario();
    const newDep = new Date(s.dep.getTime() - 3 * H);
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: newDep, status: 'DELAYED' });
    const want = new Date(newDep.getTime() - LEAD);
    expect((await stayTo(s.bookingId)).getTime()).toBe(want.getTime());
    expect((await resEnd(s.bookingId)).getTime()).toBe(want.getTime()); // cleaningBufferMin = 0
    expect((await toAirport(s.bookingId)).pickupAt.getTime()).toBe(want.getTime());
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_STAY_SHORTENED'", [s.bookingId])).toBe(1);
    expect(await count('email_outbox', "booking_id = $1 AND template = 'room-changed'", [s.bookingId])).toBe(1);
    expect(events.filter((e) => e.type === 'alert')).toHaveLength(0);
    // gọi lại cùng giờ: không đổi, không thêm thư
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: newDep, status: 'DELAYED' });
    expect(await count('email_outbox', "booking_id = $1 AND template = 'room-changed'", [s.bookingId])).toBe(1);
    // chuyến không có offer
    const lone = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN7777','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    const before = events.length;
    await expect(onFlightTimeChanged({ flightId: lone, fromDep: null, toDep: new Date(), status: 'DELAYED' })).resolves.toBeUndefined();
    expect(events.length).toBe(before);
  });

  it('bay sớm đến mức giờ rời đã qua: báo khẩn, KHÔNG đổi gì', async () => {
    const s = await scenario();
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: new Date(Date.now() + 60 * 60_000), status: 'DELAYED' });
    expect((await stayTo(s.bookingId)).getTime()).toBe(s.to.getTime());
    expect(alerts('FLIGHT_EARLIER_URGENT')).toHaveLength(1);
    expect(alerts("FLIGHT_EARLIER_URGENT")[0]!.payload).toMatchObject({ groupId: s.groupId, batchId: s.batch });
    expect(await count('email_outbox', "booking_id = $1 AND template = 'room-changed'", [s.bookingId])).toBe(0);
  });

  it('bay MUỘN: không đổi gì, ghi đề xuất + cảnh báo (không PII, idempotent); request -> accept cập nhật stay/hold/xe/giá/thư', async () => {
    const s = await scenario();
    const newDep = new Date(s.dep.getTime() + 2 * H);
    const leave = new Date(newDep.getTime() - LEAD);
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: newDep, status: 'DELAYED' });
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: newDep, status: 'DELAYED' });
    expect((await stayTo(s.bookingId)).getTime()).toBe(s.to.getTime());
    expect(await offerRow(s.offerId)).toMatchObject({ extensionStatus: 'PROPOSED' });
    expect((await offerRow(s.offerId)).proposedLeaveAt.getTime()).toBe(leave.getTime());
    const a = alerts('FLIGHT_DELAYED_LATER');
    expect(a).toHaveLength(1);
    expect(Object.keys(a[0]!.payload).sort()).toEqual(['at', 'batchId', 'groupId', 'kind', 'offerId', 'proposedLeaveAt', 'reason']);

    // cô lập: payer khác -> 404; KS khác chưa tới lượt -> 404
    const url = `/v1/payer/batches/${s.batch}/extensions/request`;
    expect((await request(app).post(url).set(bearer(otherPayerTok)).send({})).status).toBe(404);
    expect((await request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(hotelTok))).status).toBe(409); // chưa REQUESTED
    events.length = 0;
    const rq = await request(app).post(url).set(bearer(payerTok)).send({});
    expect(rq.status).toBe(200);
    expect(rq.body.requested).toEqual([{ offerId: s.offerId, groupId: s.groupId, proposedLeaveAt: leave.toISOString() }]);
    expect(events.find((e) => e.type === 'extension')).toMatchObject({ hotelId: hotel, payload: { offerId: s.offerId } });
    expect((await request(app).post(url).set(bearer(payerTok)).send({})).status).toBe(409); // gửi trùng

    expect((await request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(otherHotelTok))).status).toBe(404);
    const ok = await request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(hotelTok));
    expect(ok.status).toBe(200);
    expect((await stayTo(s.bookingId)).getTime()).toBe(leave.getTime());
    expect((await resEnd(s.bookingId)).getTime()).toBe(leave.getTime());
    expect((await toAirport(s.bookingId)).pickupAt.getTime()).toBe(leave.getTime());
    expect(await offerRow(s.offerId)).toMatchObject({ extensionStatus: 'ACCEPTED' });
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_STAY_EXTENDED'", [s.bookingId])).toBe(1);
    expect(await count('email_outbox', "booking_id = $1 AND template = 'room-changed'", [s.bookingId])).toBe(1);
    expect((await one<any>('SELECT pricing FROM bookings WHERE id = $1', [s.bookingId]))!.pricing.roomVnd).toBe(450_000); // 1 đêm giá hợp đồng
    expect((await request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(hotelTok))).status).toBe(409);
  });

  it('hai lần accept đồng thời: chỉ một thắng', async () => {
    const s = await scenario();
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: new Date(s.dep.getTime() + H), status: 'DELAYED' });
    await request(app).post(`/v1/payer/batches/${s.batch}/extensions/request`).set(bearer(payerTok)).send({});
    const r = await Promise.all([1, 2].map(() => request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(hotelTok))));
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_STAY_EXTENDED'", [s.bookingId])).toBe(1);
  });

  it('accept khi hết phòng: 409 + báo quầy, stay không đổi; reject: cảnh báo EXTENSION_REJECTED', async () => {
    const h2 = await mkHotel({ code: 'TC3' });
    const rt2 = await mkRoomType(h2, 1, 600_000, { code: 'T3' });
    await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, valid_from) VALUES ($1,$2,$3,450000,'2020-01-01')", [payer, h2, rt2]);
    const tok2 = (await mkStaff(h2, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
    const s = await scenario({ hotelId: h2, rtId: rt2 });
    await createPayerBooking({ hotelId: h2, rooms: [{ roomTypeId: rt2, qty: 1 }], from: s.to, to: new Date(s.to.getTime() + 8 * H), guest: { fullName: 'Khách khác', phone: '0912345679' }, holdMinutes: 600 });
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: new Date(s.dep.getTime() + 2 * H), status: 'DELAYED' });
    await request(app).post(`/v1/payer/batches/${s.batch}/extensions/request`).set(bearer(payerTok)).send({});
    events.length = 0;
    const r = await request(app).post(`/v1/hotel/delay-offers/${s.offerId}/extension/accept`).set(bearer(tok2));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EXTENSION_NO_ROOM');
    expect((await stayTo(s.bookingId)).getTime()).toBe(s.to.getTime());
    expect(alerts('EXTENSION_NO_ROOM')).toHaveLength(1);
    expect(await offerRow(s.offerId)).toMatchObject({ extensionStatus: 'REJECTED' });

    const s2 = await scenario();
    await onFlightTimeChanged({ flightId: s2.flight, fromDep: s2.dep, toDep: new Date(s2.dep.getTime() + H), status: 'DELAYED' });
    await request(app).post(`/v1/payer/batches/${s2.batch}/extensions/request`).set(bearer(payerTok)).send({});
    events.length = 0;
    expect((await request(app).post(`/v1/hotel/delay-offers/${s2.offerId}/extension/reject`).set(bearer(otherHotelTok)).send({})).status).toBe(404);
    expect((await request(app).post(`/v1/hotel/delay-offers/${s2.offerId}/extension/reject`).set(bearer(hotelTok)).send({ reason: 'Hết phòng' })).status).toBe(200);
    expect(alerts('EXTENSION_REJECTED')).toHaveLength(1);
    expect((await stayTo(s2.bookingId)).getTime()).toBe(s2.to.getTime());
    expect((await request(app).post(`/v1/hotel/delay-offers/${s2.offerId}/extension/reject`).set(bearer(hotelTok)).send({})).status).toBe(409);
  });

  it('hủy chuyến / mất giờ bay: chỉ cảnh báo + ghi sự kiện, offer giữ nguyên', async () => {
    const s = await scenario();
    await onFlightTimeChanged({ flightId: s.flight, fromDep: s.dep, toDep: null, status: 'CANCELLED' });
    expect(alerts('FLIGHT_CANCELLED')).toHaveLength(1);
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_FLIGHT_CANCELLED'", [s.bookingId])).toBe(1);
    expect(await offerRow(s.offerId)).toMatchObject({ status: 'CONFIRMED', extensionStatus: 'NONE' });
    expect((await stayTo(s.bookingId)).getTime()).toBe(s.to.getTime());
    const u = await scenario();
    await onFlightTimeChanged({ flightId: u.flight, fromDep: u.dep, toDep: null, status: 'DELAYED' });
    expect(alerts('FLIGHT_TIME_UNKNOWN')).toHaveLength(1);
  });

  it('nối dây: admin đổi giờ (updateFlight) kích hoạt rút ngắn', async () => {
    const s = await scenario();
    const newDep = new Date(s.dep.getTime() - 2 * H);
    const admin = { sub: 'a', kind: 'ACCOUNT', accountType: 'ADMIN', permissions: [] } as any;
    await updateFlight(admin, s.flight, { status: 'DELAYED', newDepartureAt: newDep.toISOString(), reason: 'Bay sớm hơn' } as any);
    expect((await stayTo(s.bookingId)).getTime()).toBe(newDep.getTime() - LEAD);
  });
});
