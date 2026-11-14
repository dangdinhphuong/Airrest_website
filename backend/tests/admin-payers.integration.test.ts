import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminPayersRouter } from '../api/modules/adminPayers/adminPayers.router';
import { payerRouter } from '../api/modules/payer/payer.router';
import { errorHandler } from '../api/middleware/errorHandler';
import { signAccountToken } from '../lib/jwt';
import { closeDb, count, freshDb, mkAdmin, mkHotel, mkRoomType, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const idem = () => ({ 'Idempotency-Key': `ap-${randomUUID()}` });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

run('tích hợp: API quản trị đơn vị chi trả', () => {
  // Router chưa được đăng ký trong modules/index.ts: dựng app riêng đúng đường mount dự kiến.
  const app = express().use(express.json()).use('/v1/admin/payers', adminPayersRouter).use('/v1/payer', payerRouter).use(errorHandler);
  let admin = '', reader = '', payerId = '', stationId = '', hotelId = '', roomTypeId = '', otherRoomType = '';
  const P = (s = '') => `/v1/admin/payers${s}`;
  const rate = (o: object = {}) => ({ hotelId, roomTypeId, nightRateVnd: 800_000, hourlyRates: [{ hours: 3, priceVnd: 300_000 }, { hours: 6, priceVnd: 500_000 }], commissionPct: 10, validFrom: '2099-01-01', validTo: '2099-06-30', ...o });

  beforeAll(async () => {
    await freshDb({ roles: true });
    admin = (await mkAdmin(['admin:payer:manage', 'admin:payer:read'])).token;
    reader = (await mkAdmin(['admin:payer:read'])).token;
    hotelId = await mkHotel();
    roomTypeId = await mkRoomType(hotelId, 5);
    otherRoomType = await mkRoomType(await mkHotel({ code: 'OTHER' }), 5);
  });
  afterAll(async () => closeDb());

  it('tạo đơn vị (409 trùng mã), đọc/sửa, quyền read không ghi được', async () => {
    const body = { code: 'vja', name: 'Vietjet Air', kind: 'AIRLINE', contact: { email: 'ops@vj.vn' } };
    const r = await request(app).post(P()).set(bearer(admin)).set(idem()).send(body);
    expect(r.status).toBe(201);
    payerId = r.body.payer.id;
    expect(r.body.payer).toMatchObject({ code: 'VJA', status: 'ACTIVE', sharedRoomPolicy: 'PRIVATE', allowUpgrade: false });
    expect((await request(app).post(P()).set(bearer(admin)).set(idem()).send(body)).body.error.code).toBe('PAYER_CODE_EXISTS');
    expect((await request(app).get(P()).set(bearer(reader))).body.items).toHaveLength(1);
    expect((await request(app).get(P(`/${payerId}`)).set(bearer(reader))).status).toBe(200);
    expect((await request(app).post(P()).set(bearer(reader)).set(idem()).send({ ...body, code: 'ZZ' })).status).toBe(403);
    expect((await request(app).patch(P(`/${payerId}`)).set(bearer(admin)).send({ name: 'Vietjet' })).body.payer.name).toBe('Vietjet');
    expect((await request(app).patch(P(`/${payerId}`)).set(bearer(admin)).send({})).status).toBe(422);
    expect((await request(app).patch(P(`/${payerId}`)).set(bearer(admin)).send({ allowUpgrade: true })).body.payer.allowUpgrade).toBe(true);
    expect((await request(app).patch(P(`/${payerId}`)).set(bearer(admin)).send({ allowUpgrade: 'yes' })).status).toBe(422);
  });

  it('trạm: chỉ sân bay hợp lệ, không trùng, sửa được', async () => {
    const r = await request(app).post(P(`/${payerId}/stations`)).set(bearer(admin)).send({ airportIata: 'han', name: 'Trạm Nội Bài' });
    expect(r.status).toBe(201);
    stationId = r.body.station.id;
    expect((await request(app).post(P(`/${payerId}/stations`)).set(bearer(admin)).send({ airportIata: 'HAN', name: 'Trùng' })).body.error.code).toBe('STATION_EXISTS');
    expect((await request(app).post(P(`/${payerId}/stations`)).set(bearer(admin)).send({ airportIata: 'ZZZ', name: 'Lạ' })).body.error.code).toBe('AIRPORT_UNKNOWN');
    expect((await request(app).patch(P(`/${payerId}/stations/${stationId}`)).set(bearer(admin)).send({ active: false })).body.station.active).toBe(false);
    await request(app).patch(P(`/${payerId}/stations/${stationId}`)).set(bearer(admin)).send({ active: true });
    expect((await request(app).get(P(`/${payerId}/stations`)).set(bearer(reader))).body.items).toHaveLength(1);
  });

  it('giá hợp đồng: tạo, sửa, chồng hiệu lực / loại phòng lệch / bậc giờ sai bị từ chối', async () => {
    const put = (b: object) => request(app).put(P(`/${payerId}/hotel-rates`)).set(bearer(admin)).send(b);
    expect((await put(rate())).status).toBe(201);
    const upd = await put(rate({ commissionPct: 12 }));
    expect([upd.status, upd.body.rate.commissionPct]).toEqual([200, 12]);
    expect((await put(rate({ validFrom: '2099-03-01', validTo: null }))).body.error.code).toBe('RATE_OVERLAP');
    expect((await put(rate({ validFrom: '2098-12-01', validTo: '2099-01-01' }))).body.error.code).toBe('RATE_OVERLAP');
    expect((await put(rate({ validFrom: '2099-07-01', validTo: null }))).status).toBe(201); // liền kề, không chồng
    expect((await put(rate({ roomTypeId: otherRoomType }))).body.error.code).toBe('ROOM_TYPE_MISMATCH');
    expect((await put(rate({ nightRateVnd: 0 }))).body.error.code).toBe('RATE_INVALID');
    expect((await put(rate({ hourlyRates: [{ hours: 6, priceVnd: 1 }, { hours: 3, priceVnd: 1 }] }))).body.error.code).toBe('RATE_INVALID');
    expect((await put(rate({ hourlyRates: [{ hours: 3, priceVnd: 900_000 }] }))).body.error.code).toBe('RATE_INVALID');
    const pending = await mkHotel({ code: 'PEND', status: 'PENDING_APPROVAL' });
    expect((await put(rate({ hotelId: pending, roomTypeId: await mkRoomType(pending, 1) }))).body.error.code).toBe('HOTEL_NOT_ACTIVE');
    expect((await request(app).get(P(`/${payerId}/hotel-rates?hotelId=${hotelId}`)).set(bearer(reader))).body.items).toHaveLength(2);
    expect(await count('audit_logs', "action IN ('PAYER_RATE.CREATE','PAYER_RATE.UPDATE')")).toBe(3);
    expect((await one<any>("SELECT before, after FROM audit_logs WHERE action = 'PAYER_RATE.UPDATE'"))!.before.commissionPct).toBe(10);
  });

  it('khóa API: lộ thô một lần, DB chỉ băm, dùng được để ingest, thu hồi -> 401', async () => {
    const r = await request(app).post(P(`/${payerId}/api-keys`)).set(bearer(admin)).send({ name: 'Hệ thống VJ' });
    expect(r.status).toBe(201);
    const { id, key } = r.body;
    expect(key).toMatch(/^pk_/);
    const list = await request(app).get(P(`/${payerId}/api-keys`)).set(bearer(reader));
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(Object.keys(list.body.items[0]).sort()).toEqual(['createdAt', 'id', 'keyPrefix', 'name']); // null (chưa dùng/chưa thu hồi) bị bỏ khóa
    expect(await count('idempotency_keys', "response::text LIKE '%pk_%'")).toBe(0);
    const flight = { flight: { code: 'VJ123', airline: 'Vietjet', origin: 'HAN', dest: 'SGN', scheduledDepartureAt: '2099-01-10T08:00:00Z', newDepartureAt: '2099-01-10T13:00:00Z', status: 'DELAYED', cause: 'AIRLINE' }, passengers: [{ pnr: 'ABC123', fullName: 'Nguyễn Văn An', age: 40, isRepresentative: true, phone: '0912345678' }] };
    const ing = await request(app).post('/v1/payer/ingest/flights').set('x-payer-key', key).set(idem()).send(flight);
    expect([ing.status, ing.body.flightCreated]).toEqual([200, true]);
    expect((await request(app).delete(P(`/${payerId}/api-keys/${id}`)).set(bearer(admin))).status).toBe(204);
    expect((await request(app).post('/v1/payer/ingest/flights').set('x-payer-key', key).set(idem()).send(flight)).status).toBe(401);
    expect((await request(app).get(P(`/${payerId}/api-keys`)).set(bearer(reader))).body.items[0].revokedAt).toBeTruthy();
    expect((await request(app).delete(P(`/${payerId}/api-keys/${randomUUID()}`)).set(bearer(admin))).status).toBe(404);
  });

  it('nhân viên: tạo (trạm đúng payer), khóa/mở, payer SUSPENDED -> 401, nhân viên gọi admin -> 403', async () => {
    const other = (await request(app).post(P()).set(bearer(admin)).set(idem()).send({ code: 'BAV', name: 'Bamboo', kind: 'AIRLINE' })).body.payer.id;
    const otherStation = (await request(app).post(P(`/${other}/stations`)).set(bearer(admin)).send({ airportIata: 'SGN', name: 'SGN B' })).body.station.id;
    const mk = (b: object) => request(app).post(P(`/${payerId}/staff`)).set(bearer(admin)).set(idem()).send(b);
    const good = { email: 'Nv1@vj.vn', fullName: 'Nhân viên 1', password: 'MatKhauTam#12345', stationId };
    expect((await mk({ ...good, email: 'x@vj.vn', stationId: otherStation })).body.error.code).toBe('STATION_MISMATCH');
    expect((await mk({ ...good, password: 'ngan' })).status).toBe(422);
    const r = await mk(good);
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    expect(r.body.staff).toMatchObject({ email: 'nv1@vj.vn', payerId, payerStationId: stationId, status: 'ACTIVE' });
    expect((await mk({ ...good, stationId: undefined })).body.error.code).toBe('EMAIL_EXISTS');
    const sid = r.body.staff.id;
    const tok = signAccountToken({ sub: sid, accountType: 'PAYER' });
    expect((await request(app).get('/v1/payer/flights').set(bearer(tok))).status).toBe(200);
    expect((await request(app).get(P()).set(bearer(tok))).status).toBe(403);
    expect((await request(app).post(P()).set(bearer(tok)).set(idem()).send({ code: 'EVIL', name: 'Evil', kind: 'AIRLINE' })).status).toBe(403);
    expect((await request(app).patch(P(`/${payerId}/staff/${sid}`)).set(bearer(admin)).send({ status: 'LOCKED' })).body.staff.status).toBe('LOCKED');
    expect((await request(app).get('/v1/payer/flights').set(bearer(tok))).status).toBe(401);
    await request(app).patch(P(`/${payerId}/staff/${sid}`)).set(bearer(admin)).send({ status: 'ACTIVE' });
    expect((await request(app).get('/v1/payer/flights').set(bearer(tok))).status).toBe(200);
    await request(app).patch(P(`/${payerId}`)).set(bearer(admin)).send({ status: 'SUSPENDED' });
    expect((await request(app).get('/v1/payer/flights').set(bearer(tok))).status).toBe(401);
    expect((await request(app).get(P(`/${payerId}/staff`)).set(bearer(reader))).body.items).toHaveLength(1);
    expect((await request(app).patch(P(`/${other}/staff/${sid}`)).set(bearer(admin)).send({ status: 'ACTIVE' })).status).toBe(404); // sai payer
    expect(await count('audit_logs', "action LIKE 'PAYER%'")).toBeGreaterThanOrEqual(12);
    expect(await count('audit_logs', "action = 'PAYER.UPDATE' AND after->>'status' = 'SUSPENDED'")).toBe(1);
  });
});
