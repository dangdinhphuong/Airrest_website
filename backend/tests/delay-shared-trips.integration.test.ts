import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERM } from '../config/permissions';
import { withTransaction } from '../database/pg';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { confirmOffer } from '../services/delay/offers';
import { cancelShuttlesForBooking } from '../services/shuttle/cascade';
import { loadGuestShuttles } from '../services/shuttle/guestView';
import { cancelTripByStaff, driverStep, listDriverTrips, shuttleBoard } from '../services/shuttle/trips';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

// E24: gia đình nhiều phòng (nhiều booking/offer) trong cùng nhóm có trẻ em đi MỘT xe nhà nếu vừa (migration 029).
run('tích hợp: chuyến xe chung nhiều booking cùng cụm có trẻ em', () => {
  const hotels: string[] = [];
  const rtOf: Record<string, string> = {};
  const drivers: Record<string, string[]> = {};
  let payer = '', station = '', batch = '', flight = '', seq = 0;
  const from = new Date(Date.now() + 2 * DAY), to = new Date(Date.now() + 3 * DAY);
  const staff = (h: string) => ({ sub: 'x', kind: 'ACCOUNT', accountType: 'HOTEL', hotelId: h, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] }) as any;
  const driverAuth = (h: string, id: string) => ({ sub: id, kind: 'ACCOUNT', accountType: 'DRIVER', hotelId: h, permissions: [] }) as any;

  const mkVehicle = async (hotel: string, seats: number, childSeats: number) => {
    const acc = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, hotel_id) VALUES ($1,'DRIVER',$2,'x','Tài Xế','ACTIVE',$3)", [acc, `${acc.slice(0, 8)}@d.vn`, hotel]);
    await db.query("INSERT INTO hotel_drivers (account_id, hotel_id, full_name, phone) VALUES ($1,$2,'Tài Xế','+84988777666')", [acc, hotel]);
    await db.query('INSERT INTO vehicles (hotel_id, plate, seats, child_seats, driver_account_id) VALUES ($1,$2,$3,$4,$5)', [hotel, `29B-${String(++seq).padStart(5, '0')}`, seats, childSeats, acc]);
    (drivers[hotel] ??= []).push(acc);
  };
  const mkGroup = async (people: Array<{ age: number }>) => {
    const n = ++seq;
    const pnr = `FAM${String(n).padStart(3, '0')}`;
    const groupId = (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, no_split, code) VALUES ($1,$2,true,$3) RETURNING id', [batch, pnr, `NH-FM${String(n).padStart(6, '0')}`]))!.id;
    const ids: string[] = [];
    for (const [i, p] of people.entries()) {
      ids.push((await one<{ id: string }>(
        `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, is_representative) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [payer, station, flight, groupId, pnr, `Gia dinh ${n} ${i}`, p.age, p.age < 2 ? 'INFANT' : p.age < 12 ? 'CHILD' : 'ADULT', i === 0],
      ))!.id);
    }
    return { groupId, ids };
  };
  // Một offer cho một phòng (pax_ids = phần của phòng); gia đình 2 phòng = 2 offer cùng group_id, cùng KS.
  const mkOffer = async (hotel: string, groupId: string, paxIds: string[]) => {
    const b = await createPayerBooking({ hotelId: hotel, rooms: [{ roomTypeId: rtOf[hotel]!, qty: 1 }], from, to, guest: { fullName: 'Chủ Hộ', phone: '0912345678' }, guests: paxIds.length, batchId: batch, groupId });
    const id = (await one<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, pax_ids) VALUES ($1,$2,$3,$4,$5,1,$6,$7::uuid[]) RETURNING id`,
      [batch, groupId, b.id, hotel, rtOf[hotel], b.expiresAt, paxIds],
    ))!.id;
    return { id, bookingId: b.id };
  };
  // Gia đình 5 người, 2 phòng: phòng 1 = 2 NL + 1 em bé; phòng 2 = 2 trẻ (7 và 9 tuổi).
  const family = async (hotel: string) => {
    const g = await mkGroup([{ age: 35 }, { age: 33 }, { age: 1 }, { age: 9 }, { age: 7 }]);
    const a = await mkOffer(hotel, g.groupId, g.ids.slice(0, 3));
    const b = await mkOffer(hotel, g.groupId, g.ids.slice(3));
    return { a, b };
  };
  let room = 100;
  const confirm = (hotel: string, id: string) => confirmOffer(id, [String(++room)], staff(hotel));
  const tripsOf = (dir: string, ...bookingIds: string[]) =>
    db.query<any>("SELECT t.* FROM shuttle_trips t JOIN shuttle_requests r ON r.id = t.request_id WHERE r.booking_id = ANY($1::uuid[]) AND r.direction = $2 AND t.status <> 'CANCELLED' ORDER BY t.seq", [bookingIds, dir]).then((r) => r.rows);
  const reqOf = (bookingId: string, dir: string) => one<any>("SELECT * FROM shuttle_requests WHERE booking_id = $1 AND direction = $2 ORDER BY seq DESC", [bookingId, dir]);
  const mkHotelWith = async (idx: number, fleet: Array<[number, number]>) => {
    const h = await mkHotel({ code: `SD${idx}`, name: `KS Chung Xe ${idx}` });
    await db.query(`UPDATE hotels SET address = '{"line":"${idx} Phố Xe","city":"Hà Nội"}'::jsonb WHERE id = $1`, [h]);
    const rt = await mkRoomType(h, 50, 600_000, { code: `D${idx}` });
    await db.query('UPDATE room_types SET capacity = 8 WHERE id = $1', [rt]);
    await db.query("INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, valid_from) VALUES ($1,$2,$3,450000,'2020-01-01')", [payer, h, rt]);
    hotels.push(h); rtOf[h] = rt;
    for (const [s, c] of fleet) await mkVehicle(h, s, c);
    return h;
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('SD','Shared Co','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN9','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    batch = (await one<{ id: string }>("INSERT INTO delay_batches (payer_id, station_id, flight_id, pickup_point) VALUES ($1,$2,$3,'Nhà ga T2') RETURNING id", [payer, station, flight]))!.id;
  });
  afterAll(async () => closeDb());

  it('gia đình 5 người 2 phòng (2 NL, 2 trẻ, 1 em bé): 1 chuyến mỗi chiều, xe ghế trẻ em, mỗi booking giữ yêu cầu/giá riêng (billing không trùng)', async () => {
    const h = await mkHotelWith(1, [[4, 0], [7, 4]]);
    const { a, b } = await family(h);
    const pricingBefore = (await one<any>('SELECT pricing FROM bookings WHERE id = $1', [b.bookingId]))!.pricing;
    await confirm(h, a.id); // offer đầu chọn xe cho cả cụm (kể cả phòng 2 còn chờ xác nhận) -> xe 7 chỗ có ghế trẻ em, KHÔNG phải xe 4 chỗ nhỏ nhất
    await confirm(h, b.id);

    for (const dir of ['TO_HOTEL', 'TO_AIRPORT']) {
      const ts = await tripsOf(dir, a.bookingId, b.bookingId);
      expect(ts).toHaveLength(1);
      expect(ts[0]).toMatchObject({ kind: 'OWN', status: 'OFFERED', seats: 4, bookingId: a.bookingId }); // 2 NL + 2 trẻ, em bé không chiếm ghế
      const links = (await db.query<any>('SELECT * FROM shuttle_trip_requests WHERE trip_id = $1', [ts[0].id])).rows;
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ bookingId: b.bookingId, seats: 2 });
      const v = (await one<any>('SELECT seats, child_seats FROM vehicles WHERE id = $1', [ts[0].vehicleId]))!;
      expect(v).toMatchObject({ seats: 7, childSeats: 4 });
    }
    // Billing: mỗi booking đúng 2 yêu cầu riêng (đón + về), có giá, chưa thu; tổng đơn không đổi; không chuyến/giá nào bị tính hai lần.
    for (const [bk, pax] of [[a.bookingId, 3], [b.bookingId, 2]] as const) {
      const rs = (await db.query<any>("SELECT * FROM shuttle_requests WHERE booking_id = $1 AND status <> 'CANCELLED'", [bk])).rows;
      expect(rs).toHaveLength(2);
      for (const r of rs) expect(r).toMatchObject({ billed: false, passengers: pax, status: 'REQUESTED' });
      expect(rs.every((r) => r.priceVnd > 0)).toBe(true);
    }
    expect(await count('shuttle_requests', "booking_id = ANY($1::uuid[]) AND status <> 'CANCELLED'", [[a.bookingId, b.bookingId]])).toBe(4);
    expect((await one<any>('SELECT pricing FROM bookings WHERE id = $1', [b.bookingId]))!.pricing).toEqual(pricingBefore);
    expect(await count('shuttle_requests', "booking_id = $1 AND status = 'REQUESTED' AND NOT EXISTS (SELECT 1 FROM shuttle_trip_requests l WHERE l.request_id = shuttle_requests.id)", [b.bookingId])).toBe(0);

    // View tài xế: một chuyến, 4 ghế, kèm thành viên; khách phòng 2 thấy đúng 2 ghế của mình; bảng điều phối hiện chuyến ở cả hai yêu cầu.
    const driver = (await one<any>('SELECT driver_account_id FROM shuttle_trips WHERE booking_id = $1 AND seats = 4 LIMIT 1', [a.bookingId]))!.driverAccountId;
    const dt = (await listDriverTrips(driverAuth(h, driver), { limit: 50 } as any)).items.filter((t: any) => t.bookingCode);
    expect(dt).toHaveLength(2);
    expect(dt[0]).toMatchObject({ seats: 4, request: { passengers: 5 } });
    expect(dt[0]!.members).toHaveLength(1);
    expect(dt[0]!.members[0]).toMatchObject({ seats: 2, passengers: 2 });
    const gb = await loadGuestShuttles(b.bookingId);
    expect(gb).toHaveLength(2);
    expect(gb.every((s) => s.trips.length === 1 && s.trips[0]!.seats === 2)).toBe(true);
    const ga = await loadGuestShuttles(a.bookingId);
    expect(ga.every((s) => s.trips[0]!.seats === 2)).toBe(true);
    const board = await shuttleBoard(staff(h), { limit: 50 } as any);
    expect(board.requests.filter((r: any) => r.trips.length === 1)).toHaveLength(4);

    // Tài xế nhận chuyến đón: cả hai yêu cầu ASSIGNED, khách phòng 2 có nhật ký TRIP_ACCEPTED.
    const tripId = (await tripsOf('TO_HOTEL', a.bookingId))[0].id;
    await driverStep(driverAuth(h, driver), tripId, 'accept');
    expect((await reqOf(a.bookingId, 'TO_HOTEL')).status).toBe('ASSIGNED');
    expect((await reqOf(b.bookingId, 'TO_HOTEL')).status).toBe('ASSIGNED');
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_ACCEPTED'", [b.bookingId])).toBe(1);
  });

  it('không đủ chỗ cho cả cụm: vẫn tách thành hai chuyến, không liên kết', async () => {
    const h = await mkHotelWith(2, [[4, 4], [4, 4]]);
    const g = await mkGroup([{ age: 35 }, { age: 33 }, { age: 30 }, { age: 8 }, { age: 6 }, { age: 5 }]); // 6 ghế > xe 4 chỗ
    const a = await mkOffer(h, g.groupId, g.ids.slice(0, 4));
    const b = await mkOffer(h, g.groupId, g.ids.slice(4));
    await confirm(h, a.id);
    await confirm(h, b.id);
    for (const dir of ['TO_HOTEL', 'TO_AIRPORT']) {
      const ts = await tripsOf(dir, a.bookingId, b.bookingId);
      expect(ts.map((t) => [t.bookingId === a.bookingId ? 'a' : 'b', t.seats, t.kind]).sort()).toEqual([['a', 4, 'OWN'], ['b', 2, 'OWN']]);
      expect(new Set(ts.map((t) => t.vehicleId)).size).toBe(2);
    }
    expect(await count('shuttle_trip_requests', 'booking_id = ANY($1::uuid[])', [[a.bookingId, b.bookingId]])).toBe(0);
  });

  it('booking đơn lẻ có trẻ em (không có offer anh em) không đổi: một chuyến, không liên kết', async () => {
    const h = await mkHotelWith(3, [[7, 3]]);
    const g = await mkGroup([{ age: 35 }, { age: 5 }, { age: 1 }]);
    const a = await mkOffer(h, g.groupId, g.ids);
    await confirm(h, a.id);
    expect((await tripsOf('TO_HOTEL', a.bookingId)).map((t) => [t.kind, t.status, t.seats])).toEqual([['OWN', 'OFFERED', 2]]);
    expect(await count('shuttle_trip_requests', 'booking_id = $1', [a.bookingId])).toBe(0);
    expect((await reqOf(a.bookingId, 'TO_HOTEL')).passengers).toBe(3);
  });

  it('hủy cascade: thành viên rời -> chuyến còn, ghế giảm; booking dẫn đầu rời -> quyền dẫn đầu chuyển cho thành viên, chuyến không bị hủy', async () => {
    const h = await mkHotelWith(4, [[7, 4]]);
    const { a, b } = await family(h);
    await confirm(h, a.id); await confirm(h, b.id);
    const t0 = (await tripsOf('TO_HOTEL', a.bookingId))[0];
    expect(t0.seats).toBe(4);

    // Thành viên (phòng 2) hủy đơn.
    await withTransaction((tx) => cancelShuttlesForBooking(tx, b.bookingId, { type: 'SYSTEM' }, 'Khách hủy đơn'));
    const t1 = (await one<any>('SELECT * FROM shuttle_trips WHERE id = $1', [t0.id]))!;
    expect(t1).toMatchObject({ status: 'OFFERED', seats: 2, bookingId: a.bookingId });
    expect(await count('shuttle_trip_requests', 'trip_id = $1', [t0.id])).toBe(0);
    expect((await reqOf(b.bookingId, 'TO_HOTEL')).status).toBe('CANCELLED');
    expect((await reqOf(a.bookingId, 'TO_HOTEL')).status).toBe('REQUESTED');
  });

  it('hủy cascade booking dẫn đầu: chuyến chuyển cho thành viên; hủy chuyến cả chuyến: mọi yêu cầu đóng', async () => {
    const h = await mkHotelWith(5, [[7, 4]]);
    const { a, b } = await family(h);
    await confirm(h, a.id); await confirm(h, b.id);
    const t0 = (await tripsOf('TO_HOTEL', a.bookingId))[0];

    await withTransaction((tx) => cancelShuttlesForBooking(tx, a.bookingId, { type: 'SYSTEM' }, 'Khách hủy đơn'));
    const t1 = (await one<any>('SELECT * FROM shuttle_trips WHERE id = $1', [t0.id]))!;
    expect(t1).toMatchObject({ status: 'OFFERED', bookingId: b.bookingId, seats: 2 });
    expect(t1.requestId).toBe((await reqOf(b.bookingId, 'TO_HOTEL')).id);
    expect(await count('shuttle_trip_requests', 'trip_id = $1', [t0.id])).toBe(0);
    expect((await reqOf(a.bookingId, 'TO_HOTEL')).status).toBe('CANCELLED');
    expect((await reqOf(b.bookingId, 'TO_HOTEL')).status).toBe('REQUESTED');

    // Hủy chuyến cuối của booking còn lại: yêu cầu đóng, không treo.
    await cancelTripByStaff(staff(h), t0.id, 'Hết xe');
    expect((await reqOf(b.bookingId, 'TO_HOTEL')).status).toBe('CANCELLED');
  });

  it('nhân sự hủy chuyến chung: yêu cầu của mọi booking trong chuyến đóng; tài xế từ chối: mỗi booking được điều lại riêng', async () => {
    const h = await mkHotelWith(6, [[7, 4], [7, 4], [7, 4]]);
    const f1 = await family(h);
    await confirm(h, f1.a.id); await confirm(h, f1.b.id);
    const t = (await tripsOf('TO_HOTEL', f1.a.bookingId))[0];
    await cancelTripByStaff(staff(h), t.id, 'Xe hỏng');
    expect((await reqOf(f1.a.bookingId, 'TO_HOTEL')).status).toBe('CANCELLED');
    expect((await reqOf(f1.b.bookingId, 'TO_HOTEL')).status).toBe('CANCELLED');
    expect(await count('booking_events', "booking_id = $1 AND type = 'TRIP_CANCELLED'", [f1.b.bookingId])).toBeGreaterThan(0);

    const f2 = await family(h);
    await confirm(h, f2.a.id); await confirm(h, f2.b.id);
    const t2 = (await tripsOf('TO_HOTEL', f2.a.bookingId))[0];
    expect(await count('shuttle_trip_requests', 'trip_id = $1', [t2.id])).toBe(1);
    await driverStep(driverAuth(h, t2.driverAccountId), t2.id, 'reject', { reason: 'Hỏng lốp' });
    expect(await count('shuttle_trip_requests', 'trip_id = $1', [t2.id])).toBe(0);
    const na = await tripsOf('TO_HOTEL', f2.a.bookingId), nb = await tripsOf('TO_HOTEL', f2.b.bookingId);
    expect(na.filter((x) => x.status !== 'REJECTED').map((x) => x.seats)).toEqual([2]);
    expect(nb.map((x) => x.seats)).toEqual([2]);
    expect(nb[0].vehicleId).not.toBe(t2.vehicleId);
  });
});
