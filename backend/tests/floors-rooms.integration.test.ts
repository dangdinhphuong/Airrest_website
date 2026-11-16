import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { closeDb, count, db, freshDb, mkAdmin, mkHotel, mkRoomType, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const key = (folder = 'rooms') => `${folder}/2026/${crypto.randomUUID()}.jpg`;

run('tích hợp: tầng / phòng / ảnh + đồng bộ tồn', () => {
  const app = createApp();
  let H1 = '';
  let H2 = '';
  let t1 = '';
  let t2 = '';
  let readOnly = '';
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const api = (m: 'post' | 'patch' | 'delete' | 'get', url: string, t = t1, b?: unknown) => request(app)[m](`/v1/hotel/${url}`).set(auth(t)).send(b as object);
  const floor = async (level: number, t = t1) => (await api('post', 'floors', t, { name: `Tầng ${level}`, level })).body.floor.id as string;
  const rtOf = async (id: string) => (await one<any>('SELECT * FROM room_types WHERE id = $1', [id]))!;
  const book = (hotelId: string, roomTypeId: string, off: number, qty = 1) =>
    request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', `fr-${++n}-${Date.now()}`)
      .send({ hotelId, roomTypeId, qty, from: new Date(Date.now() + off * DAY).toISOString(), to: new Date(Date.now() + (off + 1) * DAY).toISOString(), guest: { fullName: 'Khách Test', phone: '0912345678' } });

  beforeAll(async () => {
    await freshDb({ roles: true });
    H1 = await mkHotel({ code: 'F1' });
    H2 = await mkHotel({ code: 'F2' });
    t1 = (await mkStaff(H1, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    t2 = (await mkStaff(H2, [PERM.BOOKING_READ, PERM.ROOM_MANAGE])).token;
    readOnly = (await mkStaff(H1, [PERM.BOOKING_READ])).token;
  });
  afterAll(async () => closeDb());

  it('tầng: tạo, trùng số tầng 409, sửa, xóa khi trống; có audit', async () => {
    const f = await api('post', 'floors', t1, { name: 'Tầng 1', level: 1 });
    expect(f.status).toBe(201);
    expect((await api('post', 'floors', t1, { name: 'Khác', level: 1 })).body.error.code).toBe('FLOOR_LEVEL_TAKEN');
    expect((await api('post', 'floors', t2, { name: 'Tầng 1', level: 1 })).status).toBe(201); // khách sạn khác dùng lại
    expect((await api('patch', `floors/${f.body.floor.id}`, t1, { name: 'Lầu 1', note: 'gần thang máy' })).body.floor).toMatchObject({ name: 'Lầu 1', note: 'gần thang máy' });
    expect((await api('post', 'floors', t1, { name: '', level: 3 })).status).toBe(422);
    expect((await api('post', 'floors', t1, { name: 'x', level: 999 })).status).toBe(422);
    expect((await api('delete', `floors/${f.body.floor.id}`)).status).toBe(200);
    expect(await count('audit_logs', "action IN ('FLOOR.CREATE','FLOOR.UPDATE','FLOOR.DELETE')")).toBeGreaterThanOrEqual(4);
  });

  it('phòng: loại chưa có phòng giữ hành vi cũ; thêm phòng đầu tiên -> total_rooms = số phòng ACTIVE', async () => {
    const rt = await mkRoomType(H1, 10);
    const fl = await floor(2);
    const r1 = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '201' });
    expect(r1.status).toBe(201);
    expect(r1.body.room).toMatchObject({ number: '201', status: 'ACTIVE', images: [] });
    expect((await rtOf(rt)).totalRooms).toBe(1);
    await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '202' });
    await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '203', status: 'INACTIVE' });
    expect((await rtOf(rt)).totalRooms).toBe(2); // INACTIVE không tính
    const ng = await api('patch', `rooms/${r1.body.room.id}`, t1, { status: 'INACTIVE' });
    expect(ng.status).toBe(200);
    expect((await rtOf(rt)).totalRooms).toBe(1);
    await api('patch', `rooms/${r1.body.room.id}`, t1, { status: 'ACTIVE' });
    expect((await rtOf(rt)).totalRooms).toBe(2);
    expect((await api('delete', `rooms/${r1.body.room.id}`)).status).toBe(200);
    expect((await rtOf(rt)).totalRooms).toBe(1);
    const list = await api('get', `rooms?roomTypeId=${rt}`);
    expect(list.body.items.map((x: any) => x.number)).toEqual(['202', '203']);
    const types = await api('get', 'room-types');
    expect(types.body.items.find((x: any) => x.id === rt)).toMatchObject({ managedByRooms: true, roomCount: 2, totalRooms: 1 });
  });

  it('thêm hàng loạt theo dải: đồng bộ tồn, trùng số -> 409 không tạo gì, dải quá lớn -> 422', async () => {
    const rt = await mkRoomType(H1, 0);
    const fl = await floor(3);
    const ok = await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 301, to: 305 });
    expect(ok.status).toBe(201);
    expect(ok.body.items).toHaveLength(5);
    expect((await rtOf(rt)).totalRooms).toBe(5);
    const dup = await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 305, to: 308 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ROOM_NUMBER_TAKEN');
    expect(await count('rooms', 'room_type_id = $1', [rt])).toBe(5);
    expect((await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 1, to: 500 })).status).toBe(422);
    expect((await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 9, to: 3 })).status).toBe(422);
  });

  it('số phòng trùng trong khách sạn -> 409; khách sạn khác dùng lại được', async () => {
    const rt = await mkRoomType(H1, 3);
    const fl = await floor(4);
    expect((await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '401' })).status).toBe(201);
    const dup = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '401' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ROOM_NUMBER_TAKEN');
    const rt2 = await mkRoomType(H2, 3);
    const fl2 = await floor(4, t2);
    expect((await api('post', 'rooms', t2, { floorId: fl2, roomTypeId: rt2, number: '401' })).status).toBe(201);
  });

  it('loại phòng/tầng khác khách sạn -> 404; không sửa/xóa phòng của khách sạn khác', async () => {
    const rt1 = await mkRoomType(H1, 3);
    const rt2 = await mkRoomType(H2, 3);
    const fl1 = await floor(5);
    const fl2 = await floor(5, t2);
    expect((await api('post', 'rooms', t1, { floorId: fl1, roomTypeId: rt2, number: '501' })).body.error.code).toBe('ROOM_TYPE_NOT_FOUND');
    expect((await api('post', 'rooms', t1, { floorId: fl2, roomTypeId: rt1, number: '502' })).body.error.code).toBe('FLOOR_NOT_FOUND');
    const r = (await api('post', 'rooms', t1, { floorId: fl1, roomTypeId: rt1, number: '503' })).body.room.id;
    expect((await api('patch', `rooms/${r}`, t2, { note: 'hack' })).status).toBe(404);
    expect((await api('delete', `rooms/${r}`, t2)).status).toBe(404);
    expect((await api('patch', `rooms/${r}`, t1, { roomTypeId: rt2 })).body.error.code).toBe('ROOM_TYPE_NOT_FOUND');
    expect((await api('delete', `floors/${fl1}`, t2)).status).toBe(404);
  });

  it('xóa tầng còn phòng -> 409 FLOOR_HAS_ROOMS; sau khi chuyển/xóa phòng thì xóa được', async () => {
    const rt = await mkRoomType(H1, 3);
    const fl = await floor(6);
    const r = (await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '601' })).body.room.id;
    expect((await api('delete', `floors/${fl}`)).body.error.code).toBe('FLOOR_HAS_ROOMS');
    await api('delete', `rooms/${r}`);
    expect((await api('delete', `floors/${fl}`)).status).toBe(200);
  });

  it('không giảm total_rooms dưới số đang giữ/đặt: ngừng/xóa phòng -> 409 ROOM_TOTAL_BELOW_RESERVED, rollback', async () => {
    const rt = await mkRoomType(H1, 0);
    const fl = await floor(7);
    const rooms = (await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 701, to: 703 })).body.items as Array<{ id: string }>;
    expect((await book(H1, rt, 5, 3)).status).toBe(201);
    const stop = await api('patch', `rooms/${rooms[0]!.id}`, t1, { status: 'INACTIVE' });
    expect(stop.status).toBe(409);
    expect(stop.body.error.code).toBe('ROOM_TOTAL_BELOW_RESERVED');
    expect(stop.body.error.details.peak).toBe(3);
    expect((await one<any>('SELECT status FROM rooms WHERE id = $1', [rooms[0]!.id]))!.status).toBe('ACTIVE');
    expect((await api('delete', `rooms/${rooms[1]!.id}`)).body.error.code).toBe('ROOM_TOTAL_BELOW_RESERVED');
    expect(await count('rooms', 'room_type_id = $1', [rt])).toBe(3);
    expect((await rtOf(rt)).totalRooms).toBe(3);
    // thêm phòng thì tăng tồn và đặt thêm được
    await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '704' });
    expect((await rtOf(rt)).totalRooms).toBe(4);
    expect((await book(H1, rt, 5, 1)).status).toBe(201);
    expect((await book(H1, rt, 5, 1)).status).toBe(409); // hết phòng
  });

  it('PATCH totalRooms thủ công khi loại đã có phòng -> 409 TOTAL_MANAGED_BY_ROOMS; giá trị không đổi thì cho qua; loại chưa có phòng vẫn nhập tay', async () => {
    const rt = await mkRoomType(H1, 0);
    const fl = await floor(8);
    await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, from: 801, to: 802 });
    const bad = await api('patch', `room-types/${rt}`, t1, { totalRooms: 9 });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('TOTAL_MANAGED_BY_ROOMS');
    expect((await api('patch', `room-types/${rt}`, t1, { totalRooms: 2, name: 'Đổi tên' })).status).toBe(200);
    const free = await mkRoomType(H1, 4);
    expect((await api('patch', `room-types/${free}`, t1, { totalRooms: 6 })).body.roomType.totalRooms).toBe(6);
  });

  it('chuyển phòng sang loại khác: đồng bộ cả hai loại', async () => {
    const a = await mkRoomType(H1, 0);
    const b = await mkRoomType(H1, 0);
    const fl = await floor(9);
    const rs = (await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: a, from: 901, to: 902 })).body.items as Array<{ id: string }>;
    await api('post', 'rooms', t1, { floorId: fl, roomTypeId: b, number: '910' });
    expect((await api('patch', `rooms/${rs[0]!.id}`, t1, { roomTypeId: b })).status).toBe(200);
    expect((await rtOf(a)).totalRooms).toBe(1);
    expect((await rtOf(b)).totalRooms).toBe(2);
  });

  it('ảnh phòng tối đa 5 (ảnh đầu = bìa, giữ thứ tự), ảnh loại phòng tối đa 10; khóa sai/trùng -> 422', async () => {
    const rt = await mkRoomType(H1, 2);
    const fl = await floor(10);
    const five = Array.from({ length: 5 }, () => key());
    const r = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '1001', images: five });
    expect(r.status).toBe(201);
    expect(r.body.room.images.map((i: any) => i.key)).toEqual(five);
    expect(r.body.room.images[0].url).toContain(five[0]);
    const reordered = [...five].reverse();
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: reordered })).body.room.images.map((i: any) => i.key)).toEqual(reordered);
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: [...five, key()] })).status).toBe(422);
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: [five[0], five[0]] })).status).toBe(422);
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: ['hotels/2026/x.jpg'] })).status).toBe(422);
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: ['../../etc/passwd'] })).status).toBe(422);
    expect((await api('patch', `rooms/${r.body.room.id}`, t1, { images: [] })).body.room.images).toEqual([]);

    const ten = Array.from({ length: 10 }, () => key());
    const p = await api('patch', `room-types/${rt}`, t1, { images: ten, description: 'Phòng đẹp <b>x</b>', view: 'Biển', amenities: ['WIFI', 'BALCONY'], smoking: true, maxAdults: 2, maxChildren: 1 });
    expect(p.status).toBe(200);
    expect(p.body.roomType).toMatchObject({ description: 'Phòng đẹp <b>x</b>', view: 'Biển', amenities: ['WIFI', 'BALCONY'], smoking: true, maxAdults: 2, maxChildren: 1 });
    expect(p.body.roomType.images.map((i: any) => i.key)).toEqual(ten);
    expect((await api('patch', `room-types/${rt}`, t1, { images: [...ten, key()] })).status).toBe(422);
    expect((await api('patch', `room-types/${rt}`, t1, { amenities: ['WIFI', 'WIFI'] })).status).toBe(422);
    expect((await api('patch', `room-types/${rt}`, t1, { amenities: ['LASER'] })).status).toBe(422);
    const cleared = await api('patch', `room-types/${rt}`, t1, { view: null, maxChildren: null });
    expect(cleared.body.roomType.view).toBeUndefined();
    expect(cleared.body.roomType.maxAdults).toBe(2); // trường không nêu giữ nguyên
    expect(cleared.body.roomType.images).toHaveLength(10);
    const created = await api('post', 'room-types', t1, { code: 'IMG', name: 'Có ảnh', capacity: 2, beds: 1, totalRooms: 1, baseNightVnd: 500000, images: [key()], amenities: ['TV'] });
    expect(created.status).toBe(201);
    expect(created.body.roomType.images).toHaveLength(1);
  });

  it('quyền: thiếu ROOM_MANAGE -> 403 khi ghi, GET (BOOKING_READ) 200', async () => {
    const rt = await mkRoomType(H1, 1);
    const fl = await floor(11);
    expect((await api('post', 'floors', readOnly, { name: 'x', level: 12 })).status).toBe(403);
    expect((await api('post', 'rooms', readOnly, { floorId: fl, roomTypeId: rt, number: '1101' })).status).toBe(403);
    expect((await api('post', 'rooms/bulk', readOnly, { floorId: fl, roomTypeId: rt, from: 1, to: 2 })).status).toBe(403);
    expect((await api('patch', `floors/${fl}`, readOnly, { name: 'y' })).status).toBe(403);
    expect((await api('delete', `floors/${fl}`, readOnly)).status).toBe(403);
    expect((await api('get', 'floors', readOnly)).status).toBe(200);
    expect((await api('get', 'rooms', readOnly)).status).toBe(200);
    expect((await request(app).get('/v1/hotel/rooms')).status).toBe(401);
  });

  it('validation: số phòng ký tự lạ / trạng thái sai / body rỗng -> 422', async () => {
    const rt = await mkRoomType(H1, 1);
    const fl = await floor(12);
    for (const bad of [{ number: '<script>' }, { number: '' }, { number: 'a'.repeat(11) }, { status: 'DELETED' }]) {
      expect((await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: '1201', ...bad })).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await api('patch', `floors/${fl}`, t1, {})).status).toBe(422);
  });

  it('hồi quy: loại phòng không có phòng riêng đặt khách lẻ + tồn như cũ', async () => {
    const rt = await mkRoomType(H1, 2);
    expect((await book(H1, rt, 20, 2)).status).toBe(201);
    expect((await book(H1, rt, 20, 1)).status).toBe(409);
    expect(await db.query('SELECT 1 FROM rooms WHERE room_type_id = $1', [rt]).then((r) => r.rowCount)).toBe(0);
  });

  it('số phòng không phân biệt hoa/thường: A1 và a1 trùng (đơn lẻ, hàng loạt, sửa)', async () => {
    const rt = await mkRoomType(H1, 0);
    const fl = await floor(13);
    expect((await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: 'A1' })).status).toBe(201);
    expect((await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: 'a1' })).body.error.code).toBe('ROOM_NUMBER_TAKEN');
    expect((await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, prefix: 'a', from: 1, to: 3 })).body.error.code).toBe('ROOM_NUMBER_TAKEN');
    expect(await count('rooms', 'room_type_id = $1', [rt])).toBe(1);
    const b = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: 'B2' });
    expect((await api('patch', `rooms/${b.body.room.id}`, t1, { number: 'a1' })).body.error.code).toBe('ROOM_NUMBER_TAKEN');
    expect((await api('patch', `rooms/${b.body.room.id}`, t1, { number: 'b2' })).status).toBe(200); // đổi hoa/thường chính nó vẫn được
    expect((await api('post', 'rooms', t2, { floorId: await floor(13, t2), roomTypeId: await mkRoomType(H2, 0), number: 'a1' })).status).toBe(201);
  });

  it('trần 500 phòng ACTIVE mỗi loại: thêm/bulk/đổi trạng thái vượt -> 409 ROOM_COUNT_LIMIT, bulk all-or-nothing', async () => {
    const rt = await mkRoomType(H1, 0);
    const fl = await floor(14);
    for (let k = 0; k < 5; k++) expect((await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, prefix: `L${k}-`, from: 1, to: 100 })).status).toBe(201);
    expect((await rtOf(rt)).totalRooms).toBe(500);
    const over = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: 'X1' });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('ROOM_COUNT_LIMIT');
    expect((await api('post', 'rooms/bulk', t1, { floorId: fl, roomTypeId: rt, prefix: 'Y', from: 1, to: 5 })).body.error.code).toBe('ROOM_COUNT_LIMIT');
    expect(await count('rooms', 'room_type_id = $1', [rt])).toBe(500);
    const off = await api('post', 'rooms', t1, { floorId: fl, roomTypeId: rt, number: 'X2', status: 'INACTIVE' });
    expect(off.status).toBe(201);
    expect((await api('patch', `rooms/${off.body.room.id}`, t1, { status: 'ACTIVE' })).body.error.code).toBe('ROOM_COUNT_LIMIT');
    expect((await rtOf(rt)).totalRooms).toBe(500);
  });

  it('Admin nêu hotelId không tồn tại -> 404 HOTEL_NOT_FOUND (không 500)', async () => {
    const admin = (await mkAdmin([PERM.BOOKING_READ, PERM.ROOM_MANAGE, PERM.HOTEL_SCOPE_ALL])).token;
    const bad = `?hotelId=${crypto.randomUUID()}`;
    const fl = crypto.randomUUID();
    for (const [m, u, b] of [
      ['post', 'floors', { name: 'T', level: 1 }],
      ['get', 'floors', undefined],
      ['post', 'rooms', { floorId: fl, roomTypeId: fl, number: '1' }],
      ['post', 'rooms/bulk', { floorId: fl, roomTypeId: fl, from: 1, to: 2 }],
      ['get', 'room-types', undefined],
      ['post', 'room-blocks', { roomTypeId: fl, kind: 'MAINTENANCE', from: new Date(Date.now() + DAY).toISOString(), to: new Date(Date.now() + 2 * DAY).toISOString(), reason: 'bảo trì' }],
    ] as const) {
      const r = await api(m, u + bad, admin, b);
      expect(r.status, `${m} ${u}`).toBe(404);
      expect(r.body.error.code).toBe('HOTEL_NOT_FOUND');
    }
  });
});
