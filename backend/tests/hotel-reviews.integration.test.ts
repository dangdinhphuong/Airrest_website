import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { closeDb, db, freshDb, mkHotel, mkRoomType, mkStaff } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;

run('tích hợp: chi tiết khách sạn + đánh giá + chính sách lưu trú', () => {
  const app = createApp();
  let hotel = '';
  let other = '';
  let staffToken = '';
  const phone = '0912345678';

  const book = async (hotelId: string, roomType: string, key: string) => {
    const from = new Date(Date.now() + 2 * DAY);
    const r = await request(app).post('/api/v1/bookings').set('Idempotency-Key', key)
      .send({ hotelId, roomTypeId: roomType, qty: 1, from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString(), guest: { fullName: 'Nguyễn Văn Hùng', phone } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    for (let i = 0; i < 50; i++) { // đơn tự duyệt chạy nền: đợi xong rồi mới ép CHECKED_OUT để không bị ghi đè
      if ((await db.query("SELECT 1 FROM bookings WHERE code = $1 AND status = 'CONFIRMED'", [r.body.booking.code])).rowCount) break;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return r.body.booking as { code: string };
  };

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotel = await mkHotel({ code: 'REV1', name: 'KS Review' });
    other = await mkHotel({ code: 'REV2', name: 'KS Khác' });
    await mkRoomType(hotel, 3, 500_000, { name: 'Deluxe' });
    await db.query("UPDATE room_types SET description = 'Nhìn ra thung lũng', view = 'Thung lũng', amenities = ARRAY['WIFI','TV'] WHERE hotel_id = $1", [hotel]);
    staffToken = (await mkStaff(hotel, ['room:manage'])).token;
  });
  afterAll(async () => closeDb());

  it('chi tiết: chính sách lưu trú mặc định null, stats và thông tin loại phòng', async () => {
    const res = await request(app).get(`/api/v1/hotels/${hotel}`);
    expect(res.status).toBe(200);
    expect(res.body.hotel.stay).toEqual({ checkInTime: null, checkOutTime: null, childPolicy: null, petsAllowed: null });
    expect(res.body.hotel.stats).toEqual({ floors: 0, totalRooms: 3 });
    expect(res.body.rooms[0]).toMatchObject({ name: 'Deluxe', description: 'Nhìn ra thung lũng', view: 'Thung lũng', amenities: ['WIFI', 'TV'], images: [] });
  });

  it('lễ tân lưu giờ nhận/trả, trẻ em, thú cưng -> trang công khai thấy; giờ sai -> 422', async () => {
    const bad = await request(app).patch('/api/v1/hotel/profile').set('Authorization', `Bearer ${staffToken}`).send({ checkInTime: '25:00' });
    expect(bad.status).toBe(422);
    const ok = await request(app).patch('/api/v1/hotel/profile').set('Authorization', `Bearer ${staffToken}`).send({ checkInTime: '14:00', checkOutTime: '12:00', childPolicy: 'Trẻ dưới 6 tuổi ở miễn phí', petsAllowed: false });
    expect(ok.status).toBe(200);
    const res = await request(app).get(`/api/v1/hotels/${hotel}`);
    expect(res.body.hotel.stay).toEqual({ checkInTime: '14:00', checkOutTime: '12:00', childPolicy: 'Trẻ dưới 6 tuổi ở miễn phí', petsAllowed: false });
  });

  it('đánh giá: chưa trả phòng -> 422; sai SĐT hoặc sai khách sạn -> 404', async () => {
    const rt = (await db.query<{ id: string }>('SELECT id FROM room_types WHERE hotel_id = $1', [hotel])).rows[0]!.id;
    const b = await book(hotel, rt, 'review-key-a');
    const post = (hid: string, body: object) => request(app).post(`/api/v1/hotels/${hid}/reviews`).send(body);
    expect((await post(hotel, { code: b.code, phone, score: 9 })).body.error.code).toBe('BOOKING_NOT_COMPLETED');
    await db.query("UPDATE bookings SET status = 'CHECKED_OUT' WHERE code = $1", [b.code]);
    expect((await post(hotel, { code: b.code, phone: '0987654321', score: 9 })).status).toBe(404);
    expect((await post(other, { code: b.code, phone, score: 9 })).status).toBe(404);
    expect((await post(hotel, { code: b.code, phone, score: 11 })).status).toBe(422);
  });

  it('đánh giá hợp lệ: ghi 1 lần, cập nhật rating, liệt kê với tên gọi', async () => {
    const code = (await db.query<{ code: string }>("SELECT code FROM bookings WHERE status = 'CHECKED_OUT'")).rows[0]!.code;
    const r = await request(app).post(`/api/v1/hotels/${hotel}/reviews`).send({ code, phone, score: 9, comment: 'Sạch sẽ' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await request(app).post(`/api/v1/hotels/${hotel}/reviews`).send({ code, phone, score: 5 })).body.error.code).toBe('REVIEW_EXISTS');
    const list = await request(app).get(`/api/v1/hotels/${hotel}/reviews`);
    expect(list.body.summary).toMatchObject({ avg: 9, count: 1 });
    expect(list.body.summary.distribution[8]).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ reviewerName: 'Hùng', score: 9, comment: 'Sạch sẽ' });
    const d = await request(app).get(`/api/v1/hotels/${hotel}`);
    expect(d.body.hotel.rating).toEqual({ avg: 9, count: 1 });
  });
});
