import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nonRefundableNightVnd } from '@airrest/business-logic';
import { createApp } from '../api/app';
import { closeDb, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { guestIp, payBooking, setStay } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const H = 3600_000;
const DAY = 24 * H;

describe('nonRefundableNightVnd (thuần)', () => {
  it('giảm pct% rồi làm tròn 1.000đ', () => {
    expect(nonRefundableNightVnd(740_000, 10)).toBe(666_000);
    expect(nonRefundableNightVnd(500_000, 15)).toBe(425_000);
    expect(nonRefundableNightVnd(333_000, 10)).toBe(300_000); // 299.700 -> 300.000
  });
});

run('tích hợp: mức giá Linh hoạt / Không hoàn hủy theo loại phòng', () => {
  const app = createApp();
  let hotel = '';
  let withNr = '';
  let noNr = '';
  let staffToken = '';
  let ip = 0;
  const from = () => new Date(Date.now() + 20 * DAY).toISOString();
  const to = () => new Date(Date.now() + 21 * DAY).toISOString();
  const body = (rooms: object[], extra: object = {}) => ({ hotelId: hotel, rooms, from: from(), to: to(), guests: 1, guest: { fullName: 'Khách Test', phone: '0912345678' }, ...extra });
  const quote = (rooms: object[]) => request(app).post('/api/v1/bookings/quote').send({ hotelId: hotel, rooms, from: from(), to: to() });
  const book = (rooms: object[], paymentMethod = 'AT_HOTEL') => request(app).post('/api/v1/bookings').set('Idempotency-Key', `rp-${randomUUID()}`).send(body(rooms, { paymentMethod }));
  const cancelQuote = (code: string) => request(app).post('/api/v1/change-requests/quote').set(guestIp(++ip)).send({ code, phone: '0912345678' });

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'RP1', manual: false });
    withNr = await mkRoomType(hotel, 20, 740_000, { name: 'Có NR' });
    noNr = await mkRoomType(hotel, 20, 500_000, { name: 'Không NR' });
    staffToken = (await mkStaff(hotel, ['room:manage', 'booking:read'])).token;
  });
  afterAll(async () => closeDb());

  it('lễ tân đặt % giảm; sai biên bị từ chối; null thì ngừng bán; công khai thấy nonRefundablePct', async () => {
    const patch = (b: object) => request(app).patch(`/api/v1/hotel/room-types/${withNr}`).set('Authorization', `Bearer ${staffToken}`).send(b);
    expect((await patch({ nonRefundablePct: 60 })).status).toBe(422);
    expect((await patch({ nonRefundablePct: 0 })).status).toBe(422);
    const ok = await patch({ nonRefundablePct: 10 });
    expect(ok.status).toBe(200);
    expect(ok.body.roomType.pricing).toMatchObject({ baseNightVnd: 740000, nonRefundablePct: 10 });
    const pub = await request(app).get(`/api/v1/hotels/${hotel}`);
    expect(pub.body.rooms.find((r: { id: string }) => r.id === withNr).nonRefundablePct).toBe(10);
    expect(pub.body.rooms.find((r: { id: string }) => r.id === noNr).nonRefundablePct).toBeUndefined();
    await patch({ nonRefundablePct: null });
    expect((await quote([{ roomTypeId: withNr, qty: 1, ratePlan: 'NON_REFUNDABLE' }])).status).toBe(422);
    await patch({ nonRefundablePct: 10 });
    expect((await patch({ baseNightVnd: 800000 })).body.roomType.pricing.nonRefundablePct).toBe(10); // sửa giá không làm mất %
    await patch({ baseNightVnd: 740000 });
  });

  it('báo giá: mức không hoàn rẻ hơn, mặc định vẫn là giá cũ', async () => {
    const std = await quote([{ roomTypeId: withNr, qty: 2 }]);
    expect(std.body.rooms[0]).toMatchObject({ unitPriceVnd: 740000, ratePlan: 'STANDARD' });
    const nr = await quote([{ roomTypeId: withNr, qty: 2, ratePlan: 'NON_REFUNDABLE' }]);
    expect(nr.status).toBe(200);
    expect(nr.body.rooms[0]).toMatchObject({ unitPriceVnd: 666000, subtotalVnd: 1332000, ratePlan: 'NON_REFUNDABLE' });
    expect(nr.body.roomVnd).toBe(1332000);
  });

  it('từ chối: loại phòng không có mức KHÔNG HOÀN, trộn hai mức, mức không hoàn cho dòng theo giờ', async () => {
    const a = await quote([{ roomTypeId: noNr, qty: 1, ratePlan: 'NON_REFUNDABLE' }]);
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe('RATE_PLAN_NOT_OFFERED');
    const mixed = await quote([{ roomTypeId: withNr, qty: 1, ratePlan: 'NON_REFUNDABLE' }, { roomTypeId: noNr, qty: 1 }]);
    expect(mixed.status).toBe(422);
    expect(JSON.stringify(mixed.body)).toMatch(/không trộn/);
    const hourly = await quote([{ roomTypeId: withNr, qty: 1, kind: 'HOURLY', startsAt: new Date(Date.now() + 20 * DAY).toISOString(), hours: 2, ratePlan: 'NON_REFUNDABLE' }]);
    expect(hourly.status).toBe(422);
  });

  it('đặt phòng: giá tính ở server, đơn chốt chính sách hủy; đổi chính sách khách sạn sau đó không ảnh hưởng', async () => {
    const nr = await book([{ roomTypeId: withNr, qty: 1, ratePlan: 'NON_REFUNDABLE' }]);
    expect(nr.status).toBe(201);
    const std = await book([{ roomTypeId: withNr, qty: 1 }]);
    expect(std.status).toBe(201);
    const tpl = async (code: string) => (await one<{ flags: { cancellationTemplate: string } }>('SELECT flags FROM bookings WHERE code = $1', [code]))!.flags.cancellationTemplate;
    expect(await tpl(nr.body.booking.code)).toBe('NON_REFUNDABLE');
    expect(await tpl(std.body.booking.code)).toBe('FLEXIBLE');
    expect(nr.body.booking.pricing.roomVnd).toBe(666000);
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"NON_REFUNDABLE\"') WHERE id = $1", [hotel]);
    expect(await tpl(std.body.booking.code)).toBe('FLEXIBLE'); // đơn cũ giữ nguyên chính sách đã chốt
    await db.query("UPDATE hotels SET policy = jsonb_set(policy, '{cancellationTemplate}', '\"FLEXIBLE\"') WHERE id = $1", [hotel]);
  });

  it('hủy: đơn Không hoàn hủy không được hoàn tiền, đơn Linh hoạt còn xa ngày nhận thì hoàn đủ', async () => {
    const make = async (ratePlan: string) => {
      const b = await book([{ roomTypeId: withNr, qty: 1, ratePlan }], 'SEPAY');
      expect(b.status, JSON.stringify(b.body)).toBe(201);
      await payBooking(app, b.body.booking.code);
      const id = (await one<{ id: string }>('SELECT id FROM bookings WHERE code = $1', [b.body.booking.code]))!.id;
      await setStay(id, new Date(Date.now() + 100 * H));
      return b.body.booking.code as string;
    };
    const nrQ = await cancelQuote(await make('NON_REFUNDABLE'));
    expect(nrQ.status).toBe(200);
    expect(nrQ.body.quote.refundVnd).toBe(0);
    const stdQ = await cancelQuote(await make('STANDARD'));
    expect(stdQ.body.quote.tier).toBe('FREE');
    expect(stdQ.body.quote.refundVnd).toBeGreaterThan(0);
  });
});
