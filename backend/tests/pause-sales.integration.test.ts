import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, freshDb, mkAdmin, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PW = 'DoanhNghiep12345!';

run('tích hợp: tạm dừng nhận đặt (từng khách sạn / cả chuỗi)', () => {
  const app = createApp();
  let admin = '', tok = '', otherTok = '', h1 = '', h2 = '';
  const body = (code: string, name: string) => ({ code, name, address: { line: '1 Nội Bài', city: 'Hà Nội' }, location: { lng: 105.8, lat: 21.2 }, airports: [{ iata: 'han', km: 6, minutes: 12 }], contact: { phone: '0243123456' }, policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 } });
  const mkBiz = async (n: string) => {
    await request(app).post('/v1/auth/business/register').send({ name: `Cty ${n}`, taxCode: `MST-${n}`, representative: `DD ${n}`, email: `${n}@dn.vn`, phone: '0912345678', password: PW });
    const id = (await one<{ id: string }>('SELECT id FROM businesses WHERE email = $1', [`${n}@dn.vn`]))!.id;
    await request(app).post(`/v1/admin/businesses/${id}/approve`).set(bearer(admin));
    return (await request(app).post('/v1/auth/login').send({ email: `${n}@dn.vn`, password: PW })).body.token as string;
  };
  const mkHotelOf = async (t: string, code: string) => {
    const id = (await request(app).post('/v1/hotel/hotels').set(bearer(t)).send(body(code, `KS ${code}`))).body.hotel.id as string;
    await request(app).post(`/v1/hotel/hotels/${id}/submit`).set(bearer(t));
    await request(app).post(`/v1/admin/hotels/${id}/approve`).set(bearer(admin));
    return id;
  };
  const visible = async (id: string) => (await request(app).get(`/v1/hotels/${id}`)).status === 200;

  beforeAll(async () => {
    await freshDb({ roles: true });
    admin = (await mkAdmin([PERM.ADMIN_HOTEL_READ, PERM.ADMIN_HOTEL_MANAGE])).token;
    tok = await mkBiz('p1'); otherTok = await mkBiz('p2');
    h1 = await mkHotelOf(tok, 'PS-A'); h2 = await mkHotelOf(tok, 'PS-B');
  });
  afterAll(async () => closeDb());

  it('dừng một khách sạn: ẩn khỏi tra cứu, khách sạn còn lại vẫn hiện; cần lý do; dừng/mở hai lần -> 409; mở lại hiện lại', async () => {
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/pause`).set(bearer(tok)).send({})).status).toBe(422);
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/pause`).set(bearer(tok)).send({ reason: 'Sửa chữa' })).status).toBe(200);
    expect(await visible(h1)).toBe(false);
    expect(await visible(h2)).toBe(true);
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/pause`).set(bearer(tok)).send({ reason: 'Sửa chữa' })).status).toBe(409);
    const list = await request(app).get('/v1/hotel/hotels').set(bearer(tok));
    expect(list.body.items.find((x: any) => x.id === h1)).toMatchObject({ pauseReason: 'Sửa chữa' });
    expect(await count('audit_logs', "action = 'HOTEL.PAUSE' AND entity_id = $1", [h1])).toBe(1);
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/resume`).set(bearer(tok))).status).toBe(200);
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/resume`).set(bearer(tok))).status).toBe(409);
    expect(await visible(h1)).toBe(true);
  });

  it('khách sạn của doanh nghiệp khác -> 404', async () => {
    expect((await request(app).post(`/v1/hotel/hotels/${h1}/pause`).set(bearer(otherTok)).send({ reason: 'Thử' })).status).toBe(404);
    expect(await visible(h1)).toBe(true);
  });

  it('dừng cả chuỗi: mọi khách sạn của chuỗi ẩn, chuỗi khác không bị ảnh hưởng; mở lại hiện lại', async () => {
    const other = await mkHotelOf(otherTok, 'PS-C');
    expect((await request(app).post('/v1/hotel/hotels/chain/pause').set(bearer(tok)).send({ reason: 'Nghỉ lễ' })).status).toBe(200);
    expect(await visible(h1)).toBe(false);
    expect(await visible(h2)).toBe(false);
    expect(await visible(other)).toBe(true);
    expect((await request(app).get('/v1/hotel/hotels').set(bearer(tok))).body.chain).toMatchObject({ pauseReason: 'Nghỉ lễ' });
    expect((await request(app).post('/v1/hotel/hotels/chain/pause').set(bearer(tok)).send({ reason: 'Nghỉ lễ' })).status).toBe(409);
    expect((await request(app).post('/v1/hotel/hotels/chain/resume').set(bearer(tok))).status).toBe(200);
    expect(await visible(h1)).toBe(true);
    expect(await visible(h2)).toBe(true);
  });
});
