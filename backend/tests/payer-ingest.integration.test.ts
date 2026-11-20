import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { env } from '../config/env';
import { signAccountToken } from '../lib/jwt';
import { issuePayerKey, revokePayerKey } from '../services/delay/apiKeys';
import { closeDb, count, db, freshDb, mkAccount, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const idem = () => ({ 'Idempotency-Key': `pi-${randomUUID()}` });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const SCHED = '2099-01-10T08:00:00Z';
const NEW = '2099-01-10T13:00:00Z';
const body = (o: { code?: string; origin?: string; newDep?: string; pax?: object[] } = {}) => ({
  flight: { code: o.code ?? 'VN9001', airline: 'Vietnam Airlines', origin: o.origin ?? 'HAN', dest: 'SGN', scheduledDepartureAt: SCHED, newDepartureAt: o.newDep ?? NEW, status: 'DELAYED', cause: 'AIRLINE' },
  passengers: o.pax ?? [
    { pnr: 'ABC123', fullName: 'Nguyễn Văn An', age: 40, isRepresentative: true, phone: '0912345678' },
    { pnr: 'ABC123', fullName: 'Nguyễn Thị Bình', age: 4 },
    { pnr: 'XYZ789', fullName: 'Trần Văn Cường', age: 30 },
  ],
});

run('tích hợp: cổng kết nối đơn vị chi trả', () => {
  const app = createApp();
  let payerA = '', payerB = '', stationHanA = '', keyA = '', keyB = '', keyAid = '';
  let tokA = '', tokStationA = '', tokB = '', tokNoSim = '';

  const mkPayerAccount = async (payerId: string, stationId: string | null, perms?: string[]) => {
    let roleId = await systemRoleId('payer_staff');
    if (perms) {
      roleId = randomUUID();
      await db.query("INSERT INTO roles (id, key, name, scope, permissions) VALUES ($1,$2,'T','SYSTEM',$3::text[])", [roleId, `t-${roleId.slice(0, 8)}`, perms]);
    }
    const id = randomUUID();
    await db.query("INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids) VALUES ($1,'PAYER',$2,'x','NV','ACTIVE',$3,$4,$5::uuid[])", [id, `${id.slice(0, 8)}@p.vn`, payerId, stationId, [roleId]]);
    return signAccountToken({ sub: id, accountType: 'PAYER' });
  };
  const ingest = (k: string, b: object) => request(app).post('/api/v1/payer/ingest/flights').set('x-payer-key', k).set(idem()).send(b);
  const simulate = (t: string) => request(app).post('/api/v1/payer/simulate-delay').set(bearer(t)).set(idem()).send({ delayUntil: new Date(Date.now() + 5 * 3600_000).toISOString() });

  beforeAll(async () => {
    await freshDb({ roles: true });
    const mkPayer = async (code: string) => (await one<{ id: string }>("INSERT INTO payers (code, name, kind) VALUES ($1,$1 || ' Co','AIRLINE') RETURNING id", [code]))!.id;
    const mkStation = async (payerId: string, iata: string) => (await one<{ id: string }>("INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1,$2,$3) RETURNING id", [payerId, iata, `Trạm ${iata}`]))!.id;
    payerA = await mkPayer('PAYA');
    payerB = await mkPayer('PAYB');
    stationHanA = await mkStation(payerA, 'HAN');
    await mkStation(payerA, 'DAD');
    const stationHanB = await mkStation(payerB, 'HAN');
    ({ key: keyA, id: keyAid } = await issuePayerKey(payerA, 'Hệ thống A'));
    ({ key: keyB } = await issuePayerKey(payerB, 'Hệ thống B'));
    tokA = await mkPayerAccount(payerA, null);
    tokStationA = await mkPayerAccount(payerA, stationHanA);
    tokB = await mkPayerAccount(payerB, stationHanB);
    tokNoSim = await mkPayerAccount(payerA, null, ['payer:delay:read']);
  });
  afterAll(async () => closeDb());

  it('khóa chỉ lưu hash; khóa sai/thiếu/thu hồi -> 401', async () => {
    expect((await one<any>('SELECT key_hash, key_prefix FROM payer_api_keys WHERE id = $1', [keyAid]))!.keyHash).not.toContain(keyA);
    expect((await ingest('pk_sai', body())).status).toBe(401);
    expect((await request(app).post('/api/v1/payer/ingest/flights').set(idem()).send(body())).status).toBe(401);
    const tmp = await issuePayerKey(payerA, 'tạm');
    expect((await ingest(tmp.key, body({ code: 'VN9100' }))).status).toBe(200);
    await revokePayerKey(tmp.id);
    expect((await ingest(tmp.key, body({ code: 'VN9100' }))).body.error.code).toBe('INVALID_API_KEY');
  });

  it('đẩy chuyến + khách; đẩy lại idempotent; ghi nhật ký; last_used_at', async () => {
    const r1 = await ingest(keyA, body());
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ flightCreated: true, flightChanged: false, passengers: { received: 3, created: 3, updated: 0 }, flight: { simulated: false, flightDate: '2099-01-10' } });
    const r2 = await ingest(keyA, body());
    expect(r2.body).toMatchObject({ flightCreated: false, flightChanged: false, passengers: { created: 0, updated: 3 } });
    expect(await count('flights', "code = 'VN9001'")).toBe(1);
    expect(await count('delay_flight_pax', 'flight_id = $1', [r1.body.flight.id])).toBe(3);
    expect(await count('payer_ingest_logs', "payer_id = $1 AND result = 'OK' AND source = 'API'", [payerA])).toBeGreaterThanOrEqual(2);
    expect((await one<any>('SELECT last_used_at FROM payer_api_keys WHERE id = $1', [keyAid]))!.lastUsedAt).toBeTruthy();
    // đúng Idempotency-Key + cùng body -> phát lại kết quả cũ
    const h = idem();
    const a = await request(app).post('/api/v1/payer/ingest/flights').set('x-payer-key', keyA).set(h).send(body({ code: 'VN9002' }));
    const b = await request(app).post('/api/v1/payer/ingest/flights').set('x-payer-key', keyA).set(h).send(body({ code: 'VN9002' }));
    expect([a.status, b.status, b.headers['idempotent-replay']]).toEqual([200, 200, 'true']);
    expect((await request(app).post('/api/v1/payer/ingest/flights').set('x-payer-key', keyA).send(body())).status).toBe(400); // thiếu Idempotency-Key
  });

  it('đổi giờ bay mới -> flight_changes; không đổi thì không ghi', async () => {
    const id = (await one<{ id: string }>("SELECT id FROM flights WHERE code = 'VN9001'"))!.id;
    expect(await count('flight_changes', 'flight_id = $1', [id])).toBe(0);
    const r = await ingest(keyA, body({ newDep: '2099-01-10T15:00:00Z' }));
    expect(r.body.flightChanged).toBe(true);
    expect(await count('flight_changes', 'flight_id = $1', [id])).toBe(1);
    await ingest(keyA, body({ newDep: '2099-01-10T15:00:00Z' }));
    expect(await count('flight_changes', 'flight_id = $1', [id])).toBe(1);
  });

  it('sai trạm bị chặn + ghi nhật ký REJECTED; dữ liệu sai -> 422', async () => {
    const r = await ingest(keyA, body({ code: 'VN9200', origin: 'SGN' }));
    expect([r.status, r.body.error.code]).toEqual([403, 'STATION_NOT_ALLOWED']);
    expect(await count('flights', "code = 'VN9200'")).toBe(0);
    expect(await count('payer_ingest_logs', "payer_id = $1 AND result = 'REJECTED' AND error_code = 'STATION_NOT_ALLOWED'", [payerA])).toBe(1);
    expect((await ingest(keyA, body({ code: 'VN9201', pax: [{ pnr: 'AB', fullName: 'X', age: 3 }] }))).status).toBe(422);
    expect(await count('payer_ingest_logs', "payer_id = $1 AND error_code = 'VALIDATION_ERROR'", [payerA])).toBe(1);
    expect((await ingest(keyA, { ...body({ code: 'VN9202' }), flight: { ...body().flight, code: 'VN9202', newDepartureAt: '2099-01-10T07:00:00Z' } })).body.error.code).toBe('FLIGHT_TIME_INVALID');
  });

  it('cô lập 2 đơn vị: B không thấy/không ghi đè chuyến của A', async () => {
    const id = (await one<{ id: string }>("SELECT id FROM flights WHERE code = 'VN9001'"))!.id;
    const own = await request(app).get(`/api/v1/payer/flights/${id}/passengers`).set(bearer(tokA));
    expect(own.status).toBe(200);
    expect(own.body.groups.map((g: any) => [g.pnr, g.counts.total])).toEqual([['ABC123', 2], ['XYZ789', 1]]);
    expect((await request(app).get(`/api/v1/payer/flights/${id}/passengers`).set(bearer(tokB))).status).toBe(404);
    expect((await request(app).get('/api/v1/payer/flights').set(bearer(tokB))).body.items).toEqual([]);
    const list = await request(app).get('/api/v1/payer/flights').set(bearer(tokA));
    expect(list.body.items.map((f: any) => f.code)).toContain('VN9001');
    expect(list.body.items.find((f: any) => f.code === 'VN9001')).toMatchObject({ paxCount: 3, groupCount: 2 });
    const clash = await ingest(keyB, body({ newDep: '2099-01-10T20:00:00Z' }));
    expect([clash.status, clash.body.error.code]).toEqual([409, 'FLIGHT_CONFLICT']);
    expect((await one<any>("SELECT to_char(new_dep AT TIME ZONE 'UTC','HH24') h FROM flights WHERE code = 'VN9001'"))!.h).toBe('15');
  });

  it('JWT không phải đơn vị chi trả / thiếu quyền -> 403; tài khoản theo trạm chỉ thấy trạm mình', async () => {
    const admin = signAccountToken({ sub: randomUUID(), accountType: 'ADMIN' });
    expect((await request(app).get('/api/v1/payer/flights').set(bearer(admin))).status).toBe(401);
    expect((await simulate(tokNoSim)).status).toBe(403);
    // tài khoản gắn trạm HAN thấy chuyến HAN; tạo chuyến DAD bằng khóa cấp đơn vị thì không thấy
    await ingest(keyA, body({ code: 'VN9300', origin: 'DAD' }));
    const hanOnly = (await request(app).get('/api/v1/payer/flights').set(bearer(tokStationA))).body.items.map((f: any) => f.code);
    expect(hanOnly).toContain('VN9001');
    expect(hanOnly).not.toContain('VN9300');
    const all = (await request(app).get('/api/v1/payer/flights').set(bearer(tokA))).body.items.map((f: any) => f.code);
    expect(all).toContain('VN9300');
  });

  it('phân trang keyset theo seq', async () => {
    const p1 = await request(app).get('/api/v1/payer/flights?limit=1').set(bearer(tokA));
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.nextCursor).toBe(p1.body.items[0].seq);
    const p2 = await request(app).get(`/api/v1/payer/flights?limit=1&cursor=${p1.body.nextCursor}`).set(bearer(tokA));
    expect(p2.body.items[0].seq).toBeLessThan(p1.body.items[0].seq);
  });

  it('simulate: cờ tắt thì chặn; bật thì sinh dữ liệu simulated qua ingest, không trùng giữa các lần gọi', async () => {
    const env2 = env as { DELAY_SIM_ENABLED: boolean };
    env2.DELAY_SIM_ENABLED = false;
    const off = await simulate(tokA);
    expect([off.status, off.body.error.code]).toEqual([403, 'DELAY_SIM_DISABLED']);
    env2.DELAY_SIM_ENABLED = true;

    const a = await simulate(tokA);
    const b = await simulate(tokA);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.flight.code).not.toBe(b.body.flight.code);
    expect(a.body.flight.simulated).toBe(true);
    const rows = (fid: string) => db.query<any>('SELECT pnr, full_name, category, is_representative, email, phone, simulated FROM delay_flight_pax WHERE flight_id = $1', [fid]).then((r) => r.rows);
    const ra = await rows(a.body.flight.id);
    const rb = await rows(b.body.flight.id);
    expect(ra.length).toBe(a.body.passengers.received);
    expect(ra.every((p) => p.simulated)).toBe(true);
    expect((await one<any>('SELECT simulated FROM flights WHERE id = $1', [a.body.flight.id]))!.simulated).toBe(true);
    expect(new Set([...ra, ...rb].map((p) => p.pnr)).size).toBe(new Set(ra.map((p) => p.pnr)).size + new Set(rb.map((p) => p.pnr)).size); // PNR không trùng giữa hai lần
    const cats = new Set(ra.map((p) => p.category));
    expect([...cats].sort()).toEqual(['ADULT', 'CHILD', 'INFANT']);
    const sizes = Object.values(ra.reduce((m: Record<string, number>, p) => ((m[p.pnr] = (m[p.pnr] ?? 0) + 1), m), {}));
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(4);
    expect(sizes).toContain(1);
    expect(ra.filter((p) => p.isRepresentative && !p.email && !p.phone).length).toBeGreaterThan(0); // có đại diện thiếu liên lạc
    expect(await count('payer_ingest_logs', "source = 'SIMULATION' AND result = 'OK' AND payer_id = $1", [payerA])).toBe(2);
    // chuyến mô phỏng chỉ thuộc đơn vị A; tài khoản theo trạm HAN: sân bay của chuyến = trạm đầu tiên (HAN)
    expect((await request(app).get(`/api/v1/payer/flights/${a.body.flight.id}/passengers`).set(bearer(tokB))).status).toBe(404);
    expect((await one<any>('SELECT origin FROM flights WHERE id = $1', [a.body.flight.id]))!.origin).toBe('HAN');
    const viaStation = await simulate(tokStationA);
    expect(viaStation.status).toBe(201);
  });

  it('simulate: giờ bay mới ở quá khứ -> 422', async () => {
    const r = await request(app).post('/api/v1/payer/simulate-delay').set(bearer(tokA)).set(idem()).send({ delayUntil: '2000-01-01T00:00:00Z' });
    expect(r.status).toBe(422);
  });
});
