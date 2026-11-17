import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceFee } from '@airrest/business-logic';
import { createApp } from '../api/app';
import { CONFIG_KEYS } from '../config/configKeys';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { buildSepayIpn } from '../lib/sepay';
import { processRefund, reconcilePayments } from '../services/payments/payments.service';
import { closeDb, count, db, freshDb, mkHotel, mkRoomType, mkStaff, one } from './support/db';
import { guestIp } from './support/flows';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const DAY = 86400_000;
const MIN = 60_000;
const FEE = CONFIG_KEYS['pricing.serviceFee'].default;
const ROOM = 800_000;
const LEG = 80_000; // HAN 5 km, ban ngày: 60.000 + (5 - 3) × 10.000

// Ngày `off` kể từ hôm nay, đúng giờ UTC `h` (4 = 11:00 VN, 5 = 12:00 VN: ngoài khung phụ thu đêm).
const dayAt = (off: number, h: number) => new Date(Math.floor(Date.now() / DAY) * DAY + off * DAY + h * 3600_000);

run('tích hợp: đặt xe cùng đơn — tạo đơn, tiền, thanh toán, hết hạn, hoàn tiền, hủy', () => {
  const app = createApp();
  let paid = ''; // khách sạn có xe tính phí
  let free = ''; // xe miễn phí
  let none = ''; // không có xe
  let paidRt = '';
  let freeRt = '';
  let noneRt = '';
  let n = 0;
  let off = 5;
  const nextOff = () => (off += 3);
  const ipFor = () => guestIp((++n % 200) + 1);
  const legs2 = (o: number) => [
    { direction: 'TO_HOTEL', pickupAt: dayAt(o, 5).toISOString() },
    { direction: 'TO_AIRPORT', pickupAt: dayAt(o + 1, 5).toISOString() },
  ];

  interface BookOpts { hotel?: string; rt?: string; method?: 'AT_HOTEL' | 'SEPAY'; legs?: unknown[] | null; guests?: number; children?: number; qty?: number; off?: number; key?: string; shuttle?: unknown }
  const book = (o: BookOpts = {}) => {
    const d = o.off ?? nextOff();
    const legs = o.legs === undefined ? legs2(d) : o.legs;
    return request(app)
      .post('/v1/bookings')
      .set('Idempotency-Key', o.key ?? `sb-${randomUUID()}`)
      .send({
        hotelId: o.hotel ?? paid, roomTypeId: o.rt ?? paidRt, qty: o.qty ?? 1, paymentMethod: o.method ?? 'AT_HOTEL',
        from: dayAt(d, 4).toISOString(), to: dayAt(d + 1, 4).toISOString(),
        guest: { fullName: 'Khách Xe', phone: '0912345678' },
        ...(o.guests !== undefined && { guests: o.guests }), ...(o.children !== undefined && { children: o.children }),
        ...(o.shuttle !== undefined ? { shuttle: o.shuttle } : legs ? { shuttle: { legs } } : {}),
      });
  };
  const row = async (code: string) => (await one<any>('SELECT * FROM bookings WHERE code = $1', [code]))!;
  const reqs = async (bookingId: string) => (await db.query<any>('SELECT * FROM shuttle_requests WHERE booking_id = $1 ORDER BY direction DESC', [bookingId])).rows; // TO_HOTEL trước
  const payOf = async (bookingId: string) => (await one<any>('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [bookingId]))!;
  const pay = async (code: string) => {
    const b = await row(code);
    const p = await payOf(b.id);
    const r = await request(app).post('/v1/payments/sepay/ipn').send(buildSepayIpn({ invoice: p.gateway.orderId, amount: p.amountVnd, success: true, transactionId: 'tx-test' }));
    expect([200, 204]).toContain(r.status);
  };
  // Đơn đã trả tiền nhưng còn chờ khách sạn duyệt (PENDING + HOLD): SePay nay xác nhận ngay nên trạng thái này chỉ còn ở đơn cũ; dựng lại để kiểm logic hoàn tiền khi từ chối.
  const asLegacyPaidPending = async (id: string) => {
    await db.query("UPDATE bookings SET status = 'PENDING', expires_at = now() + interval '1 hour' WHERE id = $1", [id]);
    await db.query("UPDATE room_reservations SET state = 'HOLD', hold_expires_at = now() + interval '1 hour' WHERE booking_id = $1", [id]);
  };
  const ledger = async (bookingId: string) => {
    const rows = (await db.query<{ account: string; s: number }>('SELECT account, sum(amount_vnd) AS s FROM ledger_entries WHERE booking_id = $1 GROUP BY account', [bookingId])).rows;
    const g = (a: string) => Number(rows.find((r) => r.account === a)?.s ?? 0);
    return { paid: g('CUSTOMER_PAID'), hotel: g('HOTEL_PAYABLE'), rev: g('AIRREST_REVENUE'), refundable: g('CUSTOMER_REFUNDABLE') };
  };
  const cancelLeg = (code: string, id: string) => request(app).post(`/v1/shuttle-requests/${id}/cancel`).set(ipFor()).send({ code, phone: '+84912345678' });
  const askCancelOrder = (code: string) => request(app).post('/v1/change-requests').set(ipFor()).set('Idempotency-Key', `co-${randomUUID()}`).send({ code, phone: '+84912345678', type: 'CANCEL', reasonCode: 'CHANGE_OF_PLAN' });
  const lookup = (code: string) => request(app).post('/v1/bookings/lookup').set(ipFor()).send({ code, phone: '+84912345678' });
  let staff = '';
  const approve = (id: string) => request(app).post(`/v1/hotel/change-requests/${id}/approve`).set({ Authorization: `Bearer ${staff}` }).send({});
  const addTrip = (r: any, status: string) =>
    db.query("INSERT INTO shuttle_trips (request_id, booking_id, hotel_id, kind, seats, status) VALUES ($1,$2,$3,'EXTERNAL',$4,$5)", [r.id, r.bookingId, r.hotelId, r.passengers, status]);

  beforeAll(async () => {
    await freshDb({ roles: true });
    paid = await mkHotel({ code: 'SP', name: 'KS Xe Có Phí' });
    free = await mkHotel({ code: 'SF', name: 'KS Xe Miễn Phí' });
    none = await mkHotel({ code: 'SN', name: 'KS Không Xe' });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [paid]);
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_FREE'] WHERE id = $1", [free]);
    paidRt = await mkRoomType(paid, 30, ROOM);
    freeRt = await mkRoomType(free, 30, ROOM);
    noneRt = await mkRoomType(none, 30, ROOM);
    staff = (await mkStaff(paid, [PERM.REQUEST_HANDLE, PERM.BOOKING_READ, PERM.BOOKING_DECIDE, PERM.FLEET_MANAGE])).token;
  });
  afterAll(async () => closeDb());

  // ---------- Báo giá trước khi có đơn ----------
  it('POST /hotels/:id/shuttle-quote: không có xe -> offered false; có phí -> giá từng chiều; free -> 0; sai KS 404; body sai 422', async () => {
    const q0 = await request(app).post(`/v1/hotels/${none}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL' }] });
    expect(q0.status).toBe(200);
    expect(q0.body).toEqual({ offered: false, free: false, legs: [], totalVnd: 0 });
    const q = await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL' }, { direction: 'TO_AIRPORT', airport: 'han' }], guests: 3 });
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ offered: true, free: false, totalVnd: 2 * LEG, guests: 3 });
    expect(q.body.legs[0]).toMatchObject({ direction: 'TO_HOTEL', airport: 'HAN', distanceKm: 5, priceVnd: LEG });
    const night = await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL', pickupAt: dayAt(9, 15).toISOString() }] }); // 22:00 VN
    expect(night.body.legs[0]).toMatchObject({ priceVnd: 96_000, night: true });
    const qf = await request(app).post(`/v1/hotels/${free}/shuttle-quote`).send({ legs: [{ direction: 'TO_AIRPORT' }] });
    expect(qf.body).toMatchObject({ offered: true, free: true, totalVnd: 0 });
    expect((await request(app).post(`/v1/hotels/${randomUUID()}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL' }] })).status).toBe(404);
    expect((await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [] })).status).toBe(422);
    expect((await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL' }, { direction: 'TO_HOTEL' }] })).status).toBe(422);
    expect((await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL', airport: 'SGN' }] })).body.error.code).toBe('AIRPORT_NOT_SERVED');
    const detail = await request(app).get(`/v1/hotels/${paid}`);
    expect(detail.body.hotel.features.shuttle).toBe('paid'); // FE biết khách sạn có xe
  });

  // ---------- Tạo đơn: tiền ----------
  it('2 chiều có phí (SePay): tổng = phòng + xe + phí DV(phòng+xe); payments.amount khớp; yêu cầu xe REQUESTED, billed, passengers = guests; quote khớp', async () => {
    const quote = await request(app).post(`/v1/hotels/${paid}/shuttle-quote`).send({ legs: [{ direction: 'TO_HOTEL' }, { direction: 'TO_AIRPORT' }] });
    const res = await book({ method: 'SEPAY', guests: 2, qty: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const fee = serviceFee(ROOM + 2 * LEG, FEE);
    expect(res.body.booking.pricing).toMatchObject({ roomVnd: ROOM, shuttleVnd: 2 * LEG, serviceFeeVnd: fee, totalVnd: ROOM + 2 * LEG + fee });
    expect(res.body.booking.pricing.shuttleVnd).toBe(quote.body.totalVnd); // báo giá trước đặt = số tiền sau đặt
    expect(res.body.booking.shuttle).toEqual({ tripType: 'ROUND_TRIP', legCount: 2 });
    expect(res.body.shuttles).toHaveLength(2);
    expect(res.body.booking.status).toBe('PENDING_PAYMENT');
    const b = await row(res.body.booking.code);
    expect(b.shuttle).toEqual({ tripType: 'ROUND_TRIP', legCount: 2 });
    const p = await payOf(b.id);
    expect(p.amountVnd).toBe(ROOM + 2 * LEG + fee);
    expect(res.body.paymentLink.payUrl).toContain('orderId=');
    const rs = await reqs(b.id);
    expect(rs.map((r) => [r.direction, r.status, r.priceVnd, r.billed, r.passengers])).toEqual([['TO_HOTEL', 'REQUESTED', LEG, true, 2], ['TO_AIRPORT', 'REQUESTED', LEG, true, 2]]);
    expect(await count('shuttle_trips', 'booking_id = $1', [b.id])).toBe(0); // chưa thanh toán: KHÔNG điều phối
    const look = await lookup(res.body.booking.code);
    expect(look.body.booking.pricing.shuttleVnd).toBe(2 * LEG);
    expect(look.body.shuttles).toHaveLength(2);
  });

  it('1 chiều: ONE_WAY, giá 1 chiều; AT_HOTEL: cộng vào tổng đơn nhưng không có giao dịch online, đơn CONFIRMED', async () => {
    const res = await book({ legs: [{ direction: 'TO_AIRPORT', pickupAt: dayAt(40, 5).toISOString(), location: 'Sảnh A', note: 'ghi chú' }], off: 39 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.booking.status).toBe('CONFIRMED');
    expect(res.body.booking.shuttle).toEqual({ tripType: 'ONE_WAY', legCount: 1 });
    expect(res.body.booking.pricing).toMatchObject({ shuttleVnd: LEG, totalVnd: ROOM + LEG + serviceFee(ROOM + LEG, FEE) });
    const b = await row(res.body.booking.code);
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(0);
    const r = (await reqs(b.id))[0];
    expect(r).toMatchObject({ location: 'Sảnh A', note: 'ghi chú', priceVnd: LEG, billed: true, airportIata: 'HAN' });
  });

  it('khách sạn xe miễn phí: giá 0, vẫn tạo yêu cầu, phí DV chỉ trên tiền phòng', async () => {
    const res = await book({ hotel: free, rt: freeRt, method: 'SEPAY' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.booking.pricing).toMatchObject({ shuttleVnd: 0, totalVnd: ROOM + serviceFee(ROOM, FEE) });
    const b = await row(res.body.booking.code);
    expect((await payOf(b.id)).amountVnd).toBe(ROOM + serviceFee(ROOM, FEE));
    expect((await reqs(b.id)).map((r) => r.priceVnd)).toEqual([0, 0]);
  });

  it('không gửi shuttle: hành vi cũ nguyên vẹn (shuttleVnd 0, NONE, không yêu cầu xe, tổng = phòng + phí)', async () => {
    const res = await book({ legs: null, method: 'SEPAY' });
    expect(res.status).toBe(201);
    expect(res.body.booking.pricing).toMatchObject({ shuttleVnd: 0, totalVnd: ROOM + serviceFee(ROOM, FEE) });
    expect(res.body.booking.shuttle).toEqual({ tripType: 'NONE', legCount: 0 });
    expect(res.body.shuttles).toBeUndefined();
    const b = await row(res.body.booking.code);
    expect(await count('shuttle_requests', 'booking_id = $1', [b.id])).toBe(0);
  });

  // ---------- Kiểm tra đầu vào ----------
  it('422: khách sạn không có xe (SHUTTLE_NOT_OFFERED); sân bay không phục vụ; giờ đón ngoài cửa sổ; client gửi giá/passengers/trùng chiều/quá 2 chiều', async () => {
    const r1 = await book({ hotel: none, rt: noneRt });
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe('SHUTTLE_NOT_OFFERED');
    expect(await count('bookings', 'hotel_id = $1', [none])).toBe(0);
    const d = nextOff();
    const out = await book({ off: d, legs: [{ direction: 'TO_HOTEL', pickupAt: dayAt(d + 5, 5).toISOString() }] });
    expect(out.body.error.code).toBe('PICKUP_OUT_OF_STAY_WINDOW');
    const past = await book({ off: d, legs: [{ direction: 'TO_HOTEL', pickupAt: dayAt(-3, 5).toISOString() }] });
    expect(past.status).toBe(422);
    const ap = await book({ off: d, legs: [{ direction: 'TO_HOTEL', pickupAt: dayAt(d, 5).toISOString(), airport: 'SGN' }] });
    expect(ap.body.error.code).toBe('AIRPORT_NOT_SERVED');
    const L = { direction: 'TO_HOTEL', pickupAt: dayAt(d, 5).toISOString() };
    expect((await book({ off: d, legs: [{ ...L, priceVnd: 1 }] })).status).toBe(422); // không nhận giá từ client
    expect((await book({ off: d, shuttle: { legs: [L], passengers: 3 } })).status).toBe(422); // passengers không còn trong body tạo đơn
    expect((await book({ off: d, legs: [L, L] })).status).toBe(422);
    expect((await book({ off: d, legs: [L, { ...L, direction: 'TO_AIRPORT' }, { ...L, direction: 'TO_AIRPORT' }] })).status).toBe(422);
    expect((await book({ off: d, legs: [{ direction: 'TO_HOTEL', pickupAt: '2030-01-01T10:00:00' }] })).status).toBe(422); // thiếu offset
    expect(await count('bookings', 'hotel_id = $1', [paid])).toBe(await count('bookings', 'hotel_id = $1', [paid])); // không chặn thêm
  });

  // ---------- guests / children ----------
  it('guests: vượt sức chứa -> 422 GUESTS_EXCEED_CAPACITY (details.maxGuests); không gửi = 1; children > guests -> 422; mặc định children 0; hiển thị ở các response', async () => {
    const over = await book({ legs: null, guests: 3 }); // sức chứa mặc định 2/phòng, qty 1
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('GUESTS_EXCEED_CAPACITY');
    expect(over.body.error.details.maxGuests).toBe(2);
    expect((await book({ legs: null, guests: 3, qty: 2 })).status).toBe(201); // 2 phòng × 2 = 4
    const bad = await book({ legs: null, guests: 2, children: 3 });
    expect(bad.status).toBe(422);
    const def = await book({ legs: null });
    expect(def.body.booking).toMatchObject({ guests: 1, children: 0 });
    const ok = await book({ legs: null, guests: 2, children: 1 });
    expect(ok.status).toBe(201);
    expect(ok.body.booking).toMatchObject({ guests: 2, children: 1 });
    expect((await lookup(ok.body.booking.code)).body.booking).toMatchObject({ guests: 2, children: 1 });
    const b = await row(ok.body.booking.code);
    expect(b.guest).toMatchObject({ count: 2, children: 1 });
    const detail = await request(app).get(`/v1/hotel/bookings/${b.id}`).set({ Authorization: `Bearer ${staff}` });
    expect(detail.body.booking.guest).toMatchObject({ count: 2, children: 1 });
    const list = await request(app).get('/v1/hotel/bookings').set({ Authorization: `Bearer ${staff}` });
    expect(list.body.items.find((x: any) => x.code === ok.body.booking.code).guest).toMatchObject({ count: 2, children: 1 });
    // đơn cũ (chưa lưu số người) hiển thị 1 người, 0 trẻ em
    await db.query("UPDATE bookings SET guest = guest - 'count' - 'children' WHERE id = $1", [b.id]);
    expect((await lookup(ok.body.booking.code)).body.booking).toMatchObject({ guests: 1, children: 0 });
    expect((await request(app).get(`/v1/hotel/bookings/${b.id}`).set({ Authorization: `Bearer ${staff}` })).body.booking.guest).toMatchObject({ count: 1, children: 0 });
  });

  it('số khách đi xe: lấy guests của đơn; yêu cầu xe sau đó mặc định = guests, gửi lớn hơn -> 422, nhỏ hơn được', async () => {
    const res = await book({ guests: 4, qty: 2, legs: [{ direction: 'TO_HOTEL', pickupAt: dayAt(60, 5).toISOString() }], off: 59 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.shuttles[0].passengers).toBe(4);
    const code = res.body.booking.code;
    const body = { code, phone: '+84912345678', direction: 'TO_AIRPORT', airport: 'HAN', pickupAt: dayAt(60, 8).toISOString() };
    const q = await request(app).post('/v1/shuttle-requests/quote').set(ipFor()).send(body);
    expect(q.body.quote.passengers).toBe(4);
    const tooMany = await request(app).post('/v1/shuttle-requests').set(ipFor()).set('Idempotency-Key', `sh-${randomUUID()}`).send({ ...body, passengers: 5 });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.code).toBe('PASSENGERS_EXCEED_GUESTS');
    const fewer = await request(app).post('/v1/shuttle-requests').set(ipFor()).set('Idempotency-Key', `sh-${randomUUID()}`).send({ ...body, passengers: 3 });
    expect(fewer.status).toBe(201);
    expect(fewer.body.shuttle.passengers).toBe(3);
    // yêu cầu tạo SAU đơn: không thu riêng (billed = false), giá đơn không đổi
    const r = await one<any>('SELECT billed FROM shuttle_requests WHERE id = $1', [fewer.body.shuttle.id]);
    expect(r!.billed).toBe(false);
    expect((await row(code)).pricing.totalVnd).toBe(res.body.booking.pricing.totalVnd);
  });

  // ---------- Thanh toán + điều phối ----------
  it.each(['SEPAY'] as const)('%s: thanh toán thành công -> CONFIRMED, sổ cái cân (xe thuộc HOTEL_PAYABLE), yêu cầu xe vào hàng chờ; 5 khách tới hạn -> 2 xe 4 chỗ', async (method) => {
    // Khách sạn riêng có 2 xe 4 chỗ để kiểm điều phối.
    const h = await mkHotel({ code: `D${method.slice(0, 2)}` });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [h]);
    const rt = await mkRoomType(h, 30, ROOM);
    await db.query('UPDATE room_types SET capacity = 3 WHERE id = $1', [rt]);
    const owner = (await mkStaff(h, [PERM.FLEET_MANAGE])).token;
    for (const k of [1, 2]) {
      const v = await request(app).post('/v1/hotel/vehicles').set({ Authorization: `Bearer ${owner}` }).send({ plate: `30A-${method === 'SEPAY' ? 1 : 2}000${k}`, seats: 4, model: 'Xe 4 chỗ' });
      expect(v.status, JSON.stringify(v.body)).toBe(201);
      const d = await request(app).post('/v1/hotel/drivers').set({ Authorization: `Bearer ${owner}` }).send({ email: `d${randomUUID().slice(0, 8)}@airrest.vn`, password: 'MatKhau-Tai-Xe-1', fullName: `Tài xế ${k}`, phone: '0988777666', vehicleId: v.body.vehicle.id });
      expect(d.status, JSON.stringify(d.body)).toBe(201);
    }
    const from = new Date(Date.now() + 30 * MIN);
    const res = await request(app).post('/v1/bookings').set('Idempotency-Key', `sb-${randomUUID()}`).send({
      hotelId: h, roomTypeId: rt, qty: 2, guests: 5, children: 1, paymentMethod: method, from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString(),
      guest: { fullName: 'Đoàn 5 người', phone: '0912345678' },
      shuttle: { legs: [{ direction: 'TO_HOTEL', pickupAt: new Date(Date.now() + 20 * MIN).toISOString() }] },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const b = await row(res.body.booking.code);
    expect(b.status).toBe('PENDING_PAYMENT');
    expect(await count('shuttle_trips', 'booking_id = $1', [b.id])).toBe(0);
    const total = 2 * ROOM + LEG + serviceFee(2 * ROOM + LEG, FEE);
    expect(b.pricing.totalVnd).toBe(total);
    expect((await payOf(b.id)).amountVnd).toBe(total);
    await pay(b.code);
    await pay(b.code); // IPN lặp: không sinh thêm gì
    const after = await row(b.code);
    expect(after).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paidVnd: total });
    const l = await ledger(b.id);
    const fee = b.pricing.serviceFeeVnd;
    expect(l).toMatchObject({ paid: total, hotel: total - fee, rev: fee });
    expect(l.hotel + l.rev).toBe(l.paid); // cân: tiền khách trả = phần khách sạn (phòng + xe) + phí nền tảng
    const trips = (await db.query<any>('SELECT * FROM shuttle_trips WHERE booking_id = $1 ORDER BY seats DESC', [b.id])).rows;
    expect(trips.map((t) => [t.status, t.seats])).toEqual([['OFFERED', 4], ['OFFERED', 1]]); // 5 khách -> 2 xe 4 chỗ, thanh toán xong mới điều phối
    expect(await count('shuttle_requests', "booking_id = $1 AND passengers = 5", [b.id])).toBe(1);
  });

  it('thanh toán xong, giờ đón còn xa: yêu cầu ở lại hàng chờ (REQUESTED, chưa chuyến); vòng quét điều phối khi tới hạn', async () => {
    const res = await book({ method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    expect(b.status).toBe('CONFIRMED');
    expect((await reqs(b.id)).map((r) => r.status)).toEqual(['REQUESTED', 'REQUESTED']);
    expect(await count('shuttle_trips', 'booking_id = $1', [b.id])).toBe(0);
  });

  // ---------- Idempotency / rollback ----------
  it('Idempotency-Key lặp: không tạo trùng đơn/yêu cầu xe/giao dịch', async () => {
    const key = `idem-${randomUUID()}`;
    const d = nextOff();
    const a = await book({ method: 'SEPAY', key, off: d });
    const c = await book({ method: 'SEPAY', key, off: d });
    expect(a.status).toBe(201);
    expect(c.body.booking.code).toBe(a.body.booking.code);
    const b = await row(a.body.booking.code);
    expect(await count('bookings', 'code = $1', [b.code])).toBe(1);
    expect(await count('shuttle_requests', 'booking_id = $1', [b.id])).toBe(2);
    expect(await count('payments', 'booking_id = $1', [b.id])).toBe(1);
  });

  it('hết phòng -> 409 SOLD_OUT như cũ, rollback toàn bộ: không còn yêu cầu xe mồ côi', async () => {
    const rt = await mkRoomType(paid, 1, ROOM);
    const d = nextOff();
    expect((await book({ rt, off: d, legs: null })).status).toBe(201);
    const before = await count('shuttle_requests');
    const res = await book({ rt, off: d });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOLD_OUT');
    expect(await count('shuttle_requests')).toBe(before);
  });

  // ---------- Hết hạn ----------
  it('hết hạn giữ phòng chưa thanh toán: đơn EXPIRED, yêu cầu xe bị hủy cùng transaction; thanh toán đến muộn -> hoàn 100%, xe vẫn hủy', async () => {
    const res = await book({ method: 'SEPAY' });
    const b = await row(res.body.booking.code);
    await db.query("UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1", [b.id]);
    await reconcilePayments({ type: 'SYSTEM' });
    expect((await row(b.code)).status).toBe('EXPIRED');
    expect((await reqs(b.id)).map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(await count('shuttle_trips', 'booking_id = $1', [b.id])).toBe(0);
    await pay(b.code); // tiền về sau khi hết hạn
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ reasonCode: 'LATE_PAYMENT', amountVnd: b.pricing.totalVnd }); // gồm cả phần xe
  });

  it('từ chối/hết hạn chờ duyệt: hoàn toàn bộ số đã trả (gồm xe), xe bị hủy; khách đã hủy riêng một chiều trước đó vẫn hoàn đủ', async () => {
    const h = await mkHotel({ code: 'MAN', manual: true });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'] WHERE id = $1", [h]);
    const rt = await mkRoomType(h, 30, ROOM);
    const t = (await mkStaff(h, [PERM.BOOKING_DECIDE, PERM.BOOKING_READ])).token;
    const a = await book({ hotel: h, rt, method: 'SEPAY' });
    await pay(a.body.booking.code);
    expect((await row(a.body.booking.code)).status).toBe('CONFIRMED'); // SePay: xác nhận ngay, không chờ duyệt
    await asLegacyPaidPending((await row(a.body.booking.code)).id);
    const ba = await row(a.body.booking.code);
    expect(ba.status).toBe('PENDING');
    const rj = await request(app).post(`/v1/hotel/bookings/${ba.id}/reject`).set({ Authorization: `Bearer ${t}` }).send({ reason: 'Hết phòng thật' });
    expect(rj.status, JSON.stringify(rj.body)).toBe(200);
    const ra = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [ba.id])).rows;
    expect(ra).toHaveLength(1);
    expect(ra[0]).toMatchObject({ reasonCode: 'HOTEL_REJECTED', amountVnd: ba.pricing.totalVnd });
    expect((await reqs(ba.id)).map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    // đơn khác: khách hủy riêng 1 chiều (không hoàn) rồi khách sạn từ chối -> hoàn đủ số đã trả, gồm cả xe
    const c = await book({ hotel: h, rt, method: 'SEPAY' });
    await pay(c.body.booking.code);
    await asLegacyPaidPending((await row(c.body.booking.code)).id);
    const bc = await row(c.body.booking.code);
    const toHotel = (await reqs(bc.id))[0];
    expect((await cancelLeg(bc.code, toHotel.id)).status).toBe(200);
    const rj2 = await request(app).post(`/v1/hotel/bookings/${bc.id}/reject`).set({ Authorization: `Bearer ${t}` }).send({ reason: 'Từ chối sau khi hủy chiều' });
    expect(rj2.status).toBe(200);
    const rc = (await db.query<any>('SELECT reason_code, amount_vnd FROM refunds WHERE booking_id = $1 ORDER BY seq', [bc.id])).rows;
    expect(rc.map((r) => [r.reasonCode, r.amountVnd])).toEqual([['HOTEL_REJECTED', bc.paidVnd]]);
  });

  // ---------- Hủy riêng một chiều ----------
  it.each(['SEPAY'] as const)('%s: hủy riêng chiều (trước/sau khi tài xế nhận) -> KHÔNG hoàn, số tiền đơn giữ nguyên, idempotent, sổ cái không đổi', async (method) => {
    const res = await book({ method });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const [toHotel, toAirport] = await reqs(b.id);
    await addTrip(toHotel, 'NEEDS_EXTERNAL'); // chưa có tài xế nhận: vẫn KHÔNG hoàn
    const before = await ledger(b.id);
    const c1 = await cancelLeg(b.code, toHotel.id);
    expect(c1.status, JSON.stringify(c1.body)).toBe(200);
    expect(c1.body.shuttle.status).toBe('CANCELLED');
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    const after = await row(b.code);
    expect(after.pricing).toMatchObject({ shuttleVnd: 2 * LEG, totalVnd: b.pricing.totalVnd, serviceFeeVnd: b.pricing.serviceFeeVnd });
    expect(after.shuttle).toEqual({ tripType: 'ROUND_TRIP', legCount: 2 });
    expect((await cancelLeg(b.code, toHotel.id)).status).toBe(409); // gọi lặp
    expect(await count('audit_logs', "action = 'SHUTTLE.CANCEL' AND booking_id = $1", [b.id])).toBe(1);
    expect(await count('shuttle_trips', "request_id = $1 AND status = 'CANCELLED'", [toHotel.id])).toBe(1);
    const ev = await one<any>("SELECT data FROM booking_events WHERE booking_id = $1 AND type = 'SHUTTLE_CANCELLED'", [b.id]);
    expect(ev!.data).toMatchObject({ refundVnd: 0, note: 'khách hủy, không hoàn phí xe' });
    expect(await ledger(b.id)).toEqual(before);
    // chiều còn lại: tài xế đã nhận (ACCEPTED) -> hủy được, vẫn không hoàn
    await addTrip(toAirport, 'ACCEPTED');
    expect((await cancelLeg(b.code, toAirport.id)).status).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    expect((await row(b.code)).pricing.totalVnd).toBe(b.pricing.totalVnd);
  });

  it('hủy chiều đã ONBOARD -> 409 TRIP_ALREADY_STARTED; AT_HOTEL: giảm tổng đơn, không refund; đơn chờ thanh toán: cho hủy, tiền link giữ nguyên', async () => {
    const r1 = await book({ method: 'SEPAY' });
    await pay(r1.body.booking.code);
    const b1 = await row(r1.body.booking.code);
    const [x] = await reqs(b1.id);
    await addTrip(x, 'ONBOARD');
    const c = await cancelLeg(b1.code, x.id);
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('TRIP_ALREADY_STARTED');
    expect(await count('refunds', 'booking_id = $1', [b1.id])).toBe(0);

    const r2 = await book({ method: 'AT_HOTEL' });
    const b2 = await row(r2.body.booking.code);
    const [y, y2] = await reqs(b2.id);
    expect((await cancelLeg(b2.code, y.id)).status).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b2.id])).toBe(0);
    expect((await row(b2.code)).pricing).toMatchObject({ shuttleVnd: LEG, totalVnd: b2.pricing.totalVnd - LEG });
    await addTrip(y2, 'ACCEPTED'); // AT_HOTEL, tài xế đã nhận: hủy được, tổng đơn giữ nguyên
    expect((await cancelLeg(b2.code, y2.id)).status).toBe(200);
    expect((await row(b2.code)).pricing.totalVnd).toBe(b2.pricing.totalVnd - LEG);

    const r3 = await book({ method: 'SEPAY' });
    const b3 = await row(r3.body.booking.code);
    const [z] = await reqs(b3.id);
    expect((await cancelLeg(b3.code, z.id)).status).toBe(200);
    expect((await reqs(b3.id))[0].status).toBe('CANCELLED');
    expect((await row(b3.code)).pricing.totalVnd).toBe(b3.pricing.totalVnd);
    expect(await count('refunds', 'booking_id = $1', [b3.id])).toBe(0);
  });

  it('khách sạn tự hủy yêu cầu xe đã thu tiền: không hoàn, tổng đơn giữ nguyên', async () => {
    const res = await book({ method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const [x] = await reqs(b.id);
    const t = (await mkStaff(paid, [PERM.SHUTTLE_HANDLE])).token;
    const r = await request(app).post(`/v1/hotel/shuttle-requests/${x.id}/cancel`).set({ Authorization: `Bearer ${t}` }).send({ note: 'Không có xe' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    expect((await row(b.code)).pricing.totalVnd).toBe(b.pricing.totalVnd);
  });

  // ---------- Hủy cả đơn ----------
  it('hủy cả đơn (gói FLEXIBLE, hủy sớm): xe đã thu KHÔNG hoàn (shuttleRefundVnd = 0, shuttleKeepVnd = phí xe), số hoàn = phòng + phí DV', async () => {
    const res = await book({ method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const [toHotel] = await reqs(b.id);
    await addTrip(toHotel, 'ACCEPTED');
    const q = await request(app).post('/v1/change-requests/quote').set(ipFor()).send({ code: b.code, phone: '+84912345678' });
    expect(q.body.quote).toMatchObject({ tier: 'FREE', shuttleRefundVnd: 0, shuttleKeepVnd: 2 * LEG, keepVnd: 2 * LEG, refundVnd: b.paidVnd - 2 * LEG });
    const cr = await askCancelOrder(b.code);
    expect(cr.status, JSON.stringify(cr.body)).toBe(201);
    expect(cr.body.request.quote).toMatchObject({ refundVnd: b.paidVnd - 2 * LEG });
    expect((await approve(cr.body.request.id)).status).toBe(200);
    expect((await row(b.code)).status).toBe('CANCELLED');
    const refunds = (await db.query<any>('SELECT * FROM refunds WHERE booking_id = $1', [b.id])).rows;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ reasonCode: 'CANCEL_APPROVED', amountVnd: b.paidVnd - 2 * LEG, method: 'SEPAY' });
    expect((await reqs(b.id)).map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect((await approve(cr.body.request.id)).status).toBe(200); // duyệt lặp: không hoàn thêm
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(1);
    await processRefund(refunds[0].id);
    const l = await ledger(b.id);
    expect(l.paid).toBe(2 * LEG); // CUSTOMER_PAID còn đúng phần xe giữ lại (phòng đã hoàn)
  });

  it('hủy cả đơn gói NON_REFUNDABLE: giữ phòng + phí DV + xe, không hoàn gì (SePay)', async () => {
    const h = await mkHotel({ code: 'NRF' });
    await db.query("UPDATE hotels SET amenities = ARRAY['SHUTTLE_PAID'], policy = policy || '{\"cancellationTemplate\":\"NON_REFUNDABLE\"}'::jsonb WHERE id = $1", [h]);
    const rt = await mkRoomType(h, 30, ROOM);
    const t = (await mkStaff(h, [PERM.REQUEST_HANDLE])).token;
    const res = await book({ hotel: h, rt, method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const q = await request(app).post('/v1/change-requests/quote').set(ipFor()).send({ code: b.code, phone: '+84912345678' });
    expect(q.body.quote).toMatchObject({ tier: 'LATE', refundVnd: 0, keepVnd: b.paidVnd, shuttleRefundVnd: 0, shuttleKeepVnd: 2 * LEG });
    const cr = await askCancelOrder(b.code);
    const ap = await request(app).post(`/v1/hotel/change-requests/${cr.body.request.id}/approve`).set({ Authorization: `Bearer ${t}` }).send({});
    expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
  });

  it('khách hủy chiều giữa lúc chờ duyệt hủy đơn: số hoàn vẫn chỉ là phần phòng, không hoàn xe', async () => {
    const res = await book({ method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const cr = await askCancelOrder(b.code);
    const [toHotel] = await reqs(b.id);
    expect((await cancelLeg(b.code, toHotel.id)).status).toBe(200);
    expect((await approve(cr.body.request.id)).status).toBe(200);
    const refunds = (await db.query<any>('SELECT reason_code, amount_vnd FROM refunds WHERE booking_id = $1 ORDER BY seq', [b.id])).rows;
    expect(refunds.map((r) => [r.reasonCode, r.amountVnd])).toEqual([['CANCEL_APPROVED', b.paidVnd - 2 * LEG]]);
  });

  it('hủy cả đơn AT_HOTEL có xe: không có tiền để hoàn, xe bị hủy theo đơn', async () => {
    const res = await book({ method: 'AT_HOTEL' });
    const b = await row(res.body.booking.code);
    const cr = await askCancelOrder(b.code);
    expect(cr.body.request.quote).toMatchObject({ refundVnd: 0 });
    expect((await approve(cr.body.request.id)).status).toBe(200);
    expect(await count('refunds', 'booking_id = $1', [b.id])).toBe(0);
    expect((await reqs(b.id)).map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
  });

  it('đơn không chọn xe: báo giá hủy y hệt trước đây (không trường xe làm đổi số)', async () => {
    const res = await book({ legs: null, method: 'SEPAY' });
    await pay(res.body.booking.code);
    const b = await row(res.body.booking.code);
    const q = await request(app).post('/v1/change-requests/quote').set(ipFor()).send({ code: b.code, phone: '+84912345678' });
    expect(q.body.quote).toMatchObject({ tier: 'FREE', keepVnd: 0, refundVnd: b.paidVnd, shuttleRefundVnd: 0, shuttleKeepVnd: 0 });
  });

  // ---------- Đổi ngày ----------
  it('đổi ngày đơn có xe: báo giá tính phí DV trên (phòng + xe), tổng giữ phần xe', async () => {
    const res = await book({ method: 'AT_HOTEL' });
    const b = await row(res.body.booking.code);
    const nd = nextOff();
    const cr = await request(app).post('/v1/change-requests').set(ipFor()).set('Idempotency-Key', `ch-${randomUUID()}`)
      .send({ code: b.code, phone: '+84912345678', type: 'CHANGE', reasonCode: 'CHANGE_OF_PLAN', newFrom: dayAt(nd, 4).toISOString(), newTo: dayAt(nd + 2, 4).toISOString() });
    expect(cr.status, JSON.stringify(cr.body)).toBe(201);
    const newRoom = 2 * ROOM;
    const fee = serviceFee(newRoom + 2 * LEG, FEE);
    expect(cr.body.request.quote).toMatchObject({ newRoomVnd: newRoom, newServiceFeeVnd: fee, newTotalVnd: newRoom + 2 * LEG + fee });
    expect((await approve(cr.body.request.id)).status).toBe(200);
    expect((await row(b.code)).pricing).toMatchObject({ roomVnd: newRoom, shuttleVnd: 2 * LEG, totalVnd: newRoom + 2 * LEG + fee });
  });
});
