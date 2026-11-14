import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERM } from '../config/permissions';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { confirmOffer, rejectOffer } from '../services/delay/offers';
import { createDelayShuttles } from '../services/delay/shuttles';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: xe đón/về cho đơn PAYER (GĐ3)', () => {
  const hotels: string[] = [];
  const rtOf: Record<string, string> = {};
  let payer = '', station = '', batch = '', flight = '', seq = 0;
  const from = new Date(Date.now() + 2 * DAY), to = new Date(Date.now() + 3 * DAY);
  const auth = (h: string) => ({ sub: 'x', kind: 'ACCOUNT', accountType: 'HOTEL', hotelId: h, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] }) as any;

  const mkVehicle = async (hotel: string, seats: number, childSeats: number) => {
    const acc = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, hotel_id) VALUES ($1,'DRIVER',$2,'x','Tài Xế','ACTIVE',$3)", [acc, `${acc.slice(0, 8)}@d.vn`, hotel]);
    await db.query("INSERT INTO hotel_drivers (account_id, hotel_id, full_name, phone) VALUES ($1,$2,'Tài Xế','+84988777666')", [acc, hotel]);
    await db.query('INSERT INTO vehicles (hotel_id, plate, seats, child_seats, driver_account_id) VALUES ($1,$2,$3,$4,$5)', [hotel, `30A-${String(++seq).padStart(5, '0')}`, seats, childSeats, acc]);
  };
  const mkGroup = async (people: Array<{ age: number; email?: string }>) => {
    const n = ++seq;
    const pnr = `PNR${String(n).padStart(3, '0')}`;
    const groupId = (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, no_split, code) VALUES ($1,$2,$3,$4) RETURNING id', [batch, pnr, people.length > 1, `NH-SH${String(n).padStart(6, '0')}`]))!.id;
    const paxIds: string[] = [];
    for (const [i, p] of people.entries()) {
      paxIds.push((await one<{ id: string }>(
        `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, is_representative, email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [payer, station, flight, groupId, pnr, `Khach ${n} ${i}`, p.age, p.age < 2 ? 'INFANT' : p.age < 12 ? 'CHILD' : 'ADULT', i === 0, p.email ?? null],
      ))!.id);
    }
    return { groupId, paxIds, n };
  };
  const mkOffer = async (hotel: string, g: { groupId: string; paxIds: string[] }) => {
    const b = await createPayerBooking({ hotelId: hotel, rooms: [{ roomTypeId: rtOf[hotel]!, qty: 1 }], from, to, guest: { fullName: 'Đại Diện Liên Hệ', phone: '0912345678' }, guests: g.paxIds.length, batchId: batch, groupId: g.groupId });
    const id = (await one<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, pax_ids) VALUES ($1,$2,$3,$4,$5,1,$6,$7::uuid[]) RETURNING id`,
      [batch, g.groupId, b.id, hotel, rtOf[hotel], b.expiresAt, g.paxIds],
    ))!.id;
    return { id, bookingId: b.id };
  };
  const reqs = (bookingId: string, status?: string) => db.query<any>("SELECT * FROM shuttle_requests WHERE booking_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY direction", [bookingId, status ?? null]).then((r) => r.rows);
  const trips = (bookingId: string, direction: string) => db.query<any>("SELECT t.* FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id WHERE t.booking_id = $1 AND r.direction = $2 AND t.status <> 'CANCELLED' ORDER BY t.seq", [bookingId, direction]).then((r) => r.rows);

  beforeAll(async () => {
    await freshDb({ roles: true });
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('SH','Shuttle Co','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN8','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    batch = (await one<{ id: string }>("INSERT INTO delay_batches (payer_id, station_id, flight_id, pickup_point) VALUES ($1,$2,$3,'Nhà ga T2 - cửa ra khu vực đón') RETURNING id", [payer, station, flight]))!.id;
    for (let i = 0; i < 5; i++) {
      const h = await mkHotel({ code: `SH${i}`, name: `KS Shuttle ${i}` });
      await db.query(`UPDATE hotels SET address = '{"line":"${i} Phố Xe","city":"Hà Nội"}'::jsonb WHERE id = $1`, [h]);
      const rt = await mkRoomType(h, 50, 600_000, { code: `S${i}` });
      await db.query('UPDATE room_types SET capacity = 8 WHERE id = $1', [rt]);
      await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, valid_from) VALUES ($1,$2,$3,450000,'2020-01-01')", [payer, h, rt]);
      hotels.push(h); rtOf[h] = rt;
    }
    await mkVehicle(hotels[0]!, 7, 0); // 0: một xe 7 chỗ
    await mkVehicle(hotels[1]!, 7, 0); // 1: xe không có ghế trẻ em
    await mkVehicle(hotels[2]!, 7, 3); // 2: xe có ghế trẻ em
    await mkVehicle(hotels[3]!, 4, 0); await mkVehicle(hotels[3]!, 4, 0); // 3: hai xe 4 chỗ
  });
  afterAll(async () => closeDb());

  it('confirm: 2 yêu cầu xe đúng giờ/điểm/số khách, không cộng tiền vào đơn PAYER, xe nhà được điều, confirm/tạo lặp không trùng, email có xe', async () => {
    const g = await mkGroup([{ age: 30, email: 'rep@example.com' }, { age: 31 }]);
    const o = await mkOffer(hotels[0]!, g);
    const before = (await one<any>('SELECT pricing, payment_method, payment_status, paid_vnd FROM bookings WHERE id = $1', [o.bookingId]))!;
    await confirmOffer(o.id, ['101'], auth(hotels[0]!));

    const [toAirport, toHotel] = await reqs(o.bookingId); // sắp theo direction: TO_AIRPORT < TO_HOTEL
    expect(toHotel).toMatchObject({ direction: 'TO_HOTEL', airportIata: 'HAN', passengers: 2, location: 'Nhà ga T2 - cửa ra khu vực đón', billed: false, status: 'REQUESTED' });
    expect(new Date(toHotel.pickupAt).getTime()).toBe(from.getTime());
    expect(toAirport).toMatchObject({ direction: 'TO_AIRPORT', passengers: 2, billed: false });
    expect(new Date(toAirport.pickupAt).getTime()).toBe(to.getTime());
    expect(toAirport.location).toContain('KS Shuttle 0');
    expect(toAirport.location).toContain('0 Phố Xe');
    expect(toHotel.note).toContain('Đại Diện Liên Hệ');
    expect(toHotel.note).toContain('Khach ' + g.n + ' 0');
    expect(toHotel.priceVnd).toBeGreaterThan(0);

    const after = (await one<any>('SELECT pricing, payment_method, payment_status, paid_vnd FROM bookings WHERE id = $1', [o.bookingId]))!;
    expect(after.pricing).toEqual(before.pricing); // giá xe không vào tổng đơn
    expect(after).toMatchObject({ paymentMethod: 'PAYER', paymentStatus: 'UNPAID', paidVnd: 0 });
    expect(await count('payments', 'booking_id = $1', [o.bookingId])).toBe(0);

    expect((await trips(o.bookingId, 'TO_HOTEL')).map((t) => [t.kind, t.status, t.seats])).toEqual([['OWN', 'OFFERED', 2]]);
    expect((await trips(o.bookingId, 'TO_AIRPORT')).map((t) => [t.kind, t.seats])).toEqual([['OWN', 2]]);
    expect(await count('booking_events', "booking_id = $1 AND type = 'SHUTTLE_REQUESTED'", [o.bookingId])).toBe(2);

    // Lặp: không tạo trùng yêu cầu/chuyến.
    await expect(confirmOffer(o.id, ['101'], auth(hotels[0]!))).rejects.toMatchObject({ status: 409 });
    await createDelayShuttles(o.id);
    expect(await count('shuttle_requests', 'booking_id = $1', [o.bookingId])).toBe(2);
    expect(await count('shuttle_trips', 'booking_id = $1', [o.bookingId])).toBe(2);

    // Email có giờ xe + điểm đón + "sẽ gửi sau" (xe tạo trước khi enqueue).
    const mail = (await one<any>("SELECT body_text FROM email_outbox WHERE template = 'room-confirmed' AND booking_id = $1", [o.bookingId]))!;
    expect(mail.bodyText).toContain('Xe đón');
    expect(mail.bodyText).toContain('Nhà ga T2 - cửa ra khu vực đón');
    expect(mail.bodyText).toContain('Xe về sân bay');
    expect(mail.bodyText).toContain('Sẽ gửi sau');
  });

  it('cụm có trẻ em, xe nhà không đủ ghế trẻ em: MỘT chuyến xe ngoài cho nguyên cụm (không tách)', async () => {
    const g = await mkGroup([{ age: 35 }, { age: 33 }, { age: 5 }]);
    const o = await mkOffer(hotels[1]!, g);
    await confirmOffer(o.id, ['201'], auth(hotels[1]!));
    for (const d of ['TO_HOTEL', 'TO_AIRPORT']) {
      expect((await trips(o.bookingId, d)).map((t) => [t.kind, t.status, t.seats])).toEqual([['EXTERNAL', 'NEEDS_EXTERNAL', 3]]);
    }
    expect(await count('booking_events', "booking_id = $1 AND type = 'DELAY_CHILD_CLUSTER' AND data->>'mode' = 'EXTERNAL_WHOLE_CLUSTER'", [o.bookingId])).toBe(2);
  });

  it('cụm có trẻ em, có xe nhà đủ ghế trẻ em: giao đúng xe đó, một chuyến', async () => {
    const g = await mkGroup([{ age: 35 }, { age: 5 }, { age: 1 }]);
    const o = await mkOffer(hotels[2]!, g);
    await confirmOffer(o.id, ['301'], auth(hotels[2]!));
    const t = await trips(o.bookingId, 'TO_HOTEL');
    expect(t.map((x) => [x.kind, x.status, x.seats])).toEqual([['OWN', 'OFFERED', 2]]); // em bé không chiếm ghế
    expect((await trips(o.bookingId, 'TO_AIRPORT')).map((x) => x.kind)).toEqual(['OWN']);
    expect((await one<any>('SELECT passengers FROM shuttle_requests WHERE booking_id = $1 AND direction = $2', [o.bookingId, 'TO_HOTEL']))!.passengers).toBe(3); // em bé vẫn tính người
  });

  it('cụm KHÔNG có trẻ em vẫn dùng nhiều xe nhà như cũ (5 người, 2 xe 4 chỗ)', async () => {
    const g = await mkGroup([{ age: 30 }, { age: 30 }, { age: 30 }, { age: 30 }, { age: 30 }]);
    const o = await mkOffer(hotels[3]!, g);
    await confirmOffer(o.id, ['401'], auth(hotels[3]!));
    expect((await trips(o.bookingId, 'TO_HOTEL')).map((t) => [t.kind, t.seats]).sort()).toEqual([['OWN', 1], ['OWN', 4]]);
  });

  it('reject hủy xe của booking cũ; chuyển KS và xác nhận ở KS mới tạo lại 2 xe cho booking mới', async () => {
    const g = await mkGroup([{ age: 30 }, { age: 29 }]);
    const o = await mkOffer(hotels[4]!, g);
    await db.query("INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, price_vnd, config_version) VALUES ($1,$2,'TO_HOTEL','HAN',5,$3,0,1)", [o.bookingId, hotels[4], from]);
    await rejectOffer(o.id, 'Hết phòng', auth(hotels[4]!));
    expect((await reqs(o.bookingId)).map((r) => r.status)).toEqual(['CANCELLED']);
    const next = (await db.query<any>("SELECT * FROM delay_room_offers WHERE group_id = $1 AND status = 'PENDING'", [g.groupId])).rows[0];
    expect(next.bookingId).not.toBe(o.bookingId);
    expect(await count('shuttle_requests', 'booking_id = $1', [next.bookingId])).toBe(0); // chưa xác nhận thì chưa có xe
    await confirmOffer(next.id, ['501'], auth(next.hotelId));
    const rs = await reqs(next.bookingId);
    expect(rs.map((r) => [r.direction, r.status, r.hotelId === next.hotelId])).toEqual([['TO_AIRPORT', 'REQUESTED', true], ['TO_HOTEL', 'REQUESTED', true]]);
    expect((await reqs(o.bookingId, 'REQUESTED')).length).toBe(0);
  });
});
