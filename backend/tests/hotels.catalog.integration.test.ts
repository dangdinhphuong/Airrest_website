import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { hotelFeatures } from '../services/hotels/catalog';
import { closeDb, db, freshDb, mkHotel, mkRoomType } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

describe('hotelFeatures (thuần)', () => {
  it('suy cờ từ tag amenities và policy', () => {
    const f = hotelFeatures({ amenities: ['WIFI', 'SHUTTLE_PAID', '24H_RECEPTION', 'HOURLY'], policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 } });
    expect(f).toEqual({ shuttle: 'paid', hourly: true, family: false, reception24: true, receptionCloseHour: null, freeCancel: true });
  });
  it('tag SHUTTLE cũ = miễn phí; không có tag = none; NON_REFUNDABLE = không hủy miễn phí; giờ đóng lễ tân', () => {
    expect(hotelFeatures({ amenities: ['SHUTTLE'], policy: { cancellationTemplate: 'STANDARD', cleaningBufferMin: 0 } }).shuttle).toBe('free');
    const f = hotelFeatures({ amenities: [], policy: { cancellationTemplate: 'NON_REFUNDABLE', cleaningBufferMin: 0, receptionCloseHour: 25 } });
    expect(f).toMatchObject({ shuttle: 'none', freeCancel: false, receptionCloseHour: 25 });
  });
});

run('tích hợp: GET /v1/hotels kèm giá, số phòng còn, cờ tính năng', () => {
  const app = createApp();
  let hotel = '';
  let cheap = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'CAT1', name: 'KS Catalog' });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_FREE','HOURLY'] WHERE id = $1", [hotel]);
    await mkRoomType(hotel, 5, 900_000, { name: 'Đắt' });
    cheap = await mkRoomType(hotel, 2, 400_000, { name: 'Rẻ' });
  });
  afterAll(async () => closeDb());

  it('trả rooms theo giá tăng dần với roomsLeft và features', async () => {
    const res = await request(app).get('/v1/hotels?airport=HAN');
    expect(res.status).toBe(200);
    const h = res.body.items.find((x: { id: string }) => x.id === hotel);
    expect(h.features).toMatchObject({ shuttle: 'free', hourly: true, freeCancel: true });
    expect(h.policy).toBeUndefined(); // không lộ policy nguyên văn
    expect(h.rooms.map((r: { name: string; roomsLeft: number; baseNightVnd: number }) => [r.name, r.roomsLeft, r.baseNightVnd])).toEqual([['Rẻ', 2, 400000], ['Đắt', 5, 900000]]);
  });

  it('đặt phòng làm giảm roomsLeft trong cửa sổ trùng, không ảnh hưởng cửa sổ khác', async () => {
    const from = new Date(Date.now() + 2 * DAY);
    const to = new Date(from.getTime() + DAY);
    const book = await request(app).post('/v1/bookings').set('Idempotency-Key', `cat-${Date.now()}`)
      .send({ hotelId: hotel, roomTypeId: cheap, qty: 1, from: from.toISOString(), to: to.toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });
    expect(book.status).toBe(201);
    const left = async (f: Date, t: Date) => {
      const r = await request(app).get(`/v1/hotels/${hotel}?from=${f.toISOString()}&to=${t.toISOString()}`);
      return r.body.rooms.find((x: { id: string }) => x.id === cheap).roomsLeft as number;
    };
    expect(await left(from, to)).toBe(1);
    expect(await left(new Date(to.getTime() + DAY), new Date(to.getTime() + 2 * DAY))).toBe(2);
  });

  it('cửa sổ sai: to <= from hoặc quá 31 ngày -> 422', async () => {
    const a = new Date(Date.now() + DAY).toISOString();
    expect((await request(app).get(`/v1/hotels?airport=HAN&from=${a}&to=${a}`)).status).toBe(422);
    expect((await request(app).get(`/v1/hotels?airport=HAN&from=${a}&to=${new Date(Date.now() + 40 * DAY).toISOString()}`)).status).toBe(422);
  });
});
