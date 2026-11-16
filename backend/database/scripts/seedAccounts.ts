// Tạo hàng loạt tài khoản thử theo từng vai trò (chạy tay: npm run db:seed:accounts -w @airrest/backend).
// Chạy lại nhiều lần an toàn (upsert theo email / username / mã). Mật khẩu = SEED_PASSWORD. In bảng tài khoản dạng markdown ra stdout.
import { env } from '../../config/env';
import { PERM } from '../../config/permissions';
import { hashPassword } from '../../lib/password';
import { ensureSystemRoles } from '../../services/systemRoles';
import { closeDb, connectDb, db } from '../pg';
import { ensureBusinesses } from '../backfillBusinesses';

const ADMINS: [string, string][] = [['SYSADMIN', 'Quản trị hệ thống'], ['OPS', 'Điều phối xe'], ['SUPPORT', 'CSKH'], ['FINANCE', 'Kế toán']];
const HOTELS = ['HAN-01', 'HAN-02', 'SGN-01', 'SGN-02', 'DAD-01', 'CXR-01', 'PQC-01', 'HPH-01'];
const PAYERS: { code: string; name: string; kind: string; stations: [string, string][] }[] = [
  { code: 'VNA', name: 'Vietnam Airlines (thử)', kind: 'AIRLINE', stations: [['HAN', 'Trạm Nội Bài'], ['SGN', 'Trạm Tân Sơn Nhất']] },
  { code: 'VJ', name: 'Vietjet Air (thử)', kind: 'AIRLINE', stations: [['HAN', 'Trạm Nội Bài'], ['DAD', 'Trạm Đà Nẵng']] },
  { code: 'SAGS', name: 'SAGS Mặt đất (thử)', kind: 'GROUND_HANDLER', stations: [['SGN', 'Trạm Tân Sơn Nhất']] },
];

const rows: string[][] = []; // [actor, email/username, họ tên, vai trò, thuộc]

