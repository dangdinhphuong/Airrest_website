import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { hotelFeatures, searchHotels, type HotelSearch } from '../services/hotels/catalog';
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

describe('searchHotels (thuần)', () => {
  const room = (id: string, price: number, capacity = 2, roomsLeft = 3) => ({ id, hotelId: 'h', name: id, capacity, beds: 1, areaM2: 20, baseNightVnd: price, roomsLeft });
  const mk = (name: string, km: number, avg: number, amenities: string[], rooms: ReturnType<typeof room>[], cancel = 'STANDARD') => ({
    name, airports: [{ iata: 'HAN', km, minutes: km * 2 }], rating: { avg, count: avg ? 5 : 0 }, amenities,
    policy: { cancellationTemplate: cancel, cleaningBufferMin: 0 } as never, rooms,
  });
  const hotels = [
    mk('A', 3, 8.6, ['SHUTTLE_FREE'], [room('a1', 740_000)], 'FLEXIBLE'),
    mk('B', 5, 9.3, ['24H_RECEPTION'], [room('b1', 320_000, 2, 0), room('b2', 650_000, 4)]),
    mk('C', 1, 0, [], [room('c1', 500_000)]),
  ];
  const base: HotelSearch = { sort: 'distance', rooms: 1, limit: 5 };
  const names = (f: Partial<HotelSearch>) => searchHotels(hotels, 'HAN', { ...base, ...f }).items.map((h) => h.name);

  it('sắp xếp: gần nhất / giá thấp nhất / đánh giá cao nhất (chưa có đánh giá xuống cuối)', () => {
    expect(names({})).toEqual(['C', 'A', 'B']);
    expect(names({ sort: 'rating' })).toEqual(['B', 'A', 'C']);
    expect(names({ sort: 'price' })).toEqual(['C', 'B', 'A']); // B dùng loại phòng còn chỗ (650k), không phải loại hết phòng (320k)
  });
  it('limit cắt top N nhưng total là số khớp lọc', () => {
    expect(searchHotels(hotels, 'HAN', { ...base, sort: 'rating', limit: 2 })).toMatchObject({ total: 3, items: [{ name: 'B' }, { name: 'A' }] });
  });
  it('lọc theo cờ, khoảng cách, giá, điểm, số khách', () => {
    expect(names({ shuttle: true })).toEqual(['A']);
    expect(names({ freeCancel: true })).toEqual(['A']);
    expect(names({ reception24: true })).toEqual(['B']);
    expect(names({ maxKm: 3 })).toEqual(['C', 'A']);
    expect(names({ priceUnder: 700_000 })).toEqual(['C', 'B']);
    expect(names({ minRating: 8 })).toEqual(['A', 'B']);
    expect(names({ minReviews: 5 })).toEqual(['A', 'B']); // mk(): count = 5 khi có điểm, 0 khi chưa có
    expect(names({ minReviews: 6 })).toEqual([]);
    expect(names({ minPrice: 600_000 })).toEqual(['A', 'B']);
    expect(names({ maxPrice: 650_000 })).toEqual(['C', 'B']); // gồm biên 650k
    expect(names({ minPrice: 500_000, maxPrice: 650_000 })).toEqual(['C', 'B']);
    expect(searchHotels(hotels, 'HAN', { ...base, maxPrice: 1 }).priceRange).toEqual({ min: 500_000, max: 740_000 }); // biên tính trước khi lọc
    expect(names({ guests: 4 })).toEqual(['B']); // chỉ b2 chứa được 4 người
    expect(names({ guests: 5 })).toEqual([]);
    expect(names({ shuttle: false })).toEqual(['C', 'A', 'B']); // false = không lọc
  });
});

