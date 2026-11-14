import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../api/app';
import { signAccountToken, type AuthContext } from '../lib/jwt';
import { createPayerBooking } from '../services/bookings/bookings.service';
import * as cand from '../services/delay/candidates';
import { getBatch, placeBatch, previewBatch, updatePassengerContact } from '../services/delay/batches';
import { closeDb, count, db, freshDb, mkHotel, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const H = 3600_000;

run('tích hợp: lô đặt phòng delay', () => {
  let payer = '', station = '', flight = '', flightNoTime = '', hNear = '', hFar = '', rtNearS = '', rtNearF = '', rtFarS = '', rtFarF = '';
  let auth: AuthContext, authB: AuthContext, tokA = '', tokB = '';
  const pax: Record<string, string> = {};
  const idem = () => `k-${randomUUID()}`;

  const mkType = async (hotel: string, name: string, cap: number, total: number, bed: string, family: boolean) => {
    const id = randomUUID();
    await db.query('INSERT INTO room_types (id, hotel_id, name, code, total_rooms, capacity, bed_type, family, pricing) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)', [id, hotel, name, id.slice(0, 6).toUpperCase(), total, cap, bed, family, JSON.stringify({ baseNightVnd: 900_000 })]);
    await db.query('INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, hourly_rates, valid_from) VALUES ($1,$2,$3,$4,$5::jsonb,current_date - 1)', [payer, hotel, id, 600_000, JSON.stringify([{ hours: 6, priceVnd: 300_000 }, { hours: 12, priceVnd: 450_000 }])]);
    return id;
  };
  const mkPax = async (fl: string, pnr: string, name: string, age: number, o: { rep?: boolean; phone?: string | null; email?: string } = {}) => {
    const cat = age < 2 ? 'INFANT' : age < 12 ? 'CHILD' : 'ADULT';
    const id = (await one<{ id: string }>(
      'INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, pnr, full_name, age, category, is_representative, phone, email, simulated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id',
      [payer, station, fl, pnr, name, age, cat, o.rep ?? false, o.phone === undefined ? '0912345678' : o.phone, o.email ?? null],
    ))!.id;
    pax[name] = id;
    return id;
  };
  const mkAuth = async (payerId: string, stationId: string | null): Promise<AuthContext> => {
    const id = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4,$5::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, stationId, [await systemRoleId('payer_staff')]]);
    return { kind: 'ACCOUNT', sub: id, accountType: 'PAYER', payerId, payerStationId: stationId ?? undefined, permissions: ['payer:delay:manage', 'payer:delay:read'] };
  };
  const mkFlight = async (code: string, newDep: Date | null) =>
    (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, new_dep, status, cause, simulated) VALUES ($1,'VNA','HAN',$2,$3,'DELAYED','AIRLINE',true) RETURNING id", [code, new Date(Date.now() + 2 * H), newDep]))!.id;
  const nOf = (t: string) => count(t);

  beforeAll(async () => {
    await freshDb({ roles: true });
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('PBA','Hãng A','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    const payerB = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('PBB','Hãng B','AIRLINE') RETURNING id"))!.id;
    const stB = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','NB') RETURNING id", [payerB]))!.id;
    hNear = await mkHotel({ code: 'NEAR' });
    hFar = await mkHotel({ code: 'FAR' });
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":12,\"minutes\":25}]'::jsonb WHERE id = $1", [hFar]);
    rtNearS = await mkType(hNear, 'Đơn', 1, 1, 'SINGLE', false);
    rtNearF = await mkType(hNear, 'Gia đình', 4, 1, 'FAMILY', true);
    rtFarS = await mkType(hFar, 'Đơn', 1, 5, 'SINGLE', false);
    rtFarF = await mkType(hFar, 'Gia đình', 4, 2, 'FAMILY', true);
    flight = await mkFlight('VN100', new Date(Date.now() + 10 * H));
    flightNoTime = await mkFlight('VN200', null);
    await mkPax(flight, 'AAAAA', 'An Lớn', 35, { rep: true, email: 'an@x.vn' });
    await mkPax(flight, 'AAAAA', 'An Nhỏ', 5, { phone: null });
    await mkPax(flight, 'BBBBB', 'Binh', 30);
    await mkPax(flight, 'CCCCC', 'Cuong', 28);
    await mkPax(flight, 'DDDDD', 'Dung', 40, { phone: null });
    await mkPax(flightNoTime, 'EEEEE', 'Em', 30);
    auth = await mkAuth(payer, station);
    authB = await mkAuth(payerB, stB);
    tokA = signAccountToken({ sub: auth.sub, accountType: 'PAYER' });
    tokB = signAccountToken({ sub: authB.sub, accountType: 'PAYER' });
  });
  afterAll(async () => closeDb());

  it('preview không ghi DB; trẻ em không ở phòng riêng; giờ rời KS = giờ bay - 120 - xe - 15', async () => {
    const before = [await nOf('bookings'), await nOf('delay_batches'), await nOf('delay_room_offers'), await nOf('room_reservations')];
    const r = await previewBatch({ auth, flightId: flight, passengerIds: [pax['An Lớn']!, pax['An Nhỏ']!, pax['Binh']!, pax['Cuong']!] });
    expect([await nOf('bookings'), await nOf('delay_batches'), await nOf('delay_room_offers'), await nOf('room_reservations')]).toEqual(before);
    expect(r.unplaced).toEqual([]);
    const fam = r.units.find((u) => u.pnr === 'AAAAA')!;
    expect(fam.cluster).toBe(true);
    expect(fam.rooms[0]!.paxIds.sort()).toEqual([pax['An Lớn']!, pax['An Nhỏ']!].sort()); // trẻ cùng phòng người lớn
    expect(fam.hotelId).toBe(hNear);
    const newDep = new Date((await one<any>('SELECT new_dep FROM flights WHERE id = $1', [flight]))!.newDep).getTime();
    expect(new Date(fam.stay.checkOutAt).getTime()).toBe(newDep - (120 + 15 + 10) * 60_000); // near: xe 10'
    expect(fam.phoneMissing).toBe(false); // lấy SĐT người đại diện
  });

  it('giờ bay chưa biết -> 409 FLIGHT_TIME_UNKNOWN; thiếu SĐT -> 422', async () => {
    await expect(previewBatch({ auth, flightId: flightNoTime, passengerIds: [pax['Em']!] })).rejects.toMatchObject({ status: 409, code: 'FLIGHT_TIME_UNKNOWN' });
    await expect(placeBatch({ auth, flightId: flight, passengerIds: [pax['Dung']!], idempotencyKey: idem() })).rejects.toMatchObject({ status: 422, code: 'PAX_PHONE_REQUIRED' });
    expect(await count('delay_batches')).toBe(0);
  });

  it('điểm đón: API pickup-points, điểm sai -> 422 (không tạo lô), thiếu airport -> 422', async () => {
    const get = (q: string) => request(createApp()).get(`/v1/payer/pickup-points${q}`).set('Authorization', `Bearer ${tokA}`);
    const ok = await get('?airport=han');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ airport: 'HAN', items: ['Nhà ga T1 - cửa ra khu vực đón', 'Nhà ga T2 - cửa ra khu vực đón'], default: 'Nhà ga T1 - cửa ra khu vực đón' });
    expect((await get('?airport=VCA')).body.items).toHaveLength(1); // sân bay chưa liệt kê: điểm chung
    expect((await get('')).status).toBe(422);
    expect((await request(createApp()).get('/v1/payer/pickup-points?airport=HAN')).status).toBe(401);
    const bad = await request(createApp()).post(`/v1/payer/flights/${flight}/batches`).set('Authorization', `Bearer ${tokA}`).set('Idempotency-Key', idem()).send({ passengerIds: [pax['Binh']!], pickupPoint: 'Cổng lạ' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('PICKUP_POINT_INVALID');
    expect(await count('delay_batches')).toBe(0);
  });

  it('cô lập payer: payer khác nhận 404 ở mọi API', async () => {
    await expect(previewBatch({ auth: authB, flightId: flight, passengerIds: [pax['Binh']!] })).rejects.toMatchObject({ status: 404 });
    await expect(updatePassengerContact(authB, pax['Binh']!, { email: 'x@y.vn' })).rejects.toMatchObject({ status: 404 });
    const res = await request(createApp()).post(`/v1/payer/flights/${flight}/batches/preview`).set('Authorization', `Bearer ${tokB}`).send({ passengerIds: [pax['Binh']!] });
    expect(res.status).toBe(404);
  });

  it('đặt: booking PAYER + offer PENDING + HOLD; chuyển KS kế tiếp khi KS gần nhất hết phòng; idempotent; không đặt trùng', async () => {
    const ids = [pax['An Lớn']!, pax['An Nhỏ']!, pax['Binh']!, pax['Cuong']!];
    const key = idem();
    const res = await request(createApp()).post(`/v1/payer/flights/${flight}/batches`).set('Authorization', `Bearer ${tokA}`).set('Idempotency-Key', key).send({ passengerIds: ids });
    expect(res.status).toBe(201);
    const b = res.body;
    expect(b.unplaced).toEqual([]);
    expect(b.pickupPoint).toBe('Nhà ga T1 - cửa ra khu vực đón'); // mặc định điểm đầu của sân bay
    expect(b.offers).toHaveLength(3); // cụm gia đình + 2 người lẻ
    expect(b.offers.every((o: any) => o.status === 'PENDING' && o.secondsLeft > 280 && o.secondsLeft <= 300)).toBe(true);
    expect(b.groups.every((g: any) => /^NH-/.test(g.code))).toBe(true);
    expect(await count('bookings', "payment_method = 'PAYER' AND batch_id = $1 AND status = 'PENDING'", [b.id])).toBe(3);
    expect(await count('room_reservations', "state = 'HOLD' AND booking_id IN (SELECT id FROM bookings WHERE batch_id = $1)", [b.id])).toBe(3);
    // Binh lấy phòng đơn cuối của KS gần, Cuong phải sang KS xa.
    const hotelsByPax = Object.fromEntries(b.offers.map((o: any) => [o.paxIds[0], o.hotelId]));
    expect([hotelsByPax[pax['Binh']!], hotelsByPax[pax['Cuong']!]].sort()).toEqual([hNear, hFar].sort());
    expect(hotelsByPax[pax['An Lớn']!]).toBe(hNear);
    expect((await getBatch(auth, b.id)).offers).toHaveLength(3);
    // Cùng key -> cùng lô, không tạo thêm.
    const again = await request(createApp()).post(`/v1/payer/flights/${flight}/batches`).set('Authorization', `Bearer ${tokA}`).set('Idempotency-Key', key).send({ passengerIds: ids });
    expect(again.body.id).toBe(b.id);
    expect(await count('delay_batches')).toBe(1);
    // Service: cùng key (không qua middleware) cũng trả lô cũ; key khác -> 409 vì khách đã có đơn.
    expect((await placeBatch({ auth, flightId: flight, passengerIds: ids, idempotencyKey: key })).id).toBe(b.id);
    await expect(placeBatch({ auth, flightId: flight, passengerIds: [pax['Binh']!], idempotencyKey: idem() })).rejects.toMatchObject({ status: 409, code: 'PAX_ALREADY_PLACED' });
    expect(await count('bookings', "batch_id IS NOT NULL")).toBe(3);
    // payer khác không đọc được lô
    await expect(getBatch(authB, b.id)).rejects.toMatchObject({ status: 404 });
  });

  it('SOLD_OUT lúc đặt (tồn thay đổi sau khi xếp): thử KS kế tiếp', async () => {
    const fl = await mkFlight('VN300', new Date(Date.now() + 10 * H));
    const p1 = await mkPax(fl, 'FFFFF', 'Phuc', 30);
    // KS gần: dùng hết loại phòng đơn còn lại cho khung bằng HOLD thật, nhưng báo cho bộ xếp rằng còn 1 (tồn cũ).
    const stub = vi.spyOn(cand, 'loadPlanHotelsWithMinutes').mockImplementationOnce(async (q) => {
      const real = await vi.importActual<typeof cand>('../services/delay/candidates');
      const r = await real.loadPlanHotelsWithMinutes(q);
      return { ...r, hotels: r.hotels.map((h) => (h.hotelId === hNear ? { ...h, roomTypes: h.roomTypes.map((t) => (t.roomTypeId === rtNearS ? { ...t, available: 1 } : t)) } : h)) };
    });
    // Nhà ở tồn thật đã hết: Binh (lô trước) đã giữ phòng đơn gần hoặc Cuong ở KS xa; tự lấp nốt phòng đơn của KS gần nếu còn.
    const used = await count('room_reservations', "room_type_id = $1 AND state IN ('HOLD','CONFIRMED')", [rtNearS]);
    if (!used) await createPayerBooking({ hotelId: hNear, rooms: [{ roomTypeId: rtNearS, qty: 1 }], from: new Date(Date.now() - H), to: new Date(Date.now() + 20 * H), guest: { fullName: 'Khác', phone: '0911111111' } });
    const b = await placeBatch({ auth, flightId: fl, passengerIds: [p1], idempotencyKey: idem() });
    expect(stub.mock.calls.length).toBeGreaterThanOrEqual(3); // lần đầu (+1 gọi bản thật bên trong stub) + xếp lại sau SOLD_OUT
    stub.mockRestore();
    expect(b.unplaced).toEqual([]);
    expect(b.offers).toHaveLength(1);
    expect(b.offers[0]!.hotelId).toBe(hFar);
  });

  it('sửa email: có audit, dữ liệu gốc giữ nguyên, sai định dạng bị từ chối', async () => {
    const r = await updatePassengerContact(auth, pax['An Lớn']!, { email: 'Moi@Example.com' });
    expect(r.email).toBe('moi@example.com'); // chuẩn hóa chữ thường như zod
    const row = (await one<any>('SELECT email, contact_email FROM delay_flight_pax WHERE id = $1', [pax['An Lớn']!]))!;
    expect(row).toMatchObject({ email: 'an@x.vn', contactEmail: 'moi@example.com' });
    const a = (await one<any>("SELECT actor, before, after FROM audit_logs WHERE action = 'DELAY.PAX_CONTACT_UPDATE' AND entity_id = $1", [pax['An Lớn']!]))!;
    expect(a.before.email).toBe('an@x.vn');
    expect(a.after.email).toBe('moi@example.com');
    expect(a.actor.id).toBe(auth.sub);
    await expect(updatePassengerContact(auth, pax['An Lớn']!, { email: 'khong-hop-le' })).rejects.toThrow();
    const http = await request(createApp()).patch(`/v1/payer/passengers/${pax['Binh']!}`).set('Authorization', `Bearer ${tokA}`).send({ email: 'sai' });
    expect(http.status).toBe(422);
  });
});
