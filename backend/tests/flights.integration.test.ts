import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flightCodeSchema, flightDateSchema } from '@airrest/validation';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { toFlightDto } from '../services/flights/flights.service';
import { seedFlights } from '../services/flights/flightSeed';
import { closeDb, count, db, freshDb, mkAdmin, one } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const NOW = new Date('2026-11-11T05:00:00Z');
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('mã chuyến bay / ngày (không DB)', () => {
  it('chuẩn hóa chữ hoa, từ chối định dạng sai', () => {
    expect(flightCodeSchema.safeParse('vn218').data).toBe('VN218');
    for (const bad of ['V218', 'VN12345', 'VN 218', "VN218'--", '123']) expect(flightCodeSchema.safeParse(bad).success, bad).toBe(false);
    expect(flightDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(flightDateSchema.safeParse('2026-11-11').success).toBe(true);
  });

  it('ngưỡng trễ biên: 300 phút chưa vượt, 301 phút vượt (BR-FLT-01); chuyến hủy mọi giờ đều null', () => {
    const base: any = { id: 'x', code: 'VN1', flightDate: '2026-11-11', airline: 'A', origin: 'HAN', schedDep: new Date('2026-11-11T10:00:00Z'), status: 'DELAYED', cause: 'AIRLINE', simScenario: 'approve', updatedAt: new Date() };
    const dto = (min: number) => toFlightDto({ ...base, newDep: new Date(base.schedDep.getTime() + min * 60_000) }, { delayHours: 5, lastChange: null, now: NOW });
    expect(dto(300).delayedOverThreshold).toBe(false);
    expect(dto(301).delayedOverThreshold).toBe(true);
    const c = toFlightDto({ ...base, status: 'CANCELLED', cancelledAt: new Date() }, { delayHours: 5, lastChange: null, now: NOW });
    expect([c.newDepartureAt, c.effectiveDepartureAt, c.delayMinutes, c.delayedOverThreshold]).toEqual([null, null, null, false]);
  });
});

run('tích hợp: chuyến bay mô phỏng', () => {
  const app = createApp();
  let ops = '';
  let sup = '';
  let ip = 0;
  const get = (path: string) => request(app).get(path).set(guestIp(++ip + 150));
  const flightId = async (code: string) => (await one<{ id: string }>('SELECT id FROM flights WHERE code = $1', [code]))!.id;
  const patch = (id: string, body: object, t = ops) => request(app).patch(`/v1/admin/flights/${id}`).set(auth(t)).send(body);

  beforeAll(async () => {
    await freshDb({ roles: true });
    ops = (await mkAdmin([PERM.FLIGHT_MANAGE])).token;
    sup = (await mkAdmin([PERM.SUPPORT_HANDLE])).token;
  });
  afterAll(async () => closeDb());

  it('schema: mã thường, trùng (code, ngày), hủy thiếu cancelled_at đều bị DB chặn; flight_date theo giờ VN', async () => {
    const ins = (code: string, dep: string, status = 'ONTIME', extra = '') => db.query(`INSERT INTO flights (code, airline, origin, sched_dep, status ${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ($1,'A','HAN',$2,$3 ${extra ? ', ' + extra.split('=')[1] : ''})`, [code, dep, status]);
    await expect(ins('vn218', '2026-11-11T10:00:00Z')).rejects.toMatchObject({ code: '23514' });
    await ins('ZZ1', '2026-11-11T17:30:00Z'); // 00:30 ngày 12 giờ VN
    expect((await one<any>("SELECT to_char(flight_date,'YYYY-MM-DD') AS d FROM flights WHERE code = 'ZZ1'"))!.d).toBe('2026-11-12');
    await expect(ins('ZZ1', '2026-11-11T18:00:00Z')).rejects.toMatchObject({ code: '23505' });
    await expect(ins('ZZ2', '2026-11-11T10:00:00Z', 'CANCELLED')).rejects.toMatchObject({ code: '23514' });
    await db.query("DELETE FROM flights WHERE code = 'ZZ1'");
  });

  it('seed: 20 chuyến đúng quy đổi; chạy lại không nhân đôi, không ghi đè', async () => {
    expect(await seedFlights(db, NOW)).toBe(20);
    const vn218 = (await one<any>("SELECT sched_dep, new_dep, to_char(flight_date,'YYYY-MM-DD') AS d FROM flights WHERE code = 'VN218'"))!;
    expect([vn218.schedDep.toISOString(), vn218.newDep.toISOString(), vn218.d]).toEqual(['2026-11-11T16:20:00.000Z', '2026-11-11T23:00:00.000Z', '2026-11-11']);
    expect((await one<any>("SELECT to_char(flight_date,'YYYY-MM-DD') AS d FROM flights WHERE code = 'QH120'"))!.d).toBe('2026-11-12');
    expect((await one<any>("SELECT to_char(flight_date,'YYYY-MM-DD') AS d FROM flights WHERE code = 'VN702'"))!.d).toBe('2026-11-10');
    expect((await one<any>("SELECT status, new_dep, cancelled_at FROM flights WHERE code = 'QH321'"))).toMatchObject({ status: 'CANCELLED' });
    expect((await one<any>("SELECT status, new_dep FROM flights WHERE code = 'QH555'"))!.status).toBe('DELAYED');
    expect((await one<any>("SELECT status FROM flights WHERE code = 'VN300'"))!.status).toBe('ONTIME');
    await db.query("UPDATE flights SET cause = 'FORCE' WHERE code = 'VN123'");
    expect(await seedFlights(db, NOW)).toBe(0);
    expect(await count('flights')).toBe(20);
    expect((await one<any>("SELECT cause FROM flights WHERE code = 'VN123'"))!.cause).toBe('FORCE');
  });

  it('GET công khai: chữ thường OK; chậm 400 phút; simulated; không lộ seq; 404 khác ngày; date sai 422; hủy; chưa biết giờ mới', async () => {
    const ok = await get('/v1/flights/vn218?date=2026-11-11');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ code: 'VN218', simulated: true, status: 'DELAYED', delayMinutes: 400, lastChange: null });
    expect(ok.body.effectiveDepartureAt).toBe(ok.body.newDepartureAt);
    expect(ok.body).not.toHaveProperty('seq');
    expect((await get('/v1/flights/VN218?date=2026-11-13')).body.error.code).toBe('FLIGHT_NOT_FOUND');
    expect((await get('/v1/flights/VN218?date=2026-02-30')).status).toBe(422);
    expect((await get('/v1/flights/VN12345')).status).toBe(422);
    const cancelled = (await get('/v1/flights/QH321?date=2026-11-11')).body;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', newDepartureAt: null, effectiveDepartureAt: null, delayMinutes: null, delayedOverThreshold: false });
    expect(cancelled.cancelledAt).toBeTruthy();
    expect((await get('/v1/flights/QH555?date=2026-11-11')).body).toMatchObject({ status: 'DELAYED', newDepartureAt: null, delayMinutes: null });
  });

  it('rate limit: request thứ 11 trong 1 phút -> 429', async () => {
    const same = guestIp(240);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(app).get('/v1/flights/XX').set(same)).status;
    expect(last).toBe(429);
  });

  describe('admin', () => {
    it('quyền: không token 401; SUPPORT 403; OPS 200', async () => {
      expect((await request(app).get('/v1/admin/flights')).status).toBe(401);
      expect((await request(app).get('/v1/admin/flights').set(auth(sup))).status).toBe(403);
      expect((await request(app).get('/v1/admin/flights').set(auth(ops))).status).toBe(200);
    });

    it('đổi giờ: ngày bay không đổi khi qua nửa đêm; offset khác nhau cùng thời điểm -> 409; lịch sử + lastChange công khai', async () => {
      const id = await flightId('VN123'); // chậm ban ngày
      const res = await patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-12T06:00:00+07:00', reason: 'Chậm kỹ thuật' });
      expect(res.status).toBe(200);
      expect(res.body.change.toAt).toBe('2026-11-11T23:00:00.000Z');
      expect(res.body.flight.flightDate).toBe('2026-11-11');
      expect((await patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-11T23:00:00+00:00', cause: 'FORCE', reason: 'Lặp' })).status).toBe(409); // cùng thời điểm + cùng cause
      const pub = (await get('/v1/flights/VN123?date=2026-11-11')).body;
      expect(pub.lastChange.toAt).toBe('2026-11-11T23:00:00.000Z');
      expect(await count('audit_logs', "action = 'FLIGHT.UPDATE' AND entity_id = $1", [id])).toBe(1);
    });

    it('giờ mới <= dự kiến, ONTIME kèm giờ mới, thiếu reason -> 422; không đổi gì -> 409 và không ghi thừa', async () => {
      const id = await flightId('VJ789');
      expect((await patch(id, { status: 'DELAYED', newDepartureAt: '2020-01-01T00:00:00Z', reason: 'Sai' })).body.error.code).toBe('FLIGHT_TIME_INVALID');
      expect((await patch(id, { status: 'ONTIME', newDepartureAt: '2030-01-01T00:00:00Z', reason: 'Sai' })).body.error.code).toBe('FLIGHT_TIME_INVALID');
      expect((await patch(id, { status: 'DELAYED' })).body.error.code).toBe('VALIDATION_ERROR');
      const before = [await count('flight_changes'), await count('audit_logs', "action = 'FLIGHT.UPDATE'")];
      const same = await one<any>('SELECT new_dep, cause FROM flights WHERE id = $1', [id]);
      expect((await patch(id, { status: 'DELAYED', newDepartureAt: same!.newDep.toISOString(), cause: same!.cause, reason: 'Không đổi' })).body.error.code).toBe('FLIGHT_UNCHANGED');
      expect([await count('flight_changes'), await count('audit_logs', "action = 'FLIGHT.UPDATE'")]).toEqual(before);
    });

    it('hủy rồi khôi phục; hủy kèm giờ mới -> 422; id sai 422, không tồn tại 404', async () => {
      const id = await flightId('VN500');
      const c = await patch(id, { status: 'CANCELLED', reason: 'Hủy do thời tiết' });
      expect(c.body.flight).toMatchObject({ status: 'CANCELLED', effectiveDepartureAt: null });
      expect(c.body.flight.cancelledAt).toBeTruthy();
      expect((await patch(id, { status: 'CANCELLED', newDepartureAt: '2030-01-01T00:00:00Z', reason: 'Sai' })).status).toBe(422);
      const back = await patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-11T12:00:00Z', reason: 'Khôi phục' });
      expect(back.body.flight.cancelledAt).toBeNull();
      expect((await patch('not-a-uuid', { status: 'ONTIME', reason: 'abc' })).status).toBe(422);
      expect((await patch('00000000-0000-4000-8000-000000000000', { status: 'ONTIME', reason: 'abc' })).status).toBe(404);
    });

    it('hai PATCH đồng thời: from_dep của dòng sau = to_dep của dòng trước; lịch sử phân trang', async () => {
      const id = await flightId('VJ930');
      const [a, b] = await Promise.all([
        patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-11T14:00:00Z', reason: 'Lần A' }),
        patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-11T15:00:00Z', reason: 'Lần B' }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const rows = (await db.query<any>('SELECT from_dep, to_dep FROM flight_changes WHERE flight_id = $1 ORDER BY seq', [id])).rows;
      expect(rows).toHaveLength(2);
      expect(rows[1].fromDep.getTime()).toBe(rows[0].toDep.getTime());
      await patch(id, { status: 'DELAYED', newDepartureAt: '2026-11-11T16:00:00Z', reason: 'Lần C' });
      const p1 = await request(app).get(`/v1/admin/flights/${id}/changes?limit=2`).set(auth(ops));
      expect(p1.body.items).toHaveLength(2);
      const p2 = await request(app).get(`/v1/admin/flights/${id}/changes?limit=2&cursor=${p1.body.nextCursor}`).set(auth(ops));
      expect(p2.body.items).toHaveLength(1);
    });
  });
});
