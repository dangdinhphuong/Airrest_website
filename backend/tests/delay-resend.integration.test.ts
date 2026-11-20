import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { signAccountToken } from '../lib/jwt';
import { createPayerBooking } from '../services/bookings/bookings.service';
import { closeDb, db, freshDb, mkHotel, mkRoomType, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: gửi lại email xác nhận + rate limit group-lookup tách riêng', () => {
  let hotel = '', rt = '', flight = '', batch = '', group = '';
  const P: Record<'a' | 'b', { payer: string; station: string; tok: string; readTok: string }> = { a: {} as any, b: {} as any };
  const app = createApp();
  const mkAccount = async (payerId: string, stationId: string, perms: string[]) => {
    const id = randomUUID();
    const roleId = perms.length > 1 ? await systemRoleId('payer_staff') : (await one<{ id: string }>("INSERT INTO roles (key, name, scope, permissions) VALUES ($1,'Chi doc','SYSTEM',$2::text[]) RETURNING id", [`ro-${id.slice(0, 8)}`, perms]))!.id;
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4,$5::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, stationId, [roleId]]);

    return signAccountToken({ sub: id, accountType: 'PAYER' });
  };
  const mkPayer = async (code: string) => {
    const payer = (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ($1,$1,'AIRLINE') RETURNING id", [code]))!.id;
    const station = (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,'HAN','Noi Bai') RETURNING id", [payer]))!.id;
    return { payer, station, tok: await mkAccount(payer, station, ['payer:delay:manage', 'payer:delay:read']), readTok: await mkAccount(payer, station, ['payer:delay:read']) };
  };
  const mkPax = async (o: { email?: string; contactEmail?: string } = {}) =>
    (await one<{ id: string }>(
      `INSERT INTO delay_flight_pax (payer_id, station_id, flight_id, group_id, pnr, full_name, age, category, email, contact_email)
       VALUES ($1,$2,$3,$4,'PNRX01',$7,30,'ADULT',$5,$6) RETURNING id`, [P.a.payer, P.a.station, flight, group, o.email ?? null, o.contactEmail ?? null, `Khach ${randomUUID().slice(0, 6)}`]))!.id;
  const mkOffer = async (paxIds: string[], status: string) => {
    const b = await createPayerBooking({ hotelId: hotel, rooms: [{ roomTypeId: rt, qty: 1 }], from: new Date(Date.now() + 2 * DAY), to: new Date(Date.now() + 3 * DAY), guest: { fullName: 'Đại Diện', phone: '+84912345678' }, guests: 1, batchId: batch, groupId: group });
    return (await one<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, expires_at, pax_ids, status, room_numbers) VALUES ($1,$2,$3,$4,$5,1,$6,$7::uuid[],$8,'{101}') RETURNING id`,
      [batch, group, b.id, hotel, rt, b.expiresAt, paxIds, status]))!.id;
  };
  const resend = (id: string, tok: string, key = `k-${randomUUID()}`) => request(app).post(`/api/v1/payer/passengers/${id}/resend-email`).set({ Authorization: `Bearer ${tok}`, 'Idempotency-Key': key });
  const mails = () => db.query<any>("SELECT * FROM email_outbox WHERE template = 'room-confirmed' ORDER BY seq").then((r) => r.rows);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'RS', name: 'KS Resend' });
    rt = await mkRoomType(hotel, 20);
    P.a = await mkPayer('RA'); P.b = await mkPayer('RB');
    flight = (await one<{ id: string }>("INSERT INTO flights (code, airline, origin, sched_dep, status) VALUES ('VN8','VNA','HAN',now(),'ONTIME') RETURNING id"))!.id;
    batch = (await one<{ id: string }>('INSERT INTO delay_batches (payer_id, station_id, flight_id) VALUES ($1,$2,$3) RETURNING id', [P.a.payer, P.a.station, flight]))!.id;
    group = (await one<{ id: string }>("INSERT INTO delay_groups (batch_id, pnr, no_split, code) VALUES ($1,'PNRX01',true,'NH-RESEND01') RETURNING id", [batch]))!.id;
  });
  afterAll(async () => closeDb());

  it('quyền, cô lập payer, chưa CONFIRMED, chưa có email', async () => {
    const pax = await mkPax({ email: 'old@example.com' });
    const offer = await mkOffer([pax], 'PENDING');
    expect((await resend(pax, P.a.readTok)).status).toBe(403); // thiếu quyền manage
    expect((await resend(pax, P.b.tok)).status).toBe(404); // payer khác
    const pending = await resend(pax, P.a.tok);
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('OFFER_NOT_CONFIRMED');
    await db.query("UPDATE delay_room_offers SET status = 'CONFIRMED' WHERE id = $1", [offer]);
    const noMail = await mkPax();
    await mkOffer([noMail], 'CONFIRMED');
    const r = await resend(noMail, P.a.tok);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('PASSENGER_EMAIL_REQUIRED');
    expect(await mails()).toHaveLength(0);
  });

  it('gửi lại tới contact_email; tối đa 3 lần/giờ rồi 429; replay cùng Idempotency-Key không gửi thêm', async () => {
    const pax = await mkPax({ email: 'old@example.com', contactEmail: 'new@example.com' });
    await mkOffer([pax], 'CONFIRMED');
    const k = `k-${randomUUID()}`;
    const first = await resend(pax, P.a.tok, k);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ sent: true, to: 'new@example.com' });
    await resend(pax, P.a.tok, k); // replay
    expect((await resend(pax, P.a.tok)).status).toBe(200);
    expect((await resend(pax, P.a.tok)).status).toBe(200);
    const spam = await resend(pax, P.a.tok);
    expect(spam.status).toBe(429);
    expect(spam.body.error.code).toBe('RESEND_LIMIT');
    const sent = (await mails()).filter((m) => m.dedupeKey.startsWith('room-confirmed-resend:'));
    expect(sent).toHaveLength(3);
    expect(sent.every((m) => m.toEmail === 'new@example.com')).toBe(true);
    // quá 1 giờ thì cho gửi lại
    await db.query("UPDATE email_outbox SET created_at = now() - interval '2 hours' WHERE dedupe_key LIKE 'room-confirmed-resend:%'");
    expect((await resend(pax, P.a.tok)).status).toBe(200);
  });

  it('group-lookup 429 không làm đăng nhập bị 429 (bộ đếm tách)', async () => {
    const ip = { 'X-Forwarded-For': '10.99.0.7' };
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await request(app).post('/api/v1/bookings/group-lookup').set(ip).send({ groupCode: 'NH-ZZZZZZZZ', phone: '0912345678' })).status;
    expect(last).toBe(429);
    const login = await request(app).post('/api/v1/auth/login').set(ip).send({ email: 'nobody@airrest.vn', password: 'Sai12345678!' });
    expect(login.status).toBe(401);
  });
});
