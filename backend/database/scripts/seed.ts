import { env } from '../../config/env';
import { PERM } from '../../config/permissions';
import { runMigrations } from '../migrate';
import { closeDb, connectDb, db, json } from '../pg';
import { hashPassword } from '../../lib/password';
import { seedFlights } from '../../services/flights/flightSeed';
import { ensureSystemRoles } from '../../services/systemRoles';

// Dữ liệu mẫu để chạy thử API. Chạy lại nhiều lần an toàn (upsert theo khóa tự nhiên). Tự áp migration trước.
const HOTEL_ID = '65000000-0000-4000-8000-000000000001';

(async () => {
  await connectDb();
  await runMigrations();
  const pw = await hashPassword(env.SEED_PASSWORD);

  await db.query(
    `INSERT INTO hotels (id, code, name, status, location, airports, amenities, policy, approval, rating)
     VALUES ($1, 'HAN-DEMO-01', 'Khách sạn Demo Nội Bài', 'ACTIVE', $2::jsonb, $3::jsonb, $4, $5::jsonb, '{"manual":true}', '{"avg":4.5,"count":12}')
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, airports = EXCLUDED.airports, approval = EXCLUDED.approval, updated_at = now()`,
    [
      HOTEL_ID,
      json({ type: 'Point', coordinates: [105.8, 21.2] }),
      json([{ iata: 'HAN', km: 6.5, minutes: 14 }]),
      ['WIFI', 'SHUTTLE', '24H_RECEPTION'],
      json({ cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 }),
    ],
  );
  const hotel = (await db.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'HAN-DEMO-01'")).rows[0]!;

  const hasRoom = (await db.query("SELECT 1 FROM room_types WHERE hotel_id = $1 AND name = 'Phòng Deluxe'", [hotel.id])).rowCount;
  if (!hasRoom) {
    await db.query("INSERT INTO room_types (hotel_id, name, total_rooms, pricing, active) VALUES ($1, 'Phòng Deluxe', 3, $2::jsonb, true)", [hotel.id, json({ baseNightVnd: 600_000 })]);
  }

  // Vai trò = tập quyền. Truy cập chỉ dựa trên quyền.
  const reception = (
    await db.query<{ id: string }>(
      `INSERT INTO roles (key, name, scope, hotel_id, permissions, system) VALUES ('reception', 'Lễ tân', 'HOTEL', $1, $2, true)
       ON CONFLICT (hotel_id, key) WHERE hotel_id IS NOT NULL DO UPDATE SET permissions = EXCLUDED.permissions RETURNING id`,
      [hotel.id, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.BOOKING_DECIDE, PERM.REQUEST_HANDLE, PERM.SHUTTLE_HANDLE]],
    )
  ).rows[0]!;

  // Vai trò hệ thống (OPS/SUPPORT/FINANCE/SYSADMIN + chủ khách sạn): quyền luôn đồng bộ theo config/roles.ts.
  await ensureSystemRoles();
  const sysadmin = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = 'SYSADMIN' AND hotel_id IS NULL")).rows[0]!;

  await db.query(
    `INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids) VALUES ('HOTEL', 'letan@demo.airrest.vn', $1, 'Lễ tân Demo', 'ACTIVE', $2, $3::uuid[])
     ON CONFLICT (email) DO NOTHING`,
    [pw, hotel.id, [reception.id]],
  );
  // Admin demo luôn được đồng bộ về SYSADMIN (cả khi DB cũ đã có tài khoản này với vai trò cũ).
  await db.query(
    `INSERT INTO accounts (type, email, password_hash, full_name, status, role_ids, admin_role) VALUES ('ADMIN', 'admin@demo.airrest.vn', $1, 'Admin Demo', 'ACTIVE', $2::uuid[], 'SYSADMIN')
     ON CONFLICT (email) DO UPDATE SET role_ids = EXCLUDED.role_ids, admin_role = 'SYSADMIN', updated_at = now()`,
    [pw, [sysadmin.id]],
  );

  console.log(`Chuyến bay mô phỏng: chèn mới ${await seedFlights(db)}`);
  console.log(`Seed xong. Hotel ${hotel.id}, tài khoản: letan@demo.airrest.vn / admin@demo.airrest.vn (mật khẩu: SEED_PASSWORD)`);
  await closeDb();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