run('tích hợp: GET /api/v1/hotels kèm giá, số phòng còn, cờ tính năng', () => {
  const app = createApp();
  let hotel = '';
  let cheap = '';

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'CAT1', name: 'KS Catalog' });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_FREE','HOURLY'] WHERE id = $1", [hotel]);
    await mkRoomType(hotel, 5, 900_000, { name: 'Đắt' });
    cheap = await mkRoomType(hotel, 2, 400_000, { name: 'Rẻ' });
    await db.query("UPDATE room_types SET pricing = pricing || '{\"hourly\":{\"enabled\":true,\"firstHourVnd\":100000,\"nextHourVnd\":50000,\"minHours\":2,\"maxHours\":6}}'::jsonb WHERE id = $1", [cheap]);
  });
  afterAll(async () => closeDb());

  it('trả rooms theo giá tăng dần với roomsLeft và features', async () => {
    const res = await request(app).get('/api/v1/hotels?airport=HAN');
    expect(res.status).toBe(200);
    const h = res.body.items.find((x: { id: string }) => x.id === hotel);
    expect(h.features).toMatchObject({ shuttle: 'free', hourly: true, freeCancel: true });
    expect(h.policy).toBeUndefined(); // không lộ policy nguyên văn
    expect(h.rooms.map((r: { name: string; roomsLeft: number; baseNightVnd: number }) => [r.name, r.roomsLeft, r.baseNightVnd])).toEqual([['Rẻ', 2, 400000], ['Đắt', 5, 900000]]);
  });

  it('đặt phòng làm giảm roomsLeft trong cửa sổ trùng, không ảnh hưởng cửa sổ khác', async () => {
    const from = new Date(Date.now() + 2 * DAY);
    const to = new Date(from.getTime() + DAY);
    const book = await request(app).post('/api/v1/bookings').set('Idempotency-Key', `cat-${Date.now()}`)
      .send({ hotelId: hotel, roomTypeId: cheap, qty: 1, from: from.toISOString(), to: to.toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });
    expect(book.status).toBe(201);
    const left = async (f: Date, t: Date) => {
      const r = await request(app).get(`/api/v1/hotels/${hotel}?from=${f.toISOString()}&to=${t.toISOString()}`);
      return r.body.rooms.find((x: { id: string }) => x.id === cheap).roomsLeft as number;
    };
    expect(await left(from, to)).toBe(1);
    expect(await left(new Date(to.getTime() + DAY), new Date(to.getTime() + 2 * DAY))).toBe(2);
  });

  it('tìm kiếm: sort/limit/lọc ở backend, trả total; tham số sai -> 422; không tham số -> cursor như cũ', async () => {
    const ok = await request(app).get('/api/v1/hotels?airport=HAN&sort=rating&limit=5&guests=2&shuttle=true&hourly=true');
    expect(ok.status).toBe(200);
    expect(ok.body.total).toBeGreaterThanOrEqual(1);
    expect(ok.body.items.map((x: { id: string }) => x.id)).toContain(hotel);
    const rng = await request(app).get('/api/v1/hotels?airport=HAN&guests=2&minPrice=500000&maxPrice=1000000');
    expect(rng.body.priceRange.min).toBeLessThanOrEqual(rng.body.priceRange.max);
    expect(rng.body.items.every((x: { rooms: { baseNightVnd: number }[] }) => x.rooms.some((r) => r.baseNightVnd >= 500000 && r.baseNightVnd <= 1000000))).toBe(true);
    expect((await request(app).get('/api/v1/hotels?airport=HAN&priceUnder=100000')).body).toMatchObject({ items: [], total: 0 });
    expect((await request(app).get('/api/v1/hotels?airport=HAN&family=true')).body.items.map((x: { id: string }) => x.id)).not.toContain(hotel);
    expect((await request(app).get('/api/v1/hotels?airport=HAN&sort=bogus')).status).toBe(422);
    expect((await request(app).get('/api/v1/hotels?airport=HAN')).body.total).toBeUndefined();
  });

  it('không có airport: toàn hệ thống, sort=rating, minReviews lọc theo số lượt đánh giá', async () => {
    await db.query(`UPDATE hotels SET rating = '{"avg":9.5,"count":4}'::jsonb WHERE id = $1`, [hotel]);
    const all = await request(app).get('/api/v1/hotels?limit=4');
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(1);
    expect(all.body.items[0].id).toBe(hotel);
    expect((await request(app).get('/api/v1/hotels?minReviews=4')).body.items.map((x: { id: string }) => x.id)).toContain(hotel);
    expect((await request(app).get('/api/v1/hotels?minReviews=5')).body.items.map((x: { id: string }) => x.id)).not.toContain(hotel);
    expect((await request(app).get('/api/v1/hotels?airport=HAN&minReviews=5')).body.items.map((x: { id: string }) => x.id)).not.toContain(hotel);
  });

  it('báo giá POST /api/v1/bookings/quote khớp đúng giá của đơn tạo ra (phòng + phí dịch vụ + tổng)', async () => {
    const from = new Date(Date.now() + 5 * DAY);
    const to = new Date(from.getTime() + 2 * DAY);
    const q = await request(app).post('/api/v1/bookings/quote').send({ hotelId: hotel, roomTypeId: cheap, qty: 1, from: from.toISOString(), to: to.toISOString() });
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ nights: 2, roomVnd: 800_000, shuttleVnd: 0, legs: [] });
    expect(q.body.serviceFeeVnd).toBeGreaterThan(0);
    expect(q.body.totalVnd).toBe(q.body.roomVnd + q.body.shuttleVnd + q.body.serviceFeeVnd);
    const book = await request(app).post('/api/v1/bookings').set('Idempotency-Key', `quote-${Date.now()}`)
      .send({ hotelId: hotel, roomTypeId: cheap, qty: 1, from: from.toISOString(), to: to.toISOString(), guest: { fullName: 'Khách Báo Giá', phone: '0912345678' } });
    expect(book.status).toBe(201);
    expect(book.body.booking.pricing).toMatchObject({ roomVnd: q.body.roomVnd, serviceFeeVnd: q.body.serviceFeeVnd, totalVnd: q.body.totalVnd });
    expect((await request(app).post('/api/v1/bookings/quote').send({ hotelId: hotel, roomTypeId: '00000000-0000-4000-8000-000000000000', from: from.toISOString(), to: to.toISOString() })).status).toBe(404);
  });

  it('cửa sổ sai: to <= from hoặc quá 31 ngày -> 422', async () => {
    const a = new Date(Date.now() + DAY).toISOString();
    expect((await request(app).get(`/api/v1/hotels?airport=HAN&from=${a}&to=${a}`)).status).toBe(422);
    expect((await request(app).get(`/api/v1/hotels?airport=HAN&from=${a}&to=${new Date(Date.now() + 40 * DAY).toISOString()}`)).status).toBe(422);
  });
});