(async () => {
  await connectDb();
  await ensureSystemRoles();
  const pw = await hashPassword(env.SEED_PASSWORD);
  const role = async (key: string) => (await db.query<{ id: string }>('SELECT id FROM roles WHERE key = $1 AND hotel_id IS NULL', [key])).rows[0]!.id;

  // ADMIN: 3 tài khoản mỗi vai trò
  for (const [key, name] of ADMINS) {
    const rid = await role(key);
    for (let i = 1; i <= 3; i++) {
      const email = `${key.toLowerCase()}${i}@airrest.mo`;
      await db.query(
        `INSERT INTO accounts (type, email, password_hash, full_name, status, role_ids, admin_role) VALUES ('ADMIN', $1, $2, $3, 'ACTIVE', $4::uuid[], $5)
         ON CONFLICT (email) DO UPDATE SET role_ids = EXCLUDED.role_ids, admin_role = EXCLUDED.admin_role, updated_at = now()`, [email, pw, `${name} ${i}`, [rid], key]);
      rows.push(['ADMIN', email, `${name} ${i}`, key, 'Toàn hệ thống']);
    }
  }

  // HOTEL: mỗi khách sạn 1 chủ + 3 vai trò nhân viên (lễ tân, nhân viên đưa đón, kế toán KS); DRIVER: 2 tài xế (có xe)
  const owner = await role('hotel_owner');
  const driver = await role('hotel_driver');
  const STAFF = [
    ['letan', 'Lễ tân', 'reception', [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE]],
    ['dondua', 'NV đưa đón', 'frontdesk', [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.SHUTTLE_HANDLE]],
    ['phong', 'Quản lý phòng', 'room_manager', [PERM.BOOKING_READ, PERM.ROOM_MANAGE]],
  ] as const;
  for (const code of HOTELS) {
    const h = (await db.query<{ id: string; name: string }>('SELECT id, name FROM hotels WHERE code = $1', [code])).rows[0];
    if (!h) { console.error(`Bỏ qua ${code}: không có khách sạn`); continue; }
    const c = code.toLowerCase().replace('-', '');
    const where = `${h.name} (${code})`;
    const email = `chu.${c}@khachsan.mo`;
    await db.query(
      `INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner) VALUES ('HOTEL', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], true)
       ON CONFLICT (email) DO NOTHING`, [email, pw, `Chủ ${code}`, h.id, [owner]]);
    rows.push(['HOTEL', email, `Chủ ${code}`, 'hotel_owner (chủ khách sạn)', where]);
    for (const [slug, label, key, perms] of STAFF) {
      const rid = (await db.query<{ id: string }>(
        `INSERT INTO roles (key, name, scope, hotel_id, permissions, system) VALUES ($1, $2, 'HOTEL', $3, $4, true)
         ON CONFLICT (hotel_id, key) WHERE hotel_id IS NOT NULL DO UPDATE SET permissions = EXCLUDED.permissions RETURNING id`, [key, label, h.id, [...perms]])).rows[0]!.id;
      const em = `${slug}.${c}@khachsan.mo`;
      await db.query(
        `INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids) VALUES ('HOTEL', $1, $2, $3, 'ACTIVE', $4, $5::uuid[])
         ON CONFLICT (email) DO NOTHING`, [em, pw, `${label} ${code}`, h.id, [rid]]);
      rows.push(['HOTEL', em, `${label} ${code}`, `${key} (${label})`, where]);
    }
    for (let i = 1; i <= 2; i++) {
      const em = `taixe.${c}.${i}@airrest.vn`;
      const name = `Tài xế ${code} ${i}`;
      const acc = (await db.query<{ id: string }>(
        `INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner) VALUES ('DRIVER', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], false)
         ON CONFLICT (email) DO UPDATE SET hotel_id = EXCLUDED.hotel_id, role_ids = EXCLUDED.role_ids RETURNING id`, [em, pw, name, h.id, [driver]])).rows[0]!.id;
      await db.query(
        `INSERT INTO hotel_drivers (account_id, hotel_id, full_name, phone) VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id) DO UPDATE SET full_name = EXCLUDED.full_name, active = true, updated_at = now()`, [acc, h.id, name, `+84907${String(100000 + rows.length).slice(-6)}`]);
      rows.push(['DRIVER', em, name, 'hotel_driver (tài xế)', where]);
    }
  }

  // PAYER: đơn vị chi trả, trạm theo sân bay, mỗi trạm 2 nhân viên + 1 nhân viên cấp đơn vị (không gắn trạm)
  const payerRole = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = 'payer_staff' AND hotel_id IS NULL")).rows[0]!.id;
  const payerAcc = async (email: string, name: string, payerId: string, stationId: string | null) =>
    db.query(
      `INSERT INTO accounts (type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids) VALUES ('PAYER', $1, $2, $3, 'ACTIVE', $4, $5, $6::uuid[])
       ON CONFLICT (email) DO NOTHING`, [email, pw, name, payerId, stationId, [payerRole]]);
  for (const p of PAYERS) {
    const pid = (await db.query<{ id: string }>(
      `INSERT INTO payers (code, name, kind) VALUES ($1, $2, $3) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [p.code, p.name, p.kind])).rows[0]!.id;
    const pc = p.code.toLowerCase();
    await payerAcc(`dv.${pc}@chitra.mo`, `Quản lý ${p.code} (cấp đơn vị)`, pid, null);
    rows.push(['PAYER', `dv.${pc}@chitra.mo`, `Quản lý ${p.code} (cấp đơn vị)`, 'payer_staff', `${p.name}, mọi trạm`]);
    for (const [iata, sname] of p.stations) {
      const sid = (await db.query<{ id: string }>(
        `INSERT INTO payer_stations (payer_id, airport_iata, name) VALUES ($1, $2, $3) ON CONFLICT (payer_id, airport_iata) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [pid, iata, sname])).rows[0]!.id;
      for (let i = 1; i <= 2; i++) {
        const em = `nv${i}.${pc}.${iata.toLowerCase()}@chitra.mo`;
        await payerAcc(em, `NV ${p.code} ${iata} ${i}`, pid, sid);
        rows.push(['PAYER', em, `NV ${p.code} ${iata} ${i}`, 'payer_staff', `${p.name}, ${sname} (${iata})`]);
      }
    }
  }

  // PASSENGER: đăng nhập bằng username (không lưu SĐT/email, BR-002)
  for (let i = 1; i <= 10; i++) {
    const u = `khach${String(i).padStart(2, '0')}`;
    await db.query(
      `INSERT INTO accounts (type, username, password_hash, full_name, status, role_ids) VALUES ('PASSENGER', $1, $2, $3, 'ACTIVE', '{}'::uuid[]) ON CONFLICT DO NOTHING`, [u, pw, `Khách thử ${i}`]);
    rows.push(['PASSENGER', u, `Khách thử ${i}`, '(không có vai trò)', 'Khách vãng lai/tài khoản khách']);
  }

  await ensureBusinesses();
  await closeDb();
  console.log(JSON.stringify(rows));
})().catch((e) => { console.error(e); process.exit(1); });
