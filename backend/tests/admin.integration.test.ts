import { ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ADMIN_ROLES, type AdminRoleKey } from '../src/config/roles';
import { col } from '../src/db/collections';
import { ensureIndexes } from '../src/db/indexes';
import { closeMongo, connectMongo, db } from '../src/db/mongo';
import { decryptJson } from '../src/lib/crypto';
import { signAccountToken } from '../src/lib/jwt';
import { hashPassword } from '../src/lib/password';
import { ensureSystemRoles } from '../src/lib/systemRoles';

// Cần MongoDB replica set: `npm run test:db`.
const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: API Admin (tài khoản, cấu hình, audit, khách sạn)', () => {
  const app = createApp();
  const tokens = {} as Record<'A' | 'B' | 'FIN' | 'SUP' | 'OPS', string>;
  const ids = {} as Record<'A' | 'B' | 'FIN' | 'SUP' | 'OPS', string>;
  const auth = (k: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[k]}` });
  let hotelId = '';

  const mkAdmin = async (k: keyof typeof tokens, role: AdminRoleKey, email: string) => {
    const r = await col.roles().findOne({ key: role, hotelId: { $exists: false } });
    const _id = new ObjectId();
    await col.accounts().insertOne({
      _id, type: 'ADMIN', email, passwordHash: await hashPassword('Pass12345678!'), fullName: `Admin ${k}`,
      status: 'ACTIVE', adminRole: role, roleIds: [r!._id], createdAt: new Date(), updatedAt: new Date(),
    });
    ids[k] = _id.toHexString();
    tokens[k] = signAccountToken({ sub: ids[k], accountType: 'ADMIN' });
  };

  const hotelBody = (code = 'HAN-T01', email = 'chu@kstest.vn') => ({
    code, name: 'KS Test Nội Bài', address: { line: '1 Nội Bài', city: 'Hà Nội' },
    location: { lng: 105.8, lat: 21.2 }, airports: [{ iata: 'han', km: 6, minutes: 12 }],
    amenities: ['WIFI'], contact: { phone: '0243123456' },
    policy: { cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 },
    owner: { email, fullName: 'Chủ KS', password: 'OwnerPass12345!' },
  });

  beforeAll(async () => {
    await connectMongo();
    await db().dropDatabase();
    await ensureIndexes();
    await ensureSystemRoles();
    await mkAdmin('A', 'SYSADMIN', 'a@airrest.vn');
    await mkAdmin('B', 'SYSADMIN', 'b@airrest.vn');
    await mkAdmin('FIN', 'FINANCE', 'fin@airrest.vn');
    await mkAdmin('SUP', 'SUPPORT', 'sup@airrest.vn');
    await mkAdmin('OPS', 'OPS', 'ops@airrest.vn');
  });
  afterAll(async () => closeMongo());

  describe('ADM-13 tài khoản Admin', () => {
    it('thiếu quyền -> 403; không token -> 401', async () => {
      expect((await request(app).get('/v1/admin/accounts')).status).toBe(401);
      expect((await request(app).get('/v1/admin/accounts').set(auth('SUP'))).status).toBe(403);
    });

    it('tạo tài khoản OPS: không lộ passwordHash, đăng nhập được, nhận đúng quyền; trùng email -> 409', async () => {
      const body = { email: 'Moi@Airrest.vn', fullName: 'Điều phối mới', adminRole: 'OPS', password: 'MatKhauMoi1234!' };
      const res = await request(app).post('/v1/admin/accounts').set(auth('A')).send(body);
      expect(res.status).toBe(201);
      expect(res.body.account).not.toHaveProperty('passwordHash');
      expect(res.body.account.email).toBe('moi@airrest.vn');
      const login = await request(app).post('/v1/auth/login').send({ email: 'moi@airrest.vn', password: body.password });
      expect(login.status).toBe(200);
      expect(login.body.account.permissions).toEqual(expect.arrayContaining(ADMIN_ROLES.OPS.permissions));
      expect((await request(app).post('/v1/admin/accounts').set(auth('A')).send(body)).status).toBe(409);
      expect(await col.auditLogs().countDocuments({ action: 'ACCOUNT.CREATE' })).toBe(1);
    });

    it('validate: mật khẩu ngắn / vai trò lạ -> 422', async () => {
      const bad = await request(app).post('/v1/admin/accounts').set(auth('A')).send({ email: 'x@y.vn', fullName: 'Xy', adminRole: 'ROOT', password: 'ngan' });
      expect(bad.status).toBe(422);
    });

    it('không tự khóa mình; tài khoản bị khóa mất quyền ngay (token cũ -> 401)', async () => {
      const self = await request(app).patch(`/v1/admin/accounts/${ids.A}`).set(auth('A')).send({ status: 'LOCKED' });
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');

      expect((await request(app).get('/v1/admin/roles').set(auth('B'))).status).toBe(200);
      expect((await request(app).patch(`/v1/admin/accounts/${ids.B}`).set(auth('A')).send({ status: 'LOCKED' })).status).toBe(200);
      const after = await request(app).get('/v1/admin/roles').set(auth('B'));
      expect(after.status).toBe(401);
      expect(after.body.error.code).toBe('ACCOUNT_INACTIVE');
      await request(app).patch(`/v1/admin/accounts/${ids.B}`).set(auth('A')).send({ status: 'ACTIVE' });
      expect((await request(app).get('/v1/admin/roles').set(auth('B'))).status).toBe(200);
    });

    it('token nhỏ và không chứa quyền; /me trả quyền mới nhất từ DB', async () => {
      const login = await request(app).post('/v1/auth/login').send({ email: 'a@airrest.vn', password: 'Pass12345678!' });
      expect(login.body.token.length).toBeLessThan(300);
      const payload = JSON.parse(Buffer.from(login.body.token.split('.')[1], 'base64url').toString());
      expect(payload).not.toHaveProperty('permissions');
      const me = await request(app).get('/v1/auth/me').set({ Authorization: `Bearer ${login.body.token}` });
      expect(me.body.auth.permissions).toEqual(expect.arrayContaining(ADMIN_ROLES.SYSADMIN.permissions));
    });

    it('đổi vai trò: roleIds theo vai trò mới; liệt kê + lọc', async () => {
      const upd = await request(app).patch(`/v1/admin/accounts/${ids.OPS}`).set(auth('A')).send({ adminRole: 'SUPPORT' });
      expect(upd.status).toBe(200);
      const acc = await col.accounts().findOne({ _id: new ObjectId(ids.OPS) });
      const role = await col.roles().findOne({ _id: acc!.roleIds[0] });
      expect(role!.key).toBe('SUPPORT');
      // OPS không có audit:read, SUPPORT có -> đổi vai trò có hiệu lực ngay, không cần đăng nhập lại.
      expect((await request(app).get('/v1/admin/audit-logs').set(auth('OPS'))).status).toBe(200);
      const list = await request(app).get('/v1/admin/accounts?adminRole=SYSADMIN&limit=1').set(auth('A'));
      expect(list.body.items).toHaveLength(1);
      expect(list.body.nextCursor).toBeTruthy();
      await request(app).patch(`/v1/admin/accounts/${ids.OPS}`).set(auth('A')).send({ adminRole: 'OPS' });
      expect((await request(app).get('/v1/admin/audit-logs').set(auth('OPS'))).status).toBe(403);
    });

    it('đặt lại mật khẩu: đăng nhập bằng mật khẩu mới', async () => {
      const r = await request(app).post(`/v1/admin/accounts/${ids.SUP}/reset-password`).set(auth('A')).send({ password: 'MatKhauMoi5678!' });
      expect(r.status).toBe(204);
      expect((await request(app).post('/v1/auth/login').send({ email: 'sup@airrest.vn', password: 'MatKhauMoi5678!' })).status).toBe(200);
      const log = await col.auditLogs().findOne({ action: 'ACCOUNT.RESET_PASSWORD' });
      expect(JSON.stringify(log)).not.toContain('MatKhauMoi');
    });
  });

  describe('ADM-12 cấu hình có phiên bản', () => {
    it('danh sách đủ khóa, mặc định ở version 0', async () => {
      const res = await request(app).get('/v1/admin/configs').set(auth('SUP'));
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(11);
      const fee = res.body.items.find((i: { key: string }) => i.key === 'pricing.serviceFee');
      expect(fee).toMatchObject({ version: 0, isDefault: true, value: { bps: 200, minVnd: 10000 } });
    });

    it('mỗi khóa có quyền ghi riêng: Kế toán sửa được payout, không sửa được phí dịch vụ', async () => {
      const value = { windowHours: 24, secondApprovalVnd: 3_000_000 };
      const ok = await request(app).put('/v1/admin/configs/payout').set(auth('FIN')).send({ value, reason: 'PO chốt ngưỡng' });
      expect(ok.status).toBe(201);
      expect(ok.body.version).toBe(1);
      const no = await request(app).put('/v1/admin/configs/pricing.serviceFee').set(auth('FIN')).send({ value: { bps: 300, minVnd: 10000, roundToVnd: 1000 }, reason: 'thử' });
      expect(no.status).toBe(403);
      expect((await request(app).put('/v1/admin/configs/khong.co').set(auth('A')).send({ value: {}, reason: 'thử' })).status).toBe(404);
    });

    it('validate giá trị và không cho hiệu lực trong quá khứ', async () => {
      const bad = await request(app).put('/v1/admin/configs/pricing.serviceFee').set(auth('A')).send({ value: { bps: 99999, minVnd: 10000, roundToVnd: 1000 }, reason: 'sai' });
      expect(bad.status).toBe(422);
      const past = await request(app).put('/v1/admin/configs/pricing.serviceFee').set(auth('A')).send({ value: { bps: 300, minVnd: 10000, roundToVnd: 1000 }, reason: 'quá khứ', effectiveFrom: '2020-01-01T00:00:00Z' });
      expect(past.status).toBe(422);
      expect(past.body.error.code).toBe('EFFECTIVE_FROM_IN_PAST');
    });

    it('lên lịch phiên bản tương lai: hiện hành giữ nguyên, xuất hiện ở scheduled + versions', async () => {
      const future = new Date(Date.now() + 7 * 86400_000).toISOString();
      const put = await request(app).put('/v1/admin/configs/flight.thresholds').set(auth('A')).send({ value: { delayHours: 4, nearDepartureHours: 6 }, reason: 'thử lịch', effectiveFrom: future });
      expect(put.body.status).toBe('SCHEDULED');
      const list = await request(app).get('/v1/admin/configs').set(auth('A'));
      const item = list.body.items.find((i: { key: string }) => i.key === 'flight.thresholds');
      expect(item.value).toEqual({ delayHours: 5, nearDepartureHours: 5 });
      expect(item.scheduled).toHaveLength(1);
      const ver = await request(app).get('/v1/admin/configs/flight.thresholds/versions').set(auth('A'));
      expect(ver.body.items[0]).toMatchObject({ version: 1, status: 'SCHEDULED' });
    });
  });

  describe('ADM-01 khách sạn đối tác', () => {
    it('tạo -> chờ duyệt; chủ chưa đăng nhập được; duyệt xong mới đăng nhập + hiện ở danh sách công khai', async () => {
      const res = await request(app).post('/v1/admin/hotels').set(auth('A')).send(hotelBody());
      expect(res.status).toBe(201);
      expect(res.body.hotel.status).toBe('PENDING_APPROVAL');
      expect(res.body.hotel.airports[0].iata).toBe('HAN');
      hotelId = res.body.hotel._id;

      const loginBefore = await request(app).post('/v1/auth/login').send({ email: 'chu@kstest.vn', password: 'OwnerPass12345!' });
      expect(loginBefore.status).toBe(401);
      expect((await request(app).get('/v1/hotels?airport=HAN')).body.items).toHaveLength(0);

      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/approve`).set(auth('A'))).status).toBe(200);
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/approve`).set(auth('A'))).status).toBe(409); // đã ACTIVE
      expect((await request(app).post('/v1/auth/login').send({ email: 'chu@kstest.vn', password: 'OwnerPass12345!' })).status).toBe(200);
      expect((await request(app).get('/v1/hotels?airport=HAN')).body.items).toHaveLength(1);
    });

    it('trùng mã / trùng email chủ -> 409; Kế toán (chỉ đọc) không tạo được', async () => {
      const dupCode = await request(app).post('/v1/admin/hotels').set(auth('A')).send(hotelBody('HAN-T01', 'khac@kstest.vn'));
      expect(dupCode.body.error.code).toBe('HOTEL_CODE_EXISTS');
      const dupMail = await request(app).post('/v1/admin/hotels').set(auth('A')).send(hotelBody('HAN-T02', 'chu@kstest.vn'));
      expect(dupMail.body.error.code).toBe('EMAIL_EXISTS');
      expect(await col.hotels().countDocuments({ code: 'HAN-T02' })).toBe(0); // transaction hoàn tác
      expect((await request(app).post('/v1/admin/hotels').set(auth('FIN')).send(hotelBody('HAN-T03', 'x@kstest.vn'))).status).toBe(403);
    });

    it('sửa: duyệt tay > 90 ngày bị chặn; ≤ 90 ngày ok; không lộ payout', async () => {
      const bad = await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth('A')).send({ approval: { manual: true, manualUntil: new Date(Date.now() + 100 * 86400_000).toISOString() } });
      expect(bad.body.error.code).toBe('MANUAL_APPROVAL_LIMIT');
      const ok = await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth('A')).send({ name: 'KS Test Đổi Tên', approval: { manual: true, manualUntil: new Date(Date.now() + 30 * 86400_000).toISOString() } });
      expect(ok.status).toBe(200);
      expect(ok.body.hotel.name).toBe('KS Test Đổi Tên');
      const buf = await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth('A')).send({ policy: { cancellationTemplate: 'STANDARD', cleaningBufferMin: 120 } });
      expect(buf.body.error.code).toBe('CLEANING_BUFFER_TOO_LONG'); // vượt P-13 = 60
      await request(app).patch(`/v1/admin/hotels/${hotelId}`).set(auth('A')).send({ approval: { manual: false } });
    });

    it('tạm ngưng/kích hoạt: máy trạng thái, ẩn khỏi danh sách công khai', async () => {
      const s = await request(app).post(`/v1/admin/hotels/${hotelId}/suspend`).set(auth('A')).send({ reason: 'Vi phạm chất lượng' });
      expect(s.status).toBe(200);
      expect(s.body.hotel.status).toBe('SUSPENDED');
      expect(s.body).toHaveProperty('upcomingBookings');
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/suspend`).set(auth('A')).send({ reason: 'lần hai' })).status).toBe(409);
      expect((await request(app).get('/v1/hotels?airport=HAN')).body.items).toHaveLength(0);
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/activate`).set(auth('A'))).status).toBe(200);
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/suspend`).set(auth('A')).send({})).status).toBe(422); // thiếu lý do
    });

    it('danh sách: lọc theo trạng thái / tìm theo tên', async () => {
      expect((await request(app).get('/v1/admin/hotels?status=ACTIVE&q=%C4%90%E1%BB%95i').set(auth('SUP'))).body.items).toHaveLength(1);
      expect((await request(app).get('/v1/admin/hotels?status=SUSPENDED').set(auth('SUP'))).body.items).toHaveLength(0);
    });
  });

  describe('ADM-15 đổi tài khoản nhận tiền (hai người)', () => {
    const body = { type: 'BANK', accountNo: '0123456789', accountName: 'CTY KS TEST', bankCode: 'VCB' };

    it('đề xuất: trả nhãn đã che, DB lưu mã hóa, người đề xuất không tự duyệt được', async () => {
      const put = await request(app).put(`/v1/admin/hotels/${hotelId}/payout-account`).set(auth('A')).send(body);
      expect(put.status).toBe(202);
      expect(put.body.hotel.payoutAccount.pendingChange.labelMasked).toBe('TK ****6789');
      expect(JSON.stringify(put.body)).not.toMatch(/0123456789|detailsEnc/);

      const raw = await col.hotels().findOne({ _id: new ObjectId(hotelId) });
      const enc = raw!.payoutAccount!.pendingChange!.detailsEnc;
      expect(enc).not.toContain('0123456789');
      expect(decryptJson(enc)).toMatchObject({ accountNo: '0123456789', bankCode: 'VCB' });

      expect((await request(app).put(`/v1/admin/hotels/${hotelId}/payout-account`).set(auth('B')).send(body)).body.error.code).toBe('PENDING_CHANGE_EXISTS');
      const self = await request(app).post(`/v1/admin/hotels/${hotelId}/payout-account/approve`).set(auth('A'));
      expect(self.status).toBe(403);
      expect(self.body.error.code).toBe('FOUR_EYES_REQUIRED');
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/payout-account/approve`).set(auth('SUP'))).status).toBe(403);
      expect((await request(app).get('/v1/admin/hotels?pendingPayout=true').set(auth('FIN'))).body.items).toHaveLength(1);
    });

    it('Kế toán duyệt: tài khoản có hiệu lực, hết đề xuất chờ; audit không chứa số tài khoản', async () => {
      const ok = await request(app).post(`/v1/admin/hotels/${hotelId}/payout-account/approve`).set(auth('FIN'));
      expect(ok.status).toBe(200);
      expect(ok.body.hotel.payoutAccount).toMatchObject({ type: 'BANK', labelMasked: 'TK ****6789' });
      expect(ok.body.hotel.payoutAccount.pendingChange).toBeUndefined();
      expect((await request(app).post(`/v1/admin/hotels/${hotelId}/payout-account/approve`).set(auth('FIN'))).body.error.code).toBe('NO_PENDING_CHANGE');
      const logs = await col.auditLogs().find({ action: /^HOTEL\.PAYOUT/ }).toArray();
      expect(logs.map((l) => l.action).sort()).toEqual(['HOTEL.PAYOUT_ACCOUNT.CHANGE', 'HOTEL.PAYOUT_ACCOUNT.REQUEST']);
      expect(JSON.stringify(logs)).not.toContain('0123456789');
    });

    it('từ chối đề xuất: xóa đề xuất, giữ tài khoản cũ', async () => {
      await request(app).put(`/v1/admin/hotels/${hotelId}/payout-account`).set(auth('A')).send({ type: 'MOMO', accountNo: '0912345678', accountName: 'CHU KS' });
      const rej = await request(app).post(`/v1/admin/hotels/${hotelId}/payout-account/reject`).set(auth('FIN')).send({ reason: 'Tên không khớp giấy phép' });
      expect(rej.status).toBe(200);
      expect(rej.body.hotel.payoutAccount.labelMasked).toBe('TK ****6789');
      expect(rej.body.hotel.payoutAccount.pendingChange).toBeUndefined();
    });
  });

  describe('ADM-08 thống kê khách sạn + khóa giá theo cấu hình', () => {
    it('đơn dùng phí dịch vụ theo cấu hình hiện hành và lưu số phiên bản', async () => {
      const rt = new ObjectId();
      await col.roomTypes().insertOne({ _id: rt, hotelId: new ObjectId(hotelId), name: 'Deluxe', totalRooms: 3, pricing: { baseNightVnd: 600_000 }, active: true });
      const put = await request(app).put('/v1/admin/configs/pricing.serviceFee').set(auth('A')).send({ value: { bps: 300, minVnd: 10000, roundToVnd: 1000 }, reason: 'Thử nghiệm 3%' });
      expect(put.status).toBe(201);
      const from = new Date(Date.now() + 2 * 86400_000);
      const bk = await request(app).post('/v1/bookings').set('Idempotency-Key', 'adm-stat-0001').send({
        hotelId, roomTypeId: rt.toHexString(), from: from.toISOString(), to: new Date(from.getTime() + 86400_000).toISOString(),
        guest: { fullName: 'Nguyễn Văn A', phone: '0912345678' },
      });
      expect(bk.status).toBe(201);
      expect(bk.body.booking.pricing.serviceFeeVnd).toBe(18_000); // 3% × 600.000
      const saved = await col.bookings().findOne({ code: bk.body.booking.code });
      expect(saved!.pricing.params).toEqual({ configVersions: { serviceFee: put.body.version } });

      // Thêm một khách đang ở (CHECKED_IN) để thấy phòng có khách.
      await col.roomReservations().insertOne({
        _id: new ObjectId(), hotelId: new ObjectId(hotelId), roomTypeId: rt, kind: 'BOOKING', qty: 1,
        from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000), state: 'CHECKED_IN', createdAt: new Date(), updatedAt: new Date(),
      });
      const stats = await request(app)
        .get(`/v1/admin/hotels/${hotelId}/stats`).query({ from: new Date().toISOString(), to: new Date(Date.now() + 10 * 86400_000).toISOString() })
        .set(auth('FIN'));
      expect(stats.status).toBe(200);
      expect(stats.body.rooms).toMatchObject({ totalSellable: 3, occupiedNow: 1, availableNow: 2 });
      const exp = stats.body.revenue.byStatus;
      expect(Object.values(exp as Record<string, { hotelShareVnd: number }>).reduce((s, x) => s + x.hotelShareVnd, 0)).toBe(600_000);
      expect(stats.body.revenue.realized.hotelShareVnd).toBe(0);
      expect((await request(app).get(`/v1/admin/hotels/${hotelId}/stats?from=2026-12-01&to=2026-11-01`).set(auth('FIN'))).status).toBe(422);
    });
  });

  describe('ADM-09 tra cứu audit', () => {
    it('lọc theo action / actor / entity; quyền AUDIT_READ (OPS không có)', async () => {
      const byAction = await request(app).get('/v1/admin/audit-logs?action=HOTEL.CREATE').set(auth('SUP'));
      expect(byAction.body.items).toHaveLength(1);
      const byActor = await request(app).get(`/v1/admin/audit-logs?actorId=${ids.A}&limit=100`).set(auth('A'));
      expect(byActor.body.items.length).toBeGreaterThan(5);
      expect(byActor.body.items.every((i: { actor: { id: string } }) => i.actor.id === ids.A)).toBe(true);
      const byEntity = await request(app).get(`/v1/admin/audit-logs?entityType=hotel&entityId=${hotelId}`).set(auth('A'));
      expect(byEntity.body.items.length).toBeGreaterThan(3);
      expect((await request(app).get('/v1/admin/audit-logs').set(auth('OPS'))).status).toBe(403);
    });

    it('phân trang con trỏ: trang 1 + trang 2 không trùng, đủ tổng', async () => {
      const all = await request(app).get('/v1/admin/audit-logs?limit=100').set(auth('A'));
      const p1 = await request(app).get('/v1/admin/audit-logs?limit=5').set(auth('A'));
      expect(p1.body.items).toHaveLength(5);
      const p2 = await request(app).get(`/v1/admin/audit-logs?limit=5&cursor=${p1.body.nextCursor}`).set(auth('A'));
      const ids1 = p1.body.items.map((i: { _id: string }) => i._id);
      expect(p2.body.items.map((i: { _id: string }) => i._id)).toEqual(all.body.items.slice(5, 10).map((i: { _id: string }) => i._id));
      expect(p2.body.items.some((i: { _id: string }) => ids1.includes(i._id))).toBe(false);
    });

    it('con trỏ hỏng / entityId thiếu entityType -> 422', async () => {
      expect((await request(app).get('/v1/admin/audit-logs?cursor=abc').set(auth('A'))).status).toBe(422);
      expect((await request(app).get('/v1/admin/audit-logs?entityId=1').set(auth('A'))).status).toBe(422);
    });

    it('không có API sửa/xóa nhật ký', async () => {
      expect((await request(app).delete('/v1/admin/audit-logs').set(auth('A'))).status).toBe(404);
      expect((await request(app).patch('/v1/admin/audit-logs').set(auth('A')).send({})).status).toBe(404);
    });
  });
});
