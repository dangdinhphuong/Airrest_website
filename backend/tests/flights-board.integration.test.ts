import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { vnToday } from '../services/flights/flights.service';
import { seedFlights } from '../services/flights/flightSeed';
import { closeDb, db, freshDb } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const NOW = new Date('2026-11-11T05:00:00Z');
const D = '2026-11-11';

run('tích hợp: bảng chuyến bay công khai GET /api/v1/flights', () => {
  const app = createApp();
  let ip = 0;
  const get = (path: string) => request(app).get(path).set(guestIp(++ip + 20));
  const codes = (r: request.Response) => r.body.items.map((f: any) => f.code);

  beforeAll(async () => {
    await freshDb({ roles: true });
    await seedFlights(db, NOW);
  });
  afterAll(async () => closeDb());

  it('lọc theo sân bay đi + ngày, sắp xếp theo giờ hiệu lực TĂNG dần (hủy dùng giờ lịch)', async () => {
    const res = await get(`/api/v1/flights?airport=SGN&date=${D}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: D, airport: 'SGN', direction: 'departures', count: 7, truncated: false, simulated: true });
    expect(codes(res)).toEqual(['VJ930', 'VJ789', 'VJ815', 'QH909', 'VJ222', 'VJ610', 'VJ456']);
    const eff = res.body.items.map((f: any) => f.effectiveDepartureAt ?? f.scheduledDepartureAt);
    expect([...eff].sort()).toEqual(eff);
  });

  it('direction=arrivals lọc theo dest; airport chữ thường được chuẩn hóa; bỏ airport thì trả mọi sân bay', async () => {
    const arr = await get(`/api/v1/flights?airport=han&direction=arrivals&date=${D}`);
    expect(arr.body).toMatchObject({ airport: 'HAN', direction: 'arrivals', count: 7 });
    expect(arr.body.items.every((f: any) => f.dest === 'HAN')).toBe(true);
    const all = await get(`/api/v1/flights?date=${D}`);
    expect(all.body.airport).toBeNull();
    expect(all.body.items.some((f: any) => f.origin === 'HAN') && all.body.items.some((f: any) => f.origin === 'SGN')).toBe(true);
  });

  it('lọc trạng thái', async () => {
    const res = await get(`/api/v1/flights?airport=HAN&date=${D}&status=CANCELLED`);
    expect(codes(res)).toEqual(['QH321']);
    expect((await get(`/api/v1/flights?airport=HAN&date=${D}&status=ONTIME`)).body.items.every((f: any) => f.status === 'ONTIME')).toBe(true);
  });

  it('mặc định hôm nay theo giờ VN', async () => {
    const today = vnToday(new Date());
    await db.query("INSERT INTO flights (code, airline, origin, dest, sched_dep, status) VALUES ('ZT1','Test','DAD','HAN', (($1::date)::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'ONTIME')", [today]);
    const res = await get('/api/v1/flights?airport=DAD');
    expect(res.body.date).toBe(today);
    expect(codes(res)).toEqual(['ZT1']);
  });

  it('ngày không có chuyến -> 200, items rỗng', async () => {
    const res = await get('/api/v1/flights?airport=HAN&date=2030-01-01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], count: 0, truncated: false });
  });

  it('tham số sai -> 422', async () => {
    for (const q of ['airport=HANX', 'airport=H1N', 'direction=up', 'date=2026-02-30', 'date=11-11-2026', 'status=LATE', 'limit=0', 'limit=201', 'limit=abc']) {
      const r = await get(`/api/v1/flights?${q}`);
      expect(r.status, q).toBe(422);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('tìm theo mã (tiền tố, không phân biệt hoa thường, bỏ khoảng trắng), mọi sân bay nếu không có airport', async () => {
    const res = await get(`/api/v1/flights?code=vn%202&date=${D}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('VN2');
    expect(codes(res)).toEqual(['VN218']);
    const all = await get(`/api/v1/flights?code=VJ&date=${D}`);
    expect(all.body.items.length).toBeGreaterThan(3);
    expect(all.body.items.every((f: any) => f.code.startsWith('VJ'))).toBe(true);
    expect(codes(await get(`/api/v1/flights?code=vj&airport=HAN&date=${D}`))).toEqual(['VJ100']); // kết hợp airport
    expect(codes(await get(`/api/v1/flights?code=VN218&date=${D}&status=ONTIME`))).toEqual([]); // kết hợp status
    expect(codes(await get('/api/v1/flights?code=VN218&date=2030-01-01'))).toEqual([]); // kết hợp date
    const r = await get(`/api/v1/flights?code=ZZZZ9&date=${D}`);
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
    const eff = all.body.items.map((f: any) => f.effectiveDepartureAt ?? f.scheduledDepartureAt);
    expect([...eff].sort()).toEqual(eff);
    expect(codes(await get(`/api/v1/flights?code=VJ&date=${D}&limit=2`)).length).toBe(2);
  });

  it('tìm theo mã KHÔNG có date = mọi ngày (qua + tới), ngày giảm dần, cờ expired; có date thì lọc ngày', async () => {
    const day = (off: number) => new Date(Date.now() + 7 * 3600_000 + off * 86400_000).toISOString().slice(0, 10);
    for (const off of [-1, 0, 1, 30]) {
      await db.query("INSERT INTO flights (code, airline, origin, dest, sched_dep, status) VALUES ('ZQ120','Test','HAN','SGN', (($1::date)::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'ONTIME')", [day(off)]);
    }
    const res = await get('/api/v1/flights?code=zq120');
    expect(res.status).toBe(200);
    expect(res.body.date).toBeNull();
    expect(res.body.items.map((f: any) => f.flightDate)).toEqual([day(30), day(1), day(0), day(-1)]); // ngày giảm dần
    expect(res.body.items.find((f: any) => f.flightDate === day(-1)).expired).toBe(true);
    expect(res.body.items.find((f: any) => f.flightDate === day(30)).expired).toBe(false);
    const one = await get(`/api/v1/flights?code=ZQ120&date=${day(1)}`);
    expect(one.body.items.map((f: any) => f.flightDate)).toEqual([day(1)]);
    expect(one.body.date).toBe(day(1));
    const lim = await get('/api/v1/flights?code=ZQ120&limit=2');
    expect(lim.body).toMatchObject({ count: 2, truncated: true });
  });

  it('code sai -> 422', async () => {
    for (const q of ['code=VN-2', 'code=VN%25', 'code=ABCDEFG', "code=VN'--", 'code=']) expect((await get(`/api/v1/flights?${q}`)).status, q).toBe(422);
  });

  it('limit/truncated', async () => {
    const res = await get(`/api/v1/flights?airport=HAN&date=${D}&limit=3`);
    expect(res.body).toMatchObject({ count: 3, truncated: true });
    const full = await get(`/api/v1/flights?airport=HAN&date=${D}&limit=200`);
    expect(full.body.truncated).toBe(false);
    expect(codes(res)).toEqual(codes(full).slice(0, 3));
  });

  it('DTO công khai như GET /:code, không lộ trường nội bộ (seq); lastChange lấy theo lô', async () => {
    const id = (await db.query<{ id: string }>("SELECT id FROM flights WHERE code = 'VN123'")).rows[0]!.id;
    await db.query("INSERT INTO flight_changes (flight_id, from_dep, to_dep, status_before, status_after, cause_before, cause_after, reason, changed_by) SELECT id, sched_dep, new_dep, 'ONTIME','DELAYED','UNKNOWN','AIRLINE','x','{}'::jsonb FROM flights WHERE id = $1", [id]);
    const res = await get(`/api/v1/flights?airport=HAN&date=${D}`);
    const item = res.body.items.find((f: any) => f.code === 'VN123');
    const single = (await get(`/api/v1/flights/VN123?date=${D}`)).body;
    expect(item.lastChange).toEqual(single.lastChange);
    expect(item.lastChange).not.toBeNull();
    expect(Object.keys(item).filter((k) => k !== 'expired').sort()).toEqual(Object.keys({ ...single, asOf: 0 }).sort());
    expect(item).not.toHaveProperty('seq');
    expect(res.body.items.find((f: any) => f.code === 'VN300').lastChange).toBeNull();
  });

  it('summary: đếm theo sân bay đi; /:code cũ không bị nuốt', async () => {
    const s = await get(`/api/v1/flights/summary?date=${D}`);
    expect(s.status).toBe(200);
    expect(s.body.simulated).toBe(true);
    expect(s.body.items.find((x: any) => x.origin === 'SGN')).toEqual({ origin: 'SGN', total: 7, delayed: 6, cancelled: 1 });
    expect((await get('/api/v1/flights/summary?date=2026-02-30')).status).toBe(422);
    const one = await get(`/api/v1/flights/VN218?date=${D}`);
    expect(one.status).toBe(200);
    expect(one.body.code).toBe('VN218');
    expect((await get(`/api/v1/flights/ZZ999?date=${D}`)).body.error.code).toBe('FLIGHT_NOT_FOUND');
  });
});
