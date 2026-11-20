import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { withTransaction } from '../database/pg';
import { signAccountToken, type AuthContext } from '../lib/jwt';
import { placeBatch, previewBatch } from '../services/delay/batches';
import { delayBus } from '../services/delay/events';
import { expireOffer } from '../services/delay/offers';
import { applyNewStayEnd } from '../services/delay/timeChange';
import * as hp from '../services/settlement/payouts';
import * as st from '../services/settlement/statements';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const H = 3600_000;

run('tích hợp: nâng hạng phòng tại quầy', () => {
  let payerP = '', payerQ = '', stP = '', stQ = '', flight = '', h1 = '', h2 = '', std = '', dlx = '', ste = '', std2 = '', dlx2 = '';
  let authP: AuthContext, authQ: AuthContext, tokP = '';
  const pax: Record<string, string> = {};
  const idem = () => `k-${randomUUID()}`;

  const mkType = async (hotel: string, name: string, cap: number, total: number, bed: string, night: number, h12: number) => {
    const id = randomUUID();
    await db.query('INSERT INTO room_types (id, hotel_id, name, code, total_rooms, capacity, bed_type, pricing) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [id, hotel, name, id.slice(0, 6).toUpperCase(), total, cap, bed, JSON.stringify({ baseNightVnd: night })]);
    for (const p of [payerP, payerQ]) await db.query('INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, hourly_rates, commission_pct, valid_from) VALUES ($1,$2,$3,$4,$5::jsonb,10,current_date - 1)', [p, hotel, id, night, JSON.stringify([{ hours: 12, priceVnd: h12 }])]);
    return id;
  };
  const mkPax = async (payer: string, station: string, name: string) => {
    pax[name] = (await one<{ id: string }>("INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, pnr, full_name, age, category, is_representative, phone, simulated) VALUES ($1,$2,$3,$4,$5,30,'ADULT',true,'0912345678',false) RETURNING id", [payer, station, flight, name.toUpperCase().padEnd(5, 'X').slice(0, 5), name]))!.id;
  };
  const mkAuth = async (payerId: string, stationId: string): Promise<AuthContext> => {
    const id = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4,$5::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, stationId, [await systemRoleId('payer_staff')]]);
    return { kind: 'ACCOUNT', sub: id, accountType: 'PAYER', payerId, payerStationId: stationId, permissions: ['payer:delay:manage', 'payer:delay:read'] };
  };
  const previewRoom = async (name: string, a = authP) => (await previewBatch({ auth: a, flightId: flight, passengerIds: [pax[name]!] })).units[0]!;

  beforeAll(async () => {
    await freshDb({ roles: true });
    payerP = (await one<{ id: string }>("INSERT INTO payers (code, name, kind, allow_upgrade) VALUES ('UPP','Hãng P','AIRLINE', true) RETURNING id"))!.id;
    payerQ = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('UPQ','Hãng Q','AIRLINE') RETURNING id"))!.id; // mặc định không cho nâng
    stP = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','NB') RETURNING id", [payerP]))!.id;
    stQ = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','NB') RETURNING id", [payerQ]))!.id;
    h1 = await mkHotel({ code: 'UG1' });
    h2 = await mkHotel({ code: 'UG2' });
    await db.query("UPDATE hotels SET airports = '[{\"iata\":\"HAN\",\"km\":12,\"minutes\":25}]'::jsonb WHERE id = $1", [h2]);
    std = await mkType(h1, 'Std', 1, 3, 'SINGLE', 600_000, 450_000);
    dlx = await mkType(h1, 'Dlx', 2, 2, 'DOUBLE', 900_000, 700_000);
    ste = await mkType(h1, 'Ste', 2, 1, 'DOUBLE', 1_200_000, 1_000_000);
    std2 = await mkType(h2, 'Std2', 1, 5, 'SINGLE', 600_000, 450_000);
    dlx2 = await mkType(h2, 'Dlx2', 2, 5, 'DOUBLE', 900_000, 700_000);
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, new_dep, status, cause, simulated) VALUES ('VN900','VNA','HAN',$1,$2,'DELAYED','AIRLINE',false) RETURNING id", [new Date(Date.now() + 2 * H), new Date(Date.now() + 10 * H)]))!.id;
    for (const n of ['P1', 'P2', 'P3']) await mkPax(payerP, stP, n);
    await mkPax(payerQ, stQ, 'Q1');
    authP = await mkAuth(payerP, stP);
    authQ = await mkAuth(payerQ, stQ);
    tokP = signAccountToken({ sub: authP.sub, accountType: 'PAYER' });
  });
  afterAll(async () => closeDb());

  it('preview: options chỉ cùng KS, cao hơn, còn phòng; payer không cho nâng thì rỗng', async () => {
    const u = await previewRoom('P1');
    expect(u.hotelId).toBe(h1);
    expect(u.canUpgrade).toBe(true);
    expect(u.rooms[0]!.roomTypeName).toBe('Std');
    expect(u.rooms[0]!.priceVnd).toBe(450_000);
    expect(u.rooms[0]!.unitKey).toBe(pax['P1']);
    expect(u.rooms[0]!.upgradeOptions).toEqual([{ roomTypeId: dlx, roomTypeName: 'Dlx', deltaVnd: 250_000 }, { roomTypeId: ste, roomTypeName: 'Ste', deltaVnd: 550_000 }]); // không có Std2/Dlx2 của KS khác
    const q = await previewRoom('Q1', authQ);
    expect(q.canUpgrade).toBe(false);
    expect(q.rooms[0]!.upgradeOptions).toEqual([]);
  });

  it('payer không cho nâng -> 403 và không tạo gì', async () => {
    await expect(placeBatch({ auth: authQ, flightId: flight, passengerIds: [pax['Q1']!], idempotencyKey: idem(), upgrades: [{ unitKey: pax['Q1']!, roomTypeId: dlx }] })).rejects.toMatchObject({ status: 403, code: 'UPGRADE_NOT_ALLOWED' });
    expect(await count('delay_batches')).toBe(0);
  });

  it('validate chặt: khóa lạ/trùng/hạng ngoài options -> 422', async () => {
    const place = (upgrades: Array<{ unitKey: string; roomTypeId: string }>) => placeBatch({ auth: authP, flightId: flight, passengerIds: [pax['P2']!], idempotencyKey: idem(), upgrades });
    await expect(place([{ unitKey: 'khong-co', roomTypeId: dlx }])).rejects.toMatchObject({ status: 422, code: 'UPGRADE_UNIT_UNKNOWN' });
    await expect(place([{ unitKey: pax['P2']!, roomTypeId: dlx2 }])).rejects.toMatchObject({ status: 422, code: 'UPGRADE_NOT_AVAILABLE' }); // KS khác
    await expect(place([{ unitKey: pax['P2']!, roomTypeId: std }])).rejects.toMatchObject({ status: 422, code: 'UPGRADE_NOT_AVAILABLE' }); // không cao hơn
    await expect(place([{ unitKey: pax['P2']!, roomTypeId: dlx }, { unitKey: pax['P2']!, roomTypeId: ste }])).rejects.toMatchObject({ status: 422, code: 'UPGRADE_DUPLICATE' });
    expect(await count('delay_batches')).toBe(0);
  });

  it('hết phòng hạng cao -> 409, không hạ cấp âm thầm, không tạo lô', async () => {
    await db.query('UPDATE room_types SET total_rooms = 0 WHERE id = $1', [ste]);
    try {
      await expect(placeBatch({ auth: authP, flightId: flight, passengerIds: [pax['P2']!], idempotencyKey: idem(), upgrades: [{ unitKey: pax['P2']!, roomTypeId: ste }] })).rejects.toMatchObject({ status: 409, code: 'UPGRADE_NO_ROOM' });
      expect(await count('delay_batches')).toBe(0);
      expect(await count('bookings')).toBe(0);
      expect((await previewRoom('P2')).rooms[0]!.upgradeOptions.map((o) => o.roomTypeName)).toEqual(['Dlx']); // preview ẩn hạng hết phòng
    } finally { await db.query('UPDATE room_types SET total_rooms = 1 WHERE id = $1', [ste]); }
  });

  let offerId = '', bookingId = '', period = '';
  it('đặt có nâng hạng: giá hợp đồng hạng đã nâng + phần chênh lưu ở offer; BatchView thấy hạng', async () => {
    const res = await request(createApp()).post(`/api/v1/payer/flights/${flight}/batches`).set('Authorization', `Bearer ${tokP}`).set('Idempotency-Key', idem()).send({ passengerIds: [pax['P1']!], upgrades: [{ unitKey: pax['P1']!, roomTypeId: dlx }] });
    expect(res.status).toBe(201);
    const o = res.body.offers[0];
    expect(o).toMatchObject({ roomTypeName: 'Dlx', upgradedFrom: 'Std', upgradeDeltaVnd: 250_000, hotelId: h1 });
    offerId = o.id;
    const row = (await one<any>('SELECT o.*, b.pricing, b.id AS bid FROM delay_room_offers o JOIN bookings b ON b.id = o.booking_id WHERE o.id = $1', [offerId]))!;
    bookingId = row.bid;
    expect(row.pricing.roomVnd).toBe(700_000);
    expect(row.upgradeDeltaVnd).toBe(250_000);
    expect(row.upgradeFromRoomTypeId).toBe(std);
    expect(row.roomTypeId).toBe(dlx);
    expect((await one<any>("SELECT room_type_id FROM room_reservations WHERE booking_id = $1", [bookingId]))!.roomTypeId).toBe(dlx);
  });

  it('kết toán: dòng ROOM (chuẩn) + UPGRADE_DELTA; hoa hồng trên tổng; hai chiều khớp', async () => {
    await db.query("UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1", [bookingId]);
    period = (await one<{ p: string }>("SELECT to_char((stay->>'to')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS p FROM bookings WHERE id = $1", [bookingId]))!.p;
    const admin = await mkAdmin([]);
    const ctx: st.Ctx = { auth: { kind: 'ACCOUNT', sub: admin.id, accountType: 'ADMIN', permissions: [] }, requestId: 't' };
    const g = await st.generateStatement(ctx, payerP, period);
    const lines = (await db.query<any>("SELECT kind, amount_vnd, commission_vnd FROM payer_statement_lines WHERE statement_id = $1 ORDER BY kind", [g.statement.id])).rows;
    expect(lines).toEqual([{ kind: 'ROOM', amountVnd: 450_000, commissionVnd: 70_000 }, { kind: 'UPGRADE_DELTA', amountVnd: 250_000, commissionVnd: 0 }]); // 10% x 700.000
    expect(g.statement).toMatchObject({ roomVnd: 450_000, upgradeDeltaVnd: 250_000, totalVnd: 700_000, commissionVnd: 70_000 });
    expect((await st.generateStatement(ctx, payerP, period)).unchanged).toBe(true); // idempotent
    const out = await hp.generateHotelPayouts(ctx, period);
    const pay = out.items.find((x: any) => x.hotelId === h1)!;
    expect(pay).toMatchObject({ grossVnd: 700_000, commissionVnd: 70_000, netVnd: 630_000 });
    expect(pay.grossVnd).toBe(g.statement.roomVnd + g.statement.upgradeDeltaVnd); // đối chiếu: thu đơn vị chi trả (phòng + chênh) = tổng trả KS + hoa hồng
  });

  it('gia hạn giữ hạng đã nâng: giá và phần chênh tính lại theo khung mới', async () => {
    const o = (await one<any>('SELECT * FROM delay_room_offers WHERE id = $1', [offerId]))!;
    const from = new Date((await one<any>('SELECT stay FROM bookings WHERE id = $1', [bookingId]))!.stay.from);
    await withTransaction((tx) => applyNewStayEnd(tx, { bookingId, hotelId: o.hotelId, payerId: payerP, roomTypeId: o.roomTypeId, qty: o.qty, id: offerId, newTo: new Date(from.getTime() + 30 * H), eventType: 'DELAY_STAY_EXTENDED', actor: { type: 'SYSTEM' } }));
    expect((await one<any>('SELECT pricing FROM bookings WHERE id = $1', [bookingId]))!.pricing.roomVnd).toBe(1_800_000); // 2 đêm x Dlx 900.000
    expect((await one<any>('SELECT upgrade_delta_vnd FROM delay_room_offers WHERE id = $1', [offerId]))!.upgradeDeltaVnd).toBe(600_000); // 1.800.000 - 2 x Std 600.000
  });

  it('đổi khách sạn KHÔNG giữ nâng hạng: offer mới hạng chuẩn + sự kiện + cảnh báo cho quầy', async () => {
    const alerts: any[] = [];
    const on = (e: any) => e.type === 'alert' && alerts.push(e.payload);
    delayBus.on('event', on);
    try {
      const res = await request(createApp()).post(`/api/v1/payer/flights/${flight}/batches`).set('Authorization', `Bearer ${tokP}`).set('Idempotency-Key', idem()).send({ passengerIds: [pax['P3']!], upgrades: [{ unitKey: pax['P3']!, roomTypeId: dlx }] });
      expect(res.status).toBe(201);
      const first = res.body.offers[0];
      expect(first.upgradeDeltaVnd).toBe(250_000);
      expect(await expireOffer(first.id)).toBe(true); // hết hạn -> chuyển KS khác (h2)
      const next = (await one<any>("SELECT * FROM delay_room_offers WHERE group_id = $1 AND id <> $2", [first.groupId, first.id]))!;
      expect(next.hotelId).toBe(h2);
      expect(next.roomTypeId).toBe(std2);
      expect(next.upgradeDeltaVnd).toBeUndefined();
      expect(next.upgradeFromRoomTypeId).toBeUndefined();
      const ev = await one<any>("SELECT data FROM booking_events WHERE booking_id = $1 AND type = 'DELAY_UPGRADE_CANCELLED'", [next.bookingId]);
      expect(ev!.data.note).toBe('Nâng hạng đã bị hủy do đổi khách sạn');
      expect(alerts.find((a) => a.kind === 'UPGRADE_CANCELLED')).toMatchObject({ groupId: first.groupId, reason: 'HOTEL_CHANGED', offerId: next.id });
    } finally { delayBus.off('event', on); }
  });
});
