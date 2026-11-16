import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERMISSION_CATALOG } from '../config/permissionCatalog';
import { PERM } from '../config/permissions';
import { HOTEL_ASSIGNABLE_PERMISSIONS } from '../config/roles';
import { signAccountToken } from '../lib/jwt';
import { closeDb, count, db, freshDb, mkAccount, mkAdmin, mkHotel, mkStaff, one, systemRoleId } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

describe('phạm vi quyền khách sạn (không cần DB)', () => {
  it('chỉ chứa quyền có trong danh mục, không có admin:/payer:/scope/business', () => {
    for (const p of HOTEL_ASSIGNABLE_PERMISSIONS) {
      expect(PERMISSION_CATALOG[p as keyof typeof PERMISSION_CATALOG], p).toBeTruthy();
      expect(p).not.toMatch(/^(admin|payer|business):/);
    }
    expect(HOTEL_ASSIGNABLE_PERMISSIONS).not.toContain(PERM.HOTEL_SCOPE_ALL);
  });
});

run('tích hợp: nhân viên + vai trò riêng của khách sạn', () => {
  const app = createApp();
  const h = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PW = 'Mat-khau-tam-2026';
  let hotelA: string, hotelB: string;
  let owner: { id: string; token: string }, ownerB: { id: string; token: string }, admin: { id: string; token: string };
  const mkOwner = async (hotelId: string, email: string) => {
    const id = await mkAccount({ type: 'HOTEL', email, hotelId, roleIds: [await systemRoleId('hotel_owner')] });
    await db.query('UPDATE accounts SET is_owner = true WHERE id = $1', [id]);
    return { id, token: signAccountToken({ sub: id, accountType: 'HOTEL' }) };
  };
  const roleIn = (t: string, body: object) => request(app).post('/v1/hotel/roles').set(h(t)).send(body);
  const staffIn = (t: string, body: object) => request(app).post('/v1/hotel/staff').set(h(t)).send(body);

  beforeAll(async () => {
    await freshDb({ roles: true });
    hotelA = await mkHotel({ code: 'AAA' });
    hotelB = await mkHotel({ code: 'BBB' });
    owner = await mkOwner(hotelA, 'owner-a@x.vn');
    ownerB = await mkOwner(hotelB, 'owner-b@x.vn');
    const adminId = await mkAccount({ type: 'ADMIN', email: 'sys@x.vn', roleIds: [await systemRoleId('SYSADMIN')], adminRole: 'SYSADMIN' });
    admin = { id: adminId, token: signAccountToken({ sub: adminId, accountType: 'ADMIN' }) };
  });
  afterAll(closeDb);

  it('hotel_owner có quyền mới; seed chạy lại cập nhật role cũ', async () => {
    const r = await one<{ permissions: string[] }>("SELECT permissions FROM roles WHERE key = 'hotel_owner'");
    expect(r!.permissions).toEqual(expect.arrayContaining([PERM.HOTEL_STAFF_MANAGE, PERM.HOTEL_ROLE_MANAGE]));
  });

  it('GET /hotel/permissions: chỉ phạm vi khách sạn; thiếu quyền 403; admin không gắn khách sạn không dùng được', async () => {
    const res = await request(app).get('/v1/hotel/permissions').set(h(owner.token));
    expect(res.status).toBe(200);
    const keys = res.body.items.map((i: { key: string }) => i.key);
    expect(keys).toEqual([...HOTEL_ASSIGNABLE_PERMISSIONS]);
    expect(keys.some((k: string) => /^(admin|payer|business):/.test(k) || k === 'hotel:scope:all')).toBe(false);
    const nobody = await mkStaff(hotelA, [PERM.BOOKING_READ]);
    expect((await request(app).get('/v1/hotel/permissions').set(h(nobody.token))).status).toBe(403);
    expect((await request(app).get('/v1/hotel/roles').set(h(admin.token))).status).toBe(403); // SYSADMIN không có hotel:role:manage
  });

  describe('vai trò', () => {
    let roleId: string;
    it('liệt kê: mẫu hệ thống (assignable chỉ lễ tân/quản lý), không thấy vai trò admin', async () => {
      const res = await request(app).get('/v1/hotel/roles').set(h(owner.token));
      const byKey = Object.fromEntries(res.body.items.map((r: { key: string }) => [r.key, r]));
      expect(byKey.hotel_owner.assignable).toBe(false);
      expect(byKey.hotel_receptionist.assignable).toBe(true);
      expect(byKey.hotel_manager.assignable).toBe(true);
      for (const k of ['SYSADMIN', 'OPS', 'FINANCE', 'SUPPORT', 'payer_staff', 'hotel_driver']) expect(byKey[k]).toBeUndefined();
    });
    it('tạo: 201 key custom_, trùng tên 409 (không phân biệt hoa thường), khác khách sạn thì được', async () => {
      const c = await roleIn(owner.token, { name: 'Kế toán KS', permissions: [PERM.BOOKING_READ] });
      expect(c.status).toBe(201);
      expect(c.body.role.key).toMatch(/^custom_/);
      roleId = c.body.role.id;
      expect((await one<{ scope: string; hotelId: string }>('SELECT scope, hotel_id FROM roles WHERE id = $1', [roleId]))).toMatchObject({ scope: 'HOTEL', hotelId: hotelA });
      expect((await roleIn(owner.token, { name: 'kế toán ks', permissions: [PERM.BOOKING_READ] })).body.error.code).toBe('ROLE_NAME_TAKEN');
      expect((await roleIn(ownerB.token, { name: 'Kế toán KS', permissions: [PERM.BOOKING_READ] })).status).toBe(201);
    });
    it('quyền ngoài phạm vi khách sạn -> 422; quyền lạ -> 422', async () => {
      for (const p of [PERM.ADMIN_ACCOUNT_MANAGE, PERM.PAYER_DELAY_MANAGE, PERM.HOTEL_SCOPE_ALL, PERM.BUSINESS_REPORT_READ, 'khong:ton:tai']) {
        const r = await roleIn(owner.token, { name: `X ${p}`, permissions: [p] });
        expect(r.status, p).toBe(422);
        expect(r.body.error.code).toBe('PERMISSION_OUT_OF_SCOPE');
      }
    });
    it('chống leo thang: người chỉ có hotel:role:manage + booking:read không tạo/sửa vai trò có quyền hơn', async () => {
      const mgr = await mkStaff(hotelA, [PERM.HOTEL_ROLE_MANAGE, PERM.BOOKING_READ]);
      const r = await roleIn(mgr.token, { name: 'Vượt quyền', permissions: [PERM.BOOKING_READ, PERM.ROOM_MANAGE] });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('PERMISSION_ESCALATION');
      expect((await request(app).patch(`/v1/hotel/roles/${roleId}`).set(h(mgr.token)).send({ permissions: [PERM.BOOKING_READ, PERM.ROOM_MANAGE] })).status).toBe(403);
      expect((await roleIn(mgr.token, { name: 'Vừa quyền', permissions: [PERM.BOOKING_READ] })).status).toBe(201);
    });
    it('sửa: đổi quyền có hiệu lực; vai trò hệ thống 409 (không sửa/xóa); vai trò khách sạn khác 404', async () => {
      const p = await request(app).patch(`/v1/hotel/roles/${roleId}`).set(h(owner.token)).send({ name: 'Kế toán KS 2', permissions: [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN] });
      expect(p.status).toBe(200);
      expect(p.body.role.permissions).toEqual([PERM.BOOKING_READ, PERM.BOOKING_CHECKIN]);
      const sysId = await systemRoleId('hotel_receptionist');
      expect((await request(app).patch(`/v1/hotel/roles/${sysId}`).set(h(owner.token)).send({ name: 'Đổi' })).body.error.code).toBe('ROLE_SYSTEM_IMMUTABLE');
      expect((await request(app).delete(`/v1/hotel/roles/${sysId}`).set(h(owner.token))).body.error.code).toBe('ROLE_SYSTEM_IMMUTABLE');
      const otherId = (await one<{ id: string }>("SELECT id FROM roles WHERE hotel_id = $1 AND scope = 'HOTEL'", [hotelB]))!.id;
      expect((await request(app).patch(`/v1/hotel/roles/${otherId}`).set(h(owner.token)).send({ name: 'Hack' })).status).toBe(404);
      expect((await request(app).delete(`/v1/hotel/roles/${otherId}`).set(h(owner.token))).status).toBe(404);
    });
    it('xóa: đang có nhân viên dùng 409 ROLE_IN_USE; hết dùng thì 204', async () => {
      const s = await staffIn(owner.token, { email: 'ketoan@x.vn', fullName: 'Kế Toán', roleId, password: PW });
      expect(s.status).toBe(201);
      const d = await request(app).delete(`/v1/hotel/roles/${roleId}`).set(h(owner.token));
      expect(d.status).toBe(409);
      expect(d.body.error.code).toBe('ROLE_IN_USE');
      await db.query('DELETE FROM accounts WHERE id = $1', [s.body.staff.id]);
      expect((await request(app).delete(`/v1/hotel/roles/${roleId}`).set(h(owner.token))).status).toBe(204);
      expect(await count('roles', 'id = $1', [roleId])).toBe(0);
    });
  });

  describe('cô lập admin <-> khách sạn', () => {
    it('admin KHÔNG thấy/sửa/xóa vai trò scope HOTEL qua /admin/roles', async () => {
      const c = await roleIn(owner.token, { name: 'Riêng KS A', permissions: [PERM.BOOKING_READ] });
      const id = c.body.role.id as string;
      const list = await request(app).get('/v1/admin/roles').set(h(admin.token));
      const keys = list.body.items.map((r: { id: string; key: string }) => r.key);
      expect(list.body.items.some((r: { id: string }) => r.id === id)).toBe(false);
      expect(keys).not.toContain('hotel_receptionist');
      expect(keys).not.toContain('hotel_manager');
      expect((await request(app).patch(`/v1/admin/roles/${id}`).set(h(admin.token)).send({ name: 'Hack' })).status).toBe(404);
      expect((await request(app).delete(`/v1/admin/roles/${id}`).set(h(admin.token))).status).toBe(404);
    });
    it('admin không gán được vai trò khách sạn cho tài khoản admin (404)', async () => {
      const hotelRole = (await one<{ id: string }>("SELECT id FROM roles WHERE scope = 'HOTEL' AND hotel_id = $1 LIMIT 1", [hotelA]))!.id;
      for (const roleId of [hotelRole, await systemRoleId('hotel_receptionist'), await systemRoleId('hotel_owner')]) {
        const r = await request(app).post('/v1/admin/accounts').set(h(admin.token)).send({ email: `x${roleId.slice(0, 4)}@x.vn`, fullName: 'Admin giả', roleId, password: PW });
        expect(r.status).toBe(404);
      }
    });
    it('admin không liệt kê tài khoản HOTEL; chủ khách sạn không thấy vai trò/tài khoản admin', async () => {
      const list = await request(app).get('/v1/admin/accounts?limit=100').set(h(admin.token));
      expect(list.body.items.every((a: { type: string }) => a.type === 'ADMIN')).toBe(true);
      expect((await request(app).patch(`/v1/admin/accounts/${owner.id}`).set(h(admin.token)).send({ fullName: 'X Y' })).status).toBe(404);
      const staff = await request(app).get('/v1/hotel/staff?limit=100').set(h(owner.token));
      expect(staff.body.items.some((s: { id: string }) => s.id === admin.id)).toBe(false);
      expect((await request(app).patch(`/v1/hotel/staff/${admin.id}`).set(h(owner.token)).send({ fullName: 'Hack' })).status).toBe(404);
      const sysAdminRole = await systemRoleId('SYSADMIN');
      expect((await request(app).patch(`/v1/hotel/roles/${sysAdminRole}`).set(h(owner.token)).send({ name: 'Hack' })).status).toBe(404);
      expect((await staffIn(owner.token, { email: 'ad2@x.vn', fullName: 'Admin lậu', roleId: sysAdminRole, password: PW })).status).toBe(404);
    });
  });

  describe('nhân viên', () => {
    let staffId: string;
    let recId: string;
    it('tạo: 201, gắn đúng khách sạn, không lộ passwordHash, đăng nhập được và chỉ có quyền của vai trò', async () => {
      recId = await systemRoleId('hotel_receptionist');
      const c = await staffIn(owner.token, { email: 'LeTan@X.vn', fullName: 'Lễ Tân', phone: '0912345678', roleId: recId, password: PW });
      expect(c.status).toBe(201);
      staffId = c.body.staff.id;
      expect(JSON.stringify(c.body)).not.toMatch(/password/i);
      expect(c.body.staff).toMatchObject({ email: 'letan@x.vn', status: 'ACTIVE', isOwner: false, roleId: recId, phone: '0912345678' });
      expect(await one('SELECT 1 FROM accounts WHERE id = $1 AND hotel_id = $2 AND type = $3 AND business_id IS NULL', [staffId, hotelA, 'HOTEL'])).toBeTruthy();
      const login = await request(app).post('/v1/auth/login').set({ 'X-Forwarded-For': '10.92.0.1' }).send({ email: 'letan@x.vn', password: PW });
      expect(login.status).toBe(200);
      expect(login.body.account.permissions).toEqual(expect.arrayContaining([PERM.BOOKING_READ]));
      expect(login.body.account.permissions).not.toContain(PERM.HOTEL_STAFF_MANAGE);
      const t = login.body.token as string;
      expect((await request(app).get('/v1/hotel/staff').set(h(t))).status).toBe(403); // lễ tân không quản nhân viên
      expect((await request(app).get('/v1/hotel/bookings').set(h(t))).status).toBe(200);
      expect(await count('audit_logs', "action = 'HOTEL_STAFF.CREATE' AND entity_id = $1 AND hotel_id = $2", [staffId, hotelA])).toBe(1);
    });
    it('trùng email (kể cả khác hoa thường, khác khách sạn) -> 409', async () => {
      expect((await staffIn(owner.token, { email: 'letan@x.vn', fullName: 'Lễ Tân 2', roleId: recId, password: PW })).body.error.code).toBe('EMAIL_EXISTS');
      expect((await staffIn(ownerB.token, { email: 'LETAN@x.vn', fullName: 'Lễ Tân 3', roleId: recId, password: PW })).status).toBe(409);
    });
    it('mật khẩu < 12 ký tự 422; vai trò khách sạn khác 404; vai trò hotel_owner 404', async () => {
      expect((await staffIn(owner.token, { email: 'a1@x.vn', fullName: 'Ngắn', roleId: recId, password: 'ngan' })).status).toBe(422);
      const roleB = (await one<{ id: string }>("SELECT id FROM roles WHERE scope = 'HOTEL' AND hotel_id = $1 LIMIT 1", [hotelB]))!.id;
      expect((await staffIn(owner.token, { email: 'a2@x.vn', fullName: 'Chéo KS', roleId: roleB, password: PW })).status).toBe(404);
      expect((await staffIn(owner.token, { email: 'a3@x.vn', fullName: 'Chủ giả', roleId: await systemRoleId('hotel_owner'), password: PW })).status).toBe(404);
      expect((await staffIn(owner.token, { email: 'a4@x.vn', fullName: 'Tài xế', roleId: await systemRoleId('hotel_driver'), password: PW })).status).toBe(404);
    });
    it('danh sách: chỉ nhân viên khách sạn mình (kèm chủ), lọc q/status', async () => {
      const a = await request(app).get('/v1/hotel/staff').set(h(owner.token));
      const emails = a.body.items.map((s: { email: string }) => s.email);
      expect(emails).toEqual(expect.arrayContaining(['letan@x.vn', 'owner-a@x.vn']));
      expect(emails).not.toContain('owner-b@x.vn');
      expect((await request(app).get('/v1/hotel/staff?q=L%E1%BB%85%20T').set(h(owner.token))).body.items).toHaveLength(1);
      expect((await request(app).get('/v1/hotel/staff?status=LOCKED').set(h(owner.token))).body.items).toHaveLength(0);
    });
    it('IDOR: khách sạn khác -> 404 cho sửa/khóa/reset', async () => {
      expect((await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(ownerB.token)).send({ status: 'LOCKED' })).status).toBe(404);
      expect((await request(app).post(`/v1/hotel/staff/${staffId}/reset-password`).set(h(ownerB.token)).send({ password: PW })).status).toBe(404);
      expect((await one<{ status: string }>('SELECT status FROM accounts WHERE id = $1', [staffId]))!.status).toBe('ACTIVE');
    });
    it('đổi vai trò, khóa/mở khóa (khóa có hiệu lực ngay), reset mật khẩu', async () => {
      const mgrRole = await systemRoleId('hotel_manager');
      const p = await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(owner.token)).send({ roleId: mgrRole, fullName: 'Lễ Tân Mới', phone: null });
      expect(p.body.staff).toMatchObject({ roleId: mgrRole, fullName: 'Lễ Tân Mới', phone: null });
      const login = (pw: string) => request(app).post('/v1/auth/login').set({ 'X-Forwarded-For': '10.92.0.2' }).send({ email: 'letan@x.vn', password: pw });
      const token = (await login(PW)).body.token as string;
      expect((await request(app).get('/v1/hotel/bookings').set(h(token))).status).toBe(200);
      expect((await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(owner.token)).send({ status: 'LOCKED' })).body.staff.status).toBe('LOCKED');
      expect((await request(app).get('/v1/hotel/bookings').set(h(token))).status).toBe(401);
      expect((await login(PW)).status).toBe(401);
      await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(owner.token)).send({ status: 'ACTIVE' });
      expect((await request(app).post(`/v1/hotel/staff/${staffId}/reset-password`).set(h(owner.token)).send({ password: 'ngan' })).status).toBe(422);
      expect((await request(app).post(`/v1/hotel/staff/${staffId}/reset-password`).set(h(owner.token)).send({ password: 'Mat-khau-moi-2027' })).status).toBe(204);
      expect((await login('Mat-khau-moi-2027')).status).toBe(200);
      expect((await login(PW)).status).toBe(401);
    });
    it('không tự khóa / tự đổi vai trò / tự reset; chủ không bị nhân viên sửa/khóa/reset', async () => {
      const boss = await mkStaff(hotelA, [PERM.HOTEL_STAFF_MANAGE, PERM.BOOKING_READ], 'quanly-a@x.vn');
      expect((await request(app).patch(`/v1/hotel/staff/${boss.id}`).set(h(boss.token)).send({ status: 'LOCKED' })).body.error.code).toBe('CANNOT_MODIFY_SELF');
      expect((await request(app).patch(`/v1/hotel/staff/${boss.id}`).set(h(boss.token)).send({ roleId: await systemRoleId('hotel_receptionist') })).body.error.code).toBe('CANNOT_MODIFY_SELF');
      expect((await request(app).post(`/v1/hotel/staff/${boss.id}/reset-password`).set(h(boss.token)).send({ password: PW })).body.error.code).toBe('CANNOT_MODIFY_SELF');
      for (const req of [
        request(app).patch(`/v1/hotel/staff/${owner.id}`).set(h(boss.token)).send({ status: 'LOCKED' }),
        request(app).patch(`/v1/hotel/staff/${owner.id}`).set(h(boss.token)).send({ fullName: 'Hack Chủ' }),
        request(app).post(`/v1/hotel/staff/${owner.id}/reset-password`).set(h(boss.token)).send({ password: PW }),
      ]) expect((await req).body.error.code).toBe('OWNER_PROTECTED');
      // cả chính chủ cũng không tự khóa mình
      expect((await request(app).patch(`/v1/hotel/staff/${owner.id}`).set(h(owner.token)).send({ status: 'LOCKED' })).status).toBe(403);
      expect((await one<{ status: string }>('SELECT status FROM accounts WHERE id = $1', [owner.id]))!.status).toBe('ACTIVE');
    });
    it('chống leo thang: người chỉ có hotel:staff:manage + booking:read không gán vai trò mạnh hơn, không sửa người mạnh hơn', async () => {
      const boss = await mkStaff(hotelA, [PERM.HOTEL_STAFF_MANAGE, PERM.BOOKING_READ], 'quanly-b@x.vn');
      const r = await staffIn(boss.token, { email: 'b1@x.vn', fullName: 'Quản lý lậu', roleId: await systemRoleId('hotel_manager'), password: PW });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('PERMISSION_ESCALATION');
      expect((await request(app).patch(`/v1/hotel/staff/${staffId}`).set(h(boss.token)).send({ status: 'LOCKED' })).status).toBe(403); // staffId đang là hotel_manager
      expect((await request(app).post(`/v1/hotel/staff/${staffId}/reset-password`).set(h(boss.token)).send({ password: PW })).status).toBe(403);
      const lowRole = await systemRoleId('hotel_receptionist');
      expect((await staffIn(boss.token, { email: 'b2@x.vn', fullName: 'Lễ tân', roleId: lowRole, password: PW })).status).toBe(403); // checkin không có
    });
    it('tài xế (DRIVER) và tài khoản admin không nằm trong danh sách nhân viên', async () => {
      const dr = await mkAccount({ type: 'HOTEL', email: 'dr@x.vn', hotelId: hotelA, roleIds: [await systemRoleId('hotel_driver')] });
      await db.query("UPDATE accounts SET type = 'DRIVER' WHERE id = $1", [dr]);
      const list = await request(app).get('/v1/hotel/staff?limit=100').set(h(owner.token));
      expect(list.body.items.some((s: { id: string }) => s.id === dr)).toBe(false);
      expect((await request(app).patch(`/v1/hotel/staff/${dr}`).set(h(owner.token)).send({ status: 'LOCKED' })).status).toBe(404);
    });
  });
});
