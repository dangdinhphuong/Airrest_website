import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { enqueueConfirmedEmails } from '../services/delay/confirmedEmails';
import { confirmOffer } from '../services/delay/offers';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: email sau xác nhận + tra cứu mã nhóm + route offers/route cũ', () => {
  let hotel = '', rt = '', payer = '', station = '', flight = '', batch = '', token = '';
  const auth = () => ({ sub: 'x', kind: 'ACCOUNT', accountType: 'HOTEL', hotelId: hotel, permissions: [PERM.BOOKING_READ, PERM.BOOKING_DECIDE] }) as any;
  const from = new Date(Date.now() + 2 * DAY), to = new Date(Date.now() + 3 * DAY);
  let n = 0;

  const mkPax = async (groupId: string, pnr: string, name: string, o: { rep?: boolean; email?: string; contactEmail?: string; phone?: string; contactPhone?: string } = {}) =>
    (await one<{ id: string }>(
      `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, is_representative, email, contact_email, phone, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,30,'ADULT',$7,$8,$9,$10,$11) RETURNING id`,
      [payer, station, flight, groupId, pnr, name, o.rep ?? false, o.email ?? null, o.contactEmail ?? null, o.phone ?? null, o.contactPhone ?? null]))!.id;
  const mkGroup = async (code: string) => {
    const pnr = `PNR${String(++n).padStart(3, '0')}`;
    return { id: (await one<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, no_split, code) VALUES ($1,$2,true,$3) RETURNING id', [batch, pnr, code]))!.id, pnr };
  };
  const mkOffer = async (groupId: string, paxIds: string[]) => {
    const b = await createPayerBooking({ hotelId: hotel, rooms: [{ roomTypeId: rt, qty: 1 }], from, to, guest: { fullName: 'Đại Diện Nhóm', phone: '+84912345678' }, guests: paxIds.length, batchId: batch, groupId });
    const id = (await one<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, pax_ids) VALUES ($1,$2,$3,$4,$5,1,$6,$7::uuid[]) RETURNING id`,
      [batch, groupId, b.id, hotel, rt, b.expiresAt, paxIds]))!.id;
    return { id, bookingId: b.id, code: b.code };
  };
  const mails = (tpl?: string) => db.query<any>('SELECT * FROM email_outbox WHERE ($1::text IS NULL OR template = $1) ORDER BY seq', [tpl ?? null]).then((r) => r.rows);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'EM', name: 'KS Email' });
    await db.query(`UPDATE hotels SET address = '{"line":"1 Nội Bài","city":"Hà Nội"}'::jsonb, contact = '{"phone":"0243000111"}'::jsonb WHERE id = $1`, [hotel]);
    rt = await mkRoomType(hotel, 20);
    await db.query('UPDATE room_types SET capacity = 4 WHERE id = $1', [rt]);
    payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ('EM','Em Co','AIRLINE') RETURNING id"))!.id;
    station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Nội Bài') RETURNING id", [payer]))!.id;
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN7','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    batch = (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id) VALUES ($1,$2,$3) RETURNING id', [payer, station, flight]))!.id;
    token = (await mkStaff(hotel, [PERM.BOOKING_READ, PERM.BOOKING_DECIDE])).token;
  });
  afterAll(async () => closeDb());

  it('chưa CONFIRMED: không có thư; confirm: mỗi người có email 1 thư (contact_email ưu tiên), thiếu email bị bỏ qua, đại diện nhận thêm tổng hợp; confirm lặp không gửi trùng', async () => {
    const g = await mkGroup('NH-EMAIL001');
    const rep = await mkPax(g.id, g.pnr, 'Rep One', { rep: true, email: 'rep@example.com', phone: '+84912345678' });
    const p2 = await mkPax(g.id, g.pnr, 'Pax Two', { email: 'old@example.com', contactEmail: 'new@example.com' });
    const p3 = await mkPax(g.id, g.pnr, 'Pax Three'); // không email
    const o = await mkOffer(g.id, [rep, p2, p3]);
    await db.query("INSERT INTO shuttle_requests (booking_id, hotel_id, direction, airport_iata, distance_km, pickup_at, location, price_vnd, config_version) VALUES ($1,$2,'TO_HOTEL','HAN',5,$3,'Cổng A',0,1)", [o.bookingId, hotel, from]);

    await enqueueConfirmedEmails(o.id); // offer còn PENDING -> không gửi
    expect(await count('email_outbox')).toBe(0);

    await confirmOffer(o.id, ['305'], auth());
    const room = await mails('room-confirmed');
    expect(room.map((m) => m.toEmail).sort()).toEqual(['new@example.com', 'rep@example.com']);
    expect(room[0].bodyText).toContain('KS Email');
    expect(room[0].bodyText).toContain('305');
    expect(room[0].bodyText).toContain('0243000111');
    expect(room[0].bodyText).toContain('Xe đón');
    expect(room[0].bodyText).toContain('Xe về sân bay'); // GĐ3: confirm tự tạo xe về
    expect(room[0].bodyText).toContain(`/tra-cuu?code=${o.code}`);
    const grp = await mails('group-summary');
    expect(grp).toHaveLength(1);
    expect(grp[0].toEmail).toBe('rep@example.com');
    expect(grp[0].dedupeKey).toBe(`group-summary:${g.id}:1`);

    await enqueueConfirmedEmails(o.id); // gọi lặp
    await expect(confirmOffer(o.id, ['305'], auth())).rejects.toMatchObject({ status: 409 });
    expect(await count('email_outbox')).toBe(3);
  });

  it('phòng thứ hai của nhóm xác nhận: thêm đúng 1 bản tổng hợp mới (2/2 phòng)', async () => {
    const g = await mkGroup('NH-EMAIL002');
    const a = await mkPax(g.id, g.pnr, 'Rep Two', { rep: true, email: 'rep2@example.com' });
    const b = await mkPax(g.id, g.pnr, 'Other', { email: 'other@example.com' });
    const o1 = await mkOffer(g.id, [a]), o2 = await mkOffer(g.id, [b]);
    await confirmOffer(o1.id, ['101'], auth());
    await confirmOffer(o2.id, ['102'], auth());
    const grp = (await mails('group-summary')).filter((m) => m.toEmail === 'rep2@example.com');
    expect(grp.map((m) => m.dedupeKey)).toEqual([`group-summary:${g.id}:1`, `group-summary:${g.id}:2`]);
    expect(grp[1].bodyText).toContain('2/2 phòng đã xác nhận');
    expect(grp[0].bodyText).toContain('1/2 phòng đã xác nhận');
  });

  it('enqueue lỗi (bảng outbox hỏng) thì xác nhận vẫn thành công', async () => {
    const g = await mkGroup('NH-EMAIL003');
    const a = await mkPax(g.id, g.pnr, 'Rep Three', { rep: true, email: 'rep3@example.com' });
    const o = await mkOffer(g.id, [a]);
    await db.query('ALTER TABLE email_outbox RENAME TO email_outbox_x');
    try { await expect(confirmOffer(o.id, ['201'], auth())).resolves.toMatchObject({ offerId: o.id }); } finally { await db.query('ALTER TABLE email_outbox_x RENAME TO email_outbox'); }
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [o.bookingId]))!.status).toBe('CONFIRMED');
  });

  it('group-lookup: đúng SĐT -> danh sách phòng, chưa xác nhận không lộ KS; sai SĐT/sai mã -> 404 như nhau; sau xác nhận lộ KS + số phòng + mã đơn', async () => {
    const g = await mkGroup('NH-LOOKUP01');
    const a = await mkPax(g.id, g.pnr, 'Nguyễn Văn An', { rep: true, phone: '+84900000001' });
    const b = await mkPax(g.id, g.pnr, 'Trần Thị Bình', { phone: '+84900000002', contactPhone: '+84900000003' });
    const o1 = await mkOffer(g.id, [a]), o2 = await mkOffer(g.id, [b]);
    await confirmOffer(o1.id, ['501'], auth());
    const app = createApp();
    const look = (groupCode: string, phone: string) => request(app).post('/api/v1/bookings/group-lookup').send({ groupCode, phone });

    const ok = await look('NH-LOOKUP01', '0900000003'); // contact_phone của người thứ hai
    expect(ok.status).toBe(200);
    expect(ok.body.rooms).toHaveLength(2);
    const conf = ok.body.rooms.find((r: any) => r.status === 'CONFIRMED');
    expect(conf).toMatchObject({ hotelName: 'KS Email', roomNumbers: ['501'], bookingCode: o1.code, guest: 'Nguyễn V. A.' });
    const wait = ok.body.rooms.find((r: any) => r.status === 'WAITING_HOTEL');
    expect(wait).toEqual({ status: 'WAITING_HOTEL', guest: 'Trần T. B.', members: 1, message: 'Đang chờ khách sạn xác nhận' });
    expect(JSON.stringify(wait)).not.toContain('KS Email');
    expect(JSON.stringify(ok.body)).not.toContain('Văn An');

    expect((await look('NH-LOOKUP01', '0900000002')).status).toBe(404); // số gốc đã bị contact_phone ghi đè
    const badPhone = await look('NH-LOOKUP01', '0911111111');
    const badCode = await look('NH-ZZZZZZZZ', '0900000001');
    expect([badPhone.status, badCode.status]).toEqual([404, 404]);
    expect(badPhone.body.error.code).toBe(badCode.body.error.code);
    expect((await look('XX-1', '0900000001')).status).toBe(422);
    await confirmOffer(o2.id, ['502'], auth());
    expect((await look('NH-LOOKUP01', '0900000001')).body.rooms.every((r: any) => r.status === 'CONFIRMED')).toBe(true);
  });

  it('route offers đã đăng ký trên app thật; route cũ confirm/reject chặn đơn PAYER (409), đơn khách lẻ không bị ảnh hưởng', async () => {
    const app = createApp();
    expect((await request(app).get('/api/v1/hotel/delay-offers')).status).toBe(401); // không phải 404 => đã mount
    const list = await request(app).get('/api/v1/hotel/delay-offers').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);

    const g = await mkGroup('NH-ROUTE001');
    const a = await mkPax(g.id, g.pnr, 'Rep R', { rep: true });
    const o = await mkOffer(g.id, [a]);
    const r1 = await request(app).post(`/api/v1/hotel/bookings/${o.bookingId}/confirm`).set('Authorization', `Bearer ${token}`);
    const r2 = await request(app).post(`/api/v1/hotel/bookings/${o.bookingId}/reject`).set('Authorization', `Bearer ${token}`).send({ reason: 'không được' });
    expect([r1.status, r2.status]).toEqual([409, 409]);
    expect([r1.body.error.code, r2.body.error.code]).toEqual(['USE_DELAY_OFFER_API', 'USE_DELAY_OFFER_API']);
    expect((await one<any>('SELECT status FROM bookings WHERE id = $1', [o.bookingId]))!.status).toBe('PENDING');
    const viaApi = await request(app).post(`/api/v1/hotel/delay-offers/${o.id}/confirm`).set('Authorization', `Bearer ${token}`).send({ roomNumbers: ['601'] });
    expect(viaApi.status).toBe(200);
  });
});
