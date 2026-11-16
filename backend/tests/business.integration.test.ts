import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERM } from '../config/permissions';
import { signAccountToken } from '../lib/jwt';
import { closeDb, count, db, freshDb, mkAdmin, mkStaff, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PW = 'DoanhNghiep12345!';

run('tích hợp: doanh nghiệp (đăng ký công khai, duyệt, nhiều khách sạn, switch-hotel, báo cáo)', () => {
  const app = createApp();
  let admin = '', adminReadOnly = '';

  const regBody = (n: string, o: Record<string, unknown> = {}) => ({ name: `Công ty ${n}`, taxCode: `MST-${n}`, representative: `Đại diện ${n}`, email: `${n}@dn.vn`, phone: '0912345678', password: PW, ...o });
  const register = (n: string, o: Record<string, unknown> = {}) => request(app).post('/v1/auth/business/register').send(regBody(n, o));
  const login = (email: string, password = PW) => request(app).post('/v1/auth/login').send({ email, password });
  const bizId = async (email: string) => (await one<{ id: string }>('SELECT id FROM businesses WHERE email = $1', [email]))!.id;
  const hotelBody = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
    code, name, address: { line: '1 Nội Bài', city: 'Hà Nội' }, location: { lng: 105.8, lat: 21.2 }, airports: [{ iata: 'han', km: 6, minutes: 12 }],
    contact: { phone: '0243123456', email: 'lienhe@dn.vn' }, policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 }, ...extra,
  });

  beforeAll(async () => {
    await freshDb({ roles: true });
    admin = (await mkAdmin([PERM.ADMIN_HOTEL_READ, PERM.ADMIN_HOTEL_MANAGE])).token;
    adminReadOnly = (await mkAdmin([PERM.ADMIN_HOTEL_READ])).token;
  });
  afterAll(async () => closeDb());

  describe('đăng ký công khai + duyệt', () => {
    it('đăng ký -> 202, hàng chờ PENDING_APPROVAL, chủ INVITED; chưa đăng nhập được (403 BUSINESS_PENDING_APPROVAL); sai mật khẩu vẫn 401', async () => {
      const r = await register('a1');
      expect(r.status).toBe(202);
      expect(r.body.status).toBe('RECEIVED');
      const b = (await one('SELECT * FROM businesses WHERE email = $1', ['a1@dn.vn']))!;
      expect(b.status).toBe('PENDING_APPROVAL');
      expect((await one('SELECT status, is_owner, business_id, phone FROM accounts WHERE email = $1', ['a1@dn.vn']))).toMatchObject({ status: 'INVITED', isOwner: true, businessId: b.id, phone: '0912345678' });
      const l = await login('a1@dn.vn');
      expect(l.status).toBe(403);
      expect(l.body.error.code).toBe('BUSINESS_PENDING_APPROVAL');
      expect((await login('a1@dn.vn', 'sai-mat-khau-xxx')).status).toBe(401);
      expect(await count('audit_logs', "action = 'BUSINESS.REGISTER'")).toBe(1);
    });

    it('validate: mật khẩu < 12 ký tự, email sai, thiếu trường -> 422', async () => {
      expect((await register('v1', { password: 'ngan' })).status).toBe(422);
      expect((await register('v2', { email: 'khong-phai-email' })).status).toBe(422);
      expect((await request(app).post('/v1/auth/business/register').send({ name: 'x' })).status).toBe(422);
      expect(await count('businesses', "email LIKE 'v%@dn.vn'")).toBe(0);
    });

    it('trùng email / mã số thuế: cùng phản hồi 202, không tạo hồ sơ thứ hai (không lộ email tồn tại)', async () => {
      const dupEmail = await register('b1', { email: 'a1@dn.vn' });
      const dupTax = await register('b2', { taxCode: 'MST-a1' });
      expect(dupEmail.status).toBe(202);
      expect(dupEmail.body).toEqual((await register('a1')).body);
      expect(dupTax.status).toBe(202);
      expect(await count('businesses', "name IN ('Công ty b1','Công ty b2')")).toBe(0);
    });

    it('honeypot `website` có giá trị -> 202 nhưng bỏ qua', async () => {
      expect((await register('bot', { website: 'http://spam' })).status).toBe(202);
      expect(await count('businesses', "email = 'bot@dn.vn'")).toBe(0);
    });

    it('admin: danh sách/chi tiết cần admin:hotel:read; duyệt cần admin:hotel:manage', async () => {
      expect((await request(app).get('/v1/admin/businesses')).status).toBe(401);
      const nobody = (await mkAdmin([PERM.BOOKING_READ])).token;
      expect((await request(app).get('/v1/admin/businesses').set(bearer(nobody))).status).toBe(403);
      const list = await request(app).get('/v1/admin/businesses?status=PENDING_APPROVAL').set(bearer(adminReadOnly));
      expect(list.status).toBe(200);
      const item = list.body.items.find((x: any) => x.email === 'a1@dn.vn');
      expect(item).toMatchObject({ status: 'PENDING_APPROVAL', taxCode: 'MST-a1', hotelCount: 0 });
      const id = await bizId('a1@dn.vn');
      const detail = await request(app).get(`/v1/admin/businesses/${id}`).set(bearer(adminReadOnly));
      expect(detail.body.business.name).toBe('Công ty a1');
      expect(detail.body.owner).not.toHaveProperty('passwordHash');
      expect(detail.body.hotels).toEqual([]);
      expect((await request(app).post(`/v1/admin/businesses/${id}/approve`).set(bearer(adminReadOnly))).status).toBe(403);
      expect((await request(app).get(`/v1/admin/businesses/${randomUUID()}`).set(bearer(adminReadOnly))).status).toBe(404);
    });

    it('duyệt: ACTIVE + chủ ACTIVE đăng nhập được (chưa có khách sạn), ghi audit; duyệt lần hai 409', async () => {
      const id = await bizId('a1@dn.vn');
      const r = await request(app).post(`/v1/admin/businesses/${id}/approve`).set(bearer(admin));
      expect(r.status).toBe(200);
      expect(r.body.business).toMatchObject({ status: 'ACTIVE' });
      expect(await count('audit_logs', "action = 'BUSINESS.APPROVE' AND entity_id = $1", [id])).toBe(1);
      expect((await request(app).post(`/v1/admin/businesses/${id}/approve`).set(bearer(admin))).status).toBe(409);
      const l = await login('a1@dn.vn');
      expect(l.status).toBe(200);
      expect(l.body.business).toMatchObject({ id, status: 'ACTIVE' });
      expect(l.body.hotels).toEqual([]);
      expect(l.body.account.permissions).toEqual(expect.arrayContaining([PERM.BUSINESS_HOTEL_MANAGE, PERM.BUSINESS_REPORT_READ]));
    });

    it('từ chối: cần lý do; REJECTED không đăng nhập được; ghi audit kèm lý do; không duyệt lại được', async () => {
      await register('r1');
      const id = await bizId('r1@dn.vn');
      expect((await request(app).post(`/v1/admin/businesses/${id}/reject`).set(bearer(admin)).send({})).status).toBe(422);
      const r = await request(app).post(`/v1/admin/businesses/${id}/reject`).set(bearer(admin)).send({ reason: 'Giấy phép không hợp lệ' });
      expect(r.status).toBe(200);
      expect(r.body.business).toMatchObject({ status: 'REJECTED', rejectReason: 'Giấy phép không hợp lệ' });
      expect((await login('r1@dn.vn')).body.error.code).toBe('BUSINESS_REJECTED');
      expect(await one("SELECT reason_note FROM audit_logs WHERE action = 'BUSINESS.REJECT' AND entity_id = $1", [id])).toMatchObject({ reasonNote: 'Giấy phép không hợp lệ' });
      expect((await request(app).post(`/v1/admin/businesses/${id}/approve`).set(bearer(admin))).status).toBe(409);
    });
  });

  describe('admin tạo khách sạn + trùng tên/email/SĐT', () => {
    let biz = '';
    beforeAll(async () => {
      biz = await bizId('a1@dn.vn');
    });
    const create = (body: object) => request(app).post('/v1/admin/hotels').set(bearer(admin)).send(body);

    it('tạo cho doanh nghiệp đã duyệt (businessId); PENDING/không tồn tại bị chặn; thiếu cả businessId lẫn owner -> 422', async () => {
      const r = await create(hotelBody('DN-A1', 'Khách sạn Alpha', { businessId: biz }));
      expect(r.status).toBe(201);
      expect(r.body.hotel).toMatchObject({ status: 'PENDING_APPROVAL', businessId: biz });
      expect(r.body.hotel.ownerAccountId).toBe(biz);
      await register('p1');
      const pending = await bizId('p1@dn.vn');
      const p = await create(hotelBody('DN-P1', 'Khách sạn Pending', { businessId: pending }));
      expect(p.status).toBe(409);
      expect(p.body.error.code).toBe('BUSINESS_NOT_ACTIVE');
      expect((await create(hotelBody('DN-X1', 'KS X', { businessId: randomUUID() }))).status).toBe(404);
      expect((await create(hotelBody('DN-X2', 'KS Y'))).status).toBe(422);
      expect((await create(hotelBody('DN-X3', 'KS Z', { businessId: biz, owner: { email: 'o@x.vn', fullName: 'Chủ', password: PW } }))).status).toBe(422);
    });

    it('trùng TÊN (không phân biệt hoa thường/khoảng trắng) -> 409 HOTEL_NAME_EXISTS; cả khi sửa tên', async () => {
      const dup = await create(hotelBody('DN-A2', '  khách  SẠN alpha ', { businessId: biz }));
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('HOTEL_NAME_EXISTS');
      const ok = await create(hotelBody('DN-A3', 'Khách sạn Beta', { businessId: biz }));
      expect(ok.status).toBe(201);
      const patch = await request(app).patch(`/v1/admin/hotels/${ok.body.hotel.id}`).set(bearer(admin)).send({ name: 'KHÁCH SẠN ALPHA' });
      expect(patch.status).toBe(409);
      expect((await request(app).patch(`/v1/admin/hotels/${ok.body.hotel.id}`).set(bearer(admin)).send({ name: 'Khách sạn Beta' })).status).toBe(200); // giữ nguyên tên của chính nó
    });

    it('trùng email/SĐT liên hệ giữa các khách sạn cùng doanh nghiệp được phép', async () => {
      const rows = (await db.query("SELECT contact FROM hotels WHERE business_id = $1", [biz])).rows;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(new Set(rows.map((x: any) => `${x.contact.phone}|${x.contact.email}`)).size).toBe(1);
    });

    it('tương thích: body cũ owner{...} vẫn tạo doanh nghiệp ACTIVE + chủ INVITED, duyệt khách sạn thì chủ ACTIVE', async () => {
      const r = await create(hotelBody('DN-OLD', 'Khách sạn Cũ', { owner: { email: 'chu-cu@dn.vn', fullName: 'Chủ Cũ', password: PW } }));
      expect(r.status).toBe(201);
      const b = (await one('SELECT * FROM businesses WHERE email = $1', ['chu-cu@dn.vn']))!;
      expect(b.status).toBe('ACTIVE');
      expect(await one('SELECT status, business_id, hotel_id FROM accounts WHERE email = $1', ['chu-cu@dn.vn'])).toMatchObject({ status: 'INVITED', businessId: b.id, hotelId: r.body.hotel.id });
      expect((await login('chu-cu@dn.vn')).status).toBe(401);
      expect((await create(hotelBody('DN-OLD2', 'KS Cũ 2', { owner: { email: 'CHU-CU@dn.vn', fullName: 'Chủ', password: PW } }))).status).toBe(409);
      await request(app).post(`/v1/admin/hotels/${r.body.hotel.id}/approve`).set(bearer(admin));
      expect((await login('chu-cu@dn.vn')).status).toBe(200);
    });
  });

  describe('chủ nhiều khách sạn: login, switch-hotel, tạo/liệt kê khách sạn', () => {
    let tok = '', h1 = '', h2 = '', otherHotel = '', otherTok = '', staffTok = '';
    beforeAll(async () => {
      const biz = await bizId('a1@dn.vn');
      h1 = (await one<{ id: string }>("SELECT id FROM hotels WHERE code = 'DN-A1'"))!.id;
      h2 = (await one<{ id: string }>("SELECT id FROM hotels WHERE code = 'DN-A3'"))!.id;
      await request(app).post(`/v1/admin/hotels/${h1}/approve`).set(bearer(admin));
      await request(app).post(`/v1/admin/hotels/${h2}/approve`).set(bearer(admin));
      otherHotel = (await one<{ id: string }>("SELECT id FROM hotels WHERE code = 'DN-OLD'"))!.id;
      otherTok = (await login('chu-cu@dn.vn')).body.token;
      staffTok = (await mkStaff(h1, [PERM.BOOKING_READ])).token;
      void biz;
    });
    const stats = async (t: string) => request(app).get('/v1/hotel/stats').set(bearer(t));

    it('login trả token + danh sách khách sạn; token mang khách sạn mặc định (đầu tiên admin gán)', async () => {
      const l = await login('a1@dn.vn');
      tok = l.body.token;
      expect(l.body.hotels.map((h: any) => h.id)).toEqual([h1, h2]);
      expect(l.body.hotels[0]).toEqual(expect.objectContaining({ code: 'DN-A1', name: 'Khách sạn Alpha', status: 'ACTIVE' }));
      expect(l.body.currentHotelId).toBe(h1);
      expect((await stats(tok)).body.hotelId).toBe(h1);
    });

    it('GET /auth/me trả thêm business + hotels', async () => {
      const me = await request(app).get('/v1/auth/me').set(bearer(tok));
      expect(me.body.business).toMatchObject({ name: 'Công ty a1', status: 'ACTIVE' });
      expect(me.body.hotels).toHaveLength(2);
      expect(me.body.auth.hotelId).toBe(h1);
    });

    it('switch-hotel: token mới trỏ khách sạn mới; token cũ vẫn trỏ khách sạn cũ; đăng nhập lại nhớ lựa chọn', async () => {
      const s = await request(app).post('/v1/auth/switch-hotel').set(bearer(tok)).send({ hotelId: h2 });
      expect(s.status).toBe(200);
      expect(s.body.hotel.id).toBe(h2);
      expect((await stats(s.body.token)).body.hotelId).toBe(h2);
      expect((await stats(tok)).body.hotelId).toBe(h1);
      expect((await login('a1@dn.vn')).body.currentHotelId).toBe(h2);
      await request(app).post('/v1/auth/switch-hotel').set(bearer(tok)).send({ hotelId: h1 });
    });

    it('IDOR: switch sang khách sạn doanh nghiệp khác / không tồn tại -> 404; nhân viên -> 403; không token -> 401; hotelId sai định dạng -> 422', async () => {
      expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(tok)).send({ hotelId: otherHotel })).status).toBe(404);
      expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(tok)).send({ hotelId: randomUUID() })).status).toBe(404);
      expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(staffTok)).send({ hotelId: h2 })).status).toBe(403);
      expect((await request(app).post('/v1/auth/switch-hotel').send({ hotelId: h2 })).status).toBe(401);
      expect((await request(app).post('/v1/auth/switch-hotel').set(bearer(tok)).send({ hotelId: 'x' })).status).toBe(422);
      expect(otherTok).toBeTruthy();
    });

    it('token giả mạo claim hotelId của doanh nghiệp khác -> 401; claim hotelId trong token nhân viên bị bỏ qua', async () => {
      const owner = (await one<{ id: string }>("SELECT id FROM accounts WHERE email = 'a1@dn.vn'"))!.id;
      const forged = signAccountToken({ sub: owner, accountType: 'HOTEL', hotelId: otherHotel });
      expect((await stats(forged)).status).toBe(401);
      const staffId = (await one<{ id: string }>("SELECT id FROM accounts WHERE hotel_id = $1 AND NOT coalesce(is_owner,false)", [h1]))!.id;
      const staffForged = signAccountToken({ sub: staffId, accountType: 'HOTEL', hotelId: otherHotel });
      expect((await stats(staffForged)).body.hotelId).toBe(h1);
    });

    it('chủ tạo khách sạn: DRAFT thuộc doanh nghiệp của mình (bỏ qua businessId trong body), trùng tên 409, trùng email/SĐT OK', async () => {
      const mine = await request(app).post('/v1/hotel/hotels').set(bearer(tok)).send(hotelBody('DN-A4', 'Khách sạn Gamma', { businessId: (await one<{ id: string }>("SELECT id FROM businesses WHERE email = 'chu-cu@dn.vn'"))!.id }));
      expect(mine.status).toBe(201);
      const a1 = await bizId('a1@dn.vn');
      expect(mine.body.hotel).toMatchObject({ status: 'DRAFT', businessId: a1 });
      const dup = await request(app).post('/v1/hotel/hotels').set(bearer(tok)).send(hotelBody('DN-A5', 'khách sạn alpha'));
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('HOTEL_NAME_EXISTS');
      const codeDup = await request(app).post('/v1/hotel/hotels').set(bearer(tok)).send(hotelBody('DN-A4', 'Khách sạn Delta'));
      expect(codeDup.body.error.code).toBe('HOTEL_CODE_EXISTS');
      const noAirports = await request(app).post('/v1/hotel/hotels').set(bearer(tok)).send(hotelBody('DN-A6', 'Khách sạn Epsilon', { airports: undefined }));
      expect(noAirports.status).toBe(201);
      expect(await count('audit_logs', "action = 'HOTEL.CREATE' AND after->>'status' = 'DRAFT'")).toBe(2);
    });

    it('liệt kê chỉ khách sạn của doanh nghiệp mình; nhân viên/admin không có quyền -> 403', async () => {
      const r = await request(app).get('/v1/hotel/hotels').set(bearer(tok));
      expect(r.status).toBe(200);
      expect(r.body.items.map((x: any) => x.code)).toEqual(['DN-A1', 'DN-A3', 'DN-A4', 'DN-A6']);
      expect(r.body.items.every((x: any) => x.code !== 'DN-OLD')).toBe(true);
      expect((await request(app).get('/v1/hotel/hotels').set(bearer(staffTok))).status).toBe(403);
      expect((await request(app).get('/v1/hotel/hotels').set(bearer(admin))).status).toBe(403);
      expect((await request(app).post('/v1/hotel/hotels').set(bearer(staffTok)).send(hotelBody('DN-S1', 'KS Staff'))).status).toBe(403);
    });

    it('gửi hồ sơ DRAFT -> PENDING_APPROVAL; gửi lại 409; khách sạn doanh nghiệp khác 404; rồi admin duyệt bằng luồng cũ', async () => {
      const draft = (await one<{ id: string }>("SELECT id FROM hotels WHERE code = 'DN-A4'"))!.id;
      const r = await request(app).post(`/v1/hotel/hotels/${draft}/submit`).set(bearer(tok));
      expect(r.status).toBe(200);
      expect(r.body.hotel.status).toBe('PENDING_APPROVAL');
      expect((await request(app).post(`/v1/hotel/hotels/${draft}/submit`).set(bearer(tok))).status).toBe(409);
      expect((await request(app).post(`/v1/hotel/hotels/${otherHotel}/submit`).set(bearer(tok))).status).toBe(404);
      expect((await request(app).post(`/v1/admin/hotels/${draft}/approve`).set(bearer(admin))).status).toBe(200);
    });

    it('admin xem doanh nghiệp + danh sách khách sạn của nó', async () => {
      const d = await request(app).get(`/v1/admin/businesses/${await bizId('a1@dn.vn')}`).set(bearer(adminReadOnly));
      expect(d.body.hotels.map((h: any) => h.code)).toEqual(['DN-A1', 'DN-A3', 'DN-A4', 'DN-A6']);
    });
  });

  describe('giới hạn tần suất đăng ký công khai', () => {
    it('quá hạn mức -> 429 RATE_LIMITED', async () => {
      let last = 0;
      for (let i = 0; i < 15 && last !== 429; i++) last = (await request(app).post('/v1/auth/business/register').send({})).status;
      expect(last).toBe(429);
    });
  });
});
