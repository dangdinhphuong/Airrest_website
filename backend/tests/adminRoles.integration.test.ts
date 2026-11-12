import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { PERMISSION_CATALOG } from '../config/permissionCatalog';
import { PERM } from '../config/permissions';
import { ADMIN_ROLES } from '../config/roles';
import { signAccountToken } from '../lib/jwt';
import { closeDb, count, freshDb, mkAccount, mkAdmin, one, systemRoleId } from './support/db';

// Danh mục quyền phải phủ mọi mã trong PERM (không cần DB).
describe('danh mục quyền', () => {
  it('có nhóm + mô tả cho mọi permission', () => {
    for (const p of Object.values(PERM)) {
      expect(PERMISSION_CATALOG[p], p).toBeTruthy();
      expect(PERMISSION_CATALOG[p].group.length).toBeGreaterThan(0);
      expect(PERMISSION_CATALOG[p].description.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PERMISSION_CATALOG).sort()).toEqual(Object.values(PERM).sort());
  });
});

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('tích hợp: vai trò & quyền tùy chỉnh của Admin', () => {
  const app = createApp();
  const h = (t: string) => ({ Authorization: `Bearer ${t}` });
  let sys: { id: string; token: string }; // SYSADMIN thật (đủ quyền của vai trò hệ thống)
  let sys2: { id: string; token: string };
  let limited: { id: string; token: string }; // chỉ có account:manage + audit:read
  const mkSys = async (email: string) => {
    const id = await mkAccount({ type: 'ADMIN', email, roleIds: [await systemRoleId('SYSADMIN')], adminRole: 'SYSADMIN' });
    return { id, token: signAccountToken({ sub: id, accountType: 'ADMIN' }) };
  };
  const createRole = (token: string, body: object) => request(app).post('/v1/admin/roles').set(h(token)).send(body);

  beforeAll(async () => {
    await freshDb({ roles: true });
    sys = await mkSys('sys@airrest.vn');
    sys2 = await mkSys('sys2@airrest.vn');
    limited = await mkAdmin([PERM.ADMIN_ACCOUNT_MANAGE, PERM.AUDIT_READ], 'limited@airrest.vn');
  });
  afterAll(async () => closeDb());

  it('GET /permissions: đủ danh mục, có nhóm/mô tả, cần quyền', async () => {
    const r = await request(app).get('/v1/admin/permissions').set(h(sys.token));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(Object.values(PERM).length);
    expect(r.body.items[0]).toEqual(expect.objectContaining({ key: expect.any(String), group: expect.any(String), description: expect.any(String), sensitive: expect.any(Boolean) }));
    expect(r.body.items.find((i: { key: string }) => i.key === PERM.HOTEL_SCOPE_ALL).sensitive).toBe(true);
    const ops = await mkAdmin([PERM.AUDIT_READ]);
    expect((await request(app).get('/v1/admin/permissions').set(h(ops.token))).status).toBe(403);
    expect((await request(app).get('/v1/admin/permissions')).status).toBe(401);
  });

  it('GET /roles: 4 vai trò hệ thống trước (tương thích key/name/permissions), kèm accountCount; không lộ hotel_owner / vai trò khách sạn', async () => {
    const r = await request(app).get('/v1/admin/roles').set(h(sys.token));
    expect(r.status).toBe(200);
    expect(r.body.items.slice(0, 4).map((i: { key: string }) => i.key)).toEqual(['OPS', 'SUPPORT', 'FINANCE', 'SYSADMIN']);
    const s = r.body.items.find((i: { key: string }) => i.key === 'SYSADMIN');
    expect(s).toMatchObject({ key: 'SYSADMIN', name: ADMIN_ROLES.SYSADMIN.name, system: true, accountCount: 2, permissions: ADMIN_ROLES.SYSADMIN.permissions });
    expect(r.body.items.map((i: { key: string }) => i.key)).not.toContain('hotel_owner');
  });

  it('tạo vai trò: 201, chuẩn hóa, ghi audit; tên trùng -> 409; permission lạ -> 422; thiếu -> 422', async () => {
    const r = await createRole(sys.token, { name: 'Kiểm duyệt nội dung', description: 'Chỉ xem', permissions: [PERM.AUDIT_READ, PERM.ADMIN_BOOKING_READ, PERM.AUDIT_READ] });
    expect(r.status).toBe(201);
    expect(r.body.role).toMatchObject({ name: 'Kiểm duyệt nội dung', system: false, accountCount: 0, permissions: [PERM.AUDIT_READ, PERM.ADMIN_BOOKING_READ] });
    expect(r.body.role.key.startsWith('custom_')).toBe(true);
    expect(await count('audit_logs', "action = 'ROLE.CREATE'")).toBe(1);
    expect((await createRole(sys.token, { name: 'kiểm duyệt NỘI DUNG', permissions: [PERM.AUDIT_READ] })).body.error.code).toBe('ROLE_NAME_TAKEN');
    expect((await createRole(sys.token, { name: 'Tên trùng hệ thống', permissions: ['x:y'] })).body.error).toMatchObject({ code: 'UNKNOWN_PERMISSION', details: { unknown: ['x:y'] } });
    expect((await createRole(sys.token, { name: 'Quản trị hệ thống', permissions: [PERM.AUDIT_READ] })).status).toBe(409);
    expect((await createRole(sys.token, { name: 'Rỗng', permissions: [] })).status).toBe(422);
    const list = await request(app).get('/v1/admin/roles').set(h(sys.token));
    expect(list.body.items.map((i: { name: string }) => i.name)).toContain('Kiểm duyệt nội dung');
  });

  it('chống leo thang: không gán quyền mình không có (kể cả khi sửa); quyền nhạy cảm cũng vậy', async () => {
    const r = await createRole(limited.token, { name: 'Leo thang', permissions: [PERM.AUDIT_READ, PERM.ADMIN_PAYMENT_MANAGE] });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'PERMISSION_ESCALATION', details: { missing: [PERM.ADMIN_PAYMENT_MANAGE] } });
    expect((await createRole(limited.token, { name: 'Leo thang 2', permissions: [PERM.HOTEL_SCOPE_ALL] })).status).toBe(403);
    const okRole = await createRole(limited.token, { name: 'Chỉ audit', permissions: [PERM.AUDIT_READ] });
    expect(okRole.status).toBe(201);
    const up = await request(app).patch(`/v1/admin/roles/${okRole.body.role.id}`).set(h(limited.token)).send({ permissions: [PERM.AUDIT_READ, PERM.FLIGHT_MANAGE] });
    expect(up.status).toBe(403);
    // Vai trò chứa quyền cao hơn người sửa: không sửa/xóa được.
    const high = await createRole(sys.token, { name: 'Tài chính cao', permissions: [PERM.ADMIN_PAYMENT_MANAGE] });
    expect((await request(app).patch(`/v1/admin/roles/${high.body.role.id}`).set(h(limited.token)).send({ name: 'Đổi tên' })).status).toBe(403);
    expect((await request(app).delete(`/v1/admin/roles/${high.body.role.id}`).set(h(limited.token))).status).toBe(403);
    // Cũng không gán được cho tài khoản (tạo/sửa) vai trò cao hơn mình, kể cả vai trò hệ thống.
    const acc = (b: object) => request(app).post('/v1/admin/accounts').set(h(limited.token)).send({ fullName: 'Nhân sự', password: 'MatKhauDai12345!', ...b });
    expect((await acc({ email: 'n1@airrest.vn', roleId: high.body.role.id })).status).toBe(403);
    expect((await acc({ email: 'n2@airrest.vn', adminRole: 'SYSADMIN' })).status).toBe(403);
    expect((await acc({ email: 'n3@airrest.vn', roleId: okRole.body.role.id })).status).toBe(201);
    // Không sửa / khóa / đặt lại mật khẩu tài khoản có quyền cao hơn mình (chiếm quyền qua mật khẩu mới).
    expect((await request(app).post(`/v1/admin/accounts/${sys.id}/reset-password`).set(h(limited.token)).send({ password: 'MatKhauMoi12345!' })).status).toBe(403);
    expect((await request(app).patch(`/v1/admin/accounts/${sys.id}`).set(h(limited.token)).send({ status: 'LOCKED' })).status).toBe(403);
  });

  it('sửa vai trò có hiệu lực ngay cho tài khoản đang dùng; PATCH chỉ đổi tên/mô tả giữ quyền', async () => {
    const role = (await createRole(sys.token, { name: 'Hậu kiểm', permissions: [PERM.ADMIN_BOOKING_READ] })).body.role;
    const acc = await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'hk@airrest.vn', fullName: 'Hậu kiểm viên', roleId: role.id, password: 'MatKhauDai12345!' });
    expect(acc.status).toBe(201);
    expect(acc.body.account).toMatchObject({ adminRole: null, roleId: role.id, roleName: 'Hậu kiểm' });
    const login = await request(app).post('/v1/auth/login').send({ email: 'hk@airrest.vn', password: 'MatKhauDai12345!' });
    expect(login.body.account.permissions).toEqual([PERM.ADMIN_BOOKING_READ]);
    const t = { Authorization: `Bearer ${login.body.token}` };
    expect((await request(app).get('/v1/admin/audit-logs').set(t)).status).toBe(403);

    const up = await request(app).patch(`/v1/admin/roles/${role.id}`).set(h(sys.token)).send({ permissions: [PERM.ADMIN_BOOKING_READ, PERM.AUDIT_READ] });
    expect(up.status).toBe(200);
    expect(up.body.role.accountCount).toBe(1);
    expect((await request(app).get('/v1/admin/audit-logs').set(t)).status).toBe(200); // hiệu lực ngay, không cần đăng nhập lại

    const rename = await request(app).patch(`/v1/admin/roles/${role.id}`).set(h(sys.token)).send({ name: 'Hậu kiểm 2', description: 'Mô tả' });
    expect(rename.body.role).toMatchObject({ name: 'Hậu kiểm 2', description: 'Mô tả', permissions: [PERM.ADMIN_BOOKING_READ, PERM.AUDIT_READ] });
    expect((await request(app).patch(`/v1/admin/roles/${role.id}`).set(h(sys.token)).send({ name: 'Tài chính cao' })).status).toBe(409);
    expect((await request(app).patch(`/v1/admin/roles/${role.id}`).set(h(sys.token)).send({ permissions: ['bogus'] })).status).toBe(422);
    expect((await request(app).patch(`/v1/admin/roles/${role.id}`).set(h(sys.token)).send({})).status).toBe(422);
    expect(await count('audit_logs', "action = 'ROLE.UPDATE'")).toBeGreaterThanOrEqual(2);

    // Đổi tài khoản sang vai trò hệ thống OPS rồi quay lại tùy chỉnh: admin_role đồng bộ.
    const toOps = await request(app).patch(`/v1/admin/accounts/${acc.body.account.id}`).set(h(sys.token)).send({ roleId: await systemRoleId('OPS') });
    expect(toOps.body.account).toMatchObject({ adminRole: 'OPS' });
    const back = await request(app).patch(`/v1/admin/accounts/${acc.body.account.id}`).set(h(sys.token)).send({ roleId: role.id });
    expect(back.body.account).toMatchObject({ adminRole: null, roleId: role.id });
    const byRole = await request(app).get(`/v1/admin/accounts?roleId=${role.id}`).set(h(sys.token));
    expect(byRole.body.items).toHaveLength(1);
  });

  it('vai trò hệ thống không sửa/xóa được; không tồn tại -> 404; xóa khi đang dùng -> 409; xóa được khi trống', async () => {
    const sysId = await systemRoleId('OPS');
    expect((await request(app).patch(`/v1/admin/roles/${sysId}`).set(h(sys.token)).send({ name: 'Khác' })).body.error.code).toBe('ROLE_SYSTEM_IMMUTABLE');
    expect((await request(app).delete(`/v1/admin/roles/${sysId}`).set(h(sys.token))).status).toBe(409);
    const owner = await systemRoleId('hotel_owner');
    expect((await request(app).delete(`/v1/admin/roles/${owner}`).set(h(sys.token))).status).toBe(404); // vai trò khách sạn không thuộc Admin
    expect((await request(app).delete('/v1/admin/roles/00000000-0000-4000-8000-000000000000').set(h(sys.token))).status).toBe(404);

    const role = (await createRole(sys.token, { name: 'Tạm thời', permissions: [PERM.AUDIT_READ] })).body.role;
    const acc = await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'tam@airrest.vn', fullName: 'Tạm thời', roleId: role.id, password: 'MatKhauDai12345!' });
    const inUse = await request(app).delete(`/v1/admin/roles/${role.id}`).set(h(sys.token));
    expect(inUse.status).toBe(409);
    expect(inUse.body.error).toMatchObject({ code: 'ROLE_IN_USE', details: { accountCount: 1 } });
    await request(app).patch(`/v1/admin/accounts/${acc.body.account.id}`).set(h(sys.token)).send({ adminRole: 'SUPPORT' });
    expect((await request(app).delete(`/v1/admin/roles/${role.id}`).set(h(sys.token))).status).toBe(204);
    expect(await count('roles', 'id = $1', [role.id])).toBe(0);
    expect(await count('audit_logs', "action = 'ROLE.DELETE'")).toBe(1);
  });

  it('không sửa/xóa vai trò đang gán cho chính mình (CANNOT_MODIFY_SELF); không tự đổi vai trò; roleId không hợp lệ', async () => {
    const mine = (await createRole(sys.token, { name: 'Vai trò của tôi', permissions: [PERM.ADMIN_ACCOUNT_MANAGE, PERM.AUDIT_READ] })).body.role;
    const accId = (await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'me@airrest.vn', fullName: 'Tôi', roleId: mine.id, password: 'MatKhauDai12345!' })).body.account.id;
    const t = signAccountToken({ sub: accId, accountType: 'ADMIN' });
    const self = await request(app).patch(`/v1/admin/roles/${mine.id}`).set(h(t)).send({ permissions: [PERM.ADMIN_ACCOUNT_MANAGE, PERM.AUDIT_READ] });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');
    expect((await request(app).delete(`/v1/admin/roles/${mine.id}`).set(h(t))).status).toBe(409);
    expect((await request(app).patch(`/v1/admin/accounts/${accId}`).set(h(t)).send({ roleId: await systemRoleId('OPS') })).body.error.code).toBe('CANNOT_MODIFY_SELF');
    // roleId lạ / vai trò khách sạn / cả hai trường
    expect((await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'x1@airrest.vn', fullName: 'X Y', roleId: await systemRoleId('hotel_owner'), password: 'MatKhauDai12345!' })).status).toBe(404);
    expect((await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'x2@airrest.vn', fullName: 'X Y', roleId: mine.id, adminRole: 'OPS', password: 'MatKhauDai12345!' })).status).toBe(422);
    expect((await request(app).post('/v1/admin/accounts').set(h(sys.token)).send({ email: 'x3@airrest.vn', fullName: 'X Y', password: 'MatKhauDai12345!' })).status).toBe(422);
  });

  it('SYSADMIN cuối cùng không bị hạ xuống vai trò tùy chỉnh', async () => {
    // Người có vai trò tùy chỉnh mang đủ bộ quyền SYSADMIN (mức SYSADMIN theo quyền) nhưng admin_role = NULL.
    const only = await mkAdmin([...ADMIN_ROLES.SYSADMIN.permissions], 'rootlike@airrest.vn');
    const role = (await createRole(sys.token, { name: 'Hạ cấp', permissions: [PERM.AUDIT_READ] })).body.role;
    // sys2 bị sys hạ xuống vai trò tùy chỉnh: được (còn sys). Sau đó sys không còn ai khác -> sys2 (không còn SYSADMIN) không giúp được.
    expect((await request(app).patch(`/v1/admin/accounts/${sys2.id}`).set(h(sys.token)).send({ roleId: role.id })).status).toBe(200);
    expect((await one<{ n: number }>("SELECT count(*) AS n FROM accounts WHERE admin_role = 'SYSADMIN' AND status = 'ACTIVE'"))!.n).toBe(1);
    const third = await mkSys('sys3@airrest.vn');
    // sys3 hạ sys xuống: được vì còn sys3; rồi sys3 là SYSADMIN cuối nên không bị khóa bởi người có account:manage khác.
    expect((await request(app).patch(`/v1/admin/accounts/${sys.id}`).set(h(third.token)).send({ roleId: role.id })).status).toBe(200);
    const last = await request(app).patch(`/v1/admin/accounts/${third.id}`).set(h(only.token)).send({ roleId: role.id });
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe('LAST_SYSADMIN');
  });
});
