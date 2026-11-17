import { env } from '../../config/env';
import { PERM } from '../../config/permissions';
import { runMigrations } from '../migrate';
import { closeDb, connectDb, db, json } from '../pg';
import { ensureBusinesses } from '../backfillBusinesses';
import { hashPassword } from '../../lib/password';
import { seedFlights } from '../../services/flights/flightSeed';
import { seedGeneratedFlights } from '../../services/flights/flightSeedGen';
import { seedActivity } from './seedActivity';
import { buildCatalog, seedCatalog } from './seedCatalog';
import { ensureSystemRoles } from '../../services/systemRoles';

// Dữ liệu mẫu để chạy thử API. Chạy lại nhiều lần an toàn (upsert theo khóa tự nhiên). Tự áp migration trước.
const HOTEL_ID = '65000000-0000-4000-8000-000000000001';

(async () => {
  await connectDb();
  await runMigrations();
  const pw = await hashPassword(env.SEED_PASSWORD);

  await db.query(
    `INSERT INTO hotels (id, code, name, slug, status, location, airports, amenities, policy, approval, rating, address, description, contact)
     VALUES ($1, 'HAN-DEMO-01', 'Khách sạn Demo Nội Bài', 'han-demo-01', 'ACTIVE', $2::jsonb, $3::jsonb, $4, $5::jsonb, '{"manual":true}', '{"avg":4.5,"count":12}', $6::jsonb, $7, $8::jsonb)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, airports = EXCLUDED.airports, approval = EXCLUDED.approval,
       address = EXCLUDED.address, description = EXCLUDED.description, contact = EXCLUDED.contact, updated_at = now()`,
    [
      HOTEL_ID,
      json({ type: 'Point', coordinates: [105.8, 21.2] }),
      json([{ iata: 'HAN', km: 6.5, minutes: 14 }]),
      ['WIFI', 'SHUTTLE', '24H_RECEPTION'],
      json({ cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0, checkInTime: '14:00', checkOutTime: '12:00', childPolicy: 'Trẻ dưới 6 tuổi ở chung giường, miễn phí.', petsAllowed: false }),
      json({ line: '1 Đường Sân Bay', ward: 'Xã Phú Minh', district: 'Sóc Sơn', city: 'Hà Nội', country: 'VN' }),
      'Khách sạn demo cách sân bay Nội Bài 6,5 km, có xe đưa đón và lễ tân 24/24.',
      json({ phone: '+84901000001', email: 'demo@khachsan.mo' }),
    ],
  );
  const hotel = (await db.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'HAN-DEMO-01'")).rows[0]!;

  const hasRoom = (await db.query("SELECT 1 FROM room_types WHERE hotel_id = $1 AND name = 'Phòng Deluxe'", [hotel.id])).rowCount;
  if (!hasRoom) {
    await db.query(
      `INSERT INTO room_types (hotel_id, code, name, capacity, beds, area_m2, total_rooms, pricing, active, bed_type, description, view, amenities, max_adults, max_children)
       VALUES ($1, 'DLX', 'Phòng Deluxe', 2, 1, 28, 3, $2::jsonb, true, 'DOUBLE', 'Phòng Deluxe 28 m², giường đôi, cửa sổ lớn.', 'Hướng sân bay', ARRAY['WIFI','AIR_CON','HOT_WATER','TV'], 2, 1)`,
      [hotel.id, json({ baseNightVnd: 600_000 })],
    );
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

  // Tài khoản hành khách mẫu (thay cho tài khoản demo trong prototype cũ): nguoidung / Demo@2026. Không ghi đè nếu đã tồn tại.
  await db.query(
    `INSERT INTO accounts (type, username, password_hash, full_name, status, role_ids) VALUES ('PASSENGER', 'nguoidung', $1, 'nguoidung', 'ACTIVE', '{}'::uuid[]) ON CONFLICT DO NOTHING`,
    [await hashPassword('Demo@2026')],
  );

  console.log(`Chuyến bay mô phỏng: chèn mới ${await seedFlights(db)}`);
  // Danh mục và chuyến bay sinh ra rất nhiều truy vấn (chậm khi DB ở xa như Supabase): đã có đủ thì bỏ qua, SEED_FORCE=1 để chạy lại.
  const have = Number((await db.query<{ n: string }>("SELECT count(*)::text AS n FROM hotels WHERE code ~ '^[A-Z]{3}-[0-9]{2}$'")).rows[0]!.n);
  if (have >= buildCatalog().length && !process.env.SEED_FORCE) console.log(`Danh mục khách sạn và chuyến bay sinh: đã có ${have} cơ sở, bỏ qua (SEED_FORCE=1 để chạy lại)`);
  else {
    console.log(`Danh mục khách sạn mẫu: ${(await seedCatalog(env.SEED_PASSWORD)).hotels} cơ sở + tài khoản thử theo vai trò`);
    console.log(`Chuyến bay sinh theo mạng đường bay (22 sân bay): chèn mới ${await seedGeneratedFlights(db)}`);
  }
  // Mã giảm giá mẫu + yêu thích cho khách nguoidung (không ghi đè nếu đã có).
  for (const [code, title, type, value, min] of [['WELCOME50', 'Giảm 50.000đ cho đơn đầu', 'AMOUNT', 50_000, 300_000], ['AIR10', 'Giảm 10% phòng gần sân bay', 'PERCENT', 10, 0]] as const) {
    await db.query(
      `INSERT INTO vouchers (code, title, description, discount_type, value, min_total_vnd, expires_at) VALUES ($1, $2, $2, $3, $4, $5, now() + interval '1 year') ON CONFLICT (upper(code)) DO NOTHING`,
      [code, title, type, value, min],
    );
  }
  await db.query(
    `INSERT INTO passenger_favorites (account_id, hotel_id) SELECT a.id, h.id FROM accounts a, hotels h WHERE a.username = 'nguoidung' AND h.code IN ('HAN-01', 'SGN-01') ON CONFLICT DO NOTHING`,
  );
  console.log(`Hoạt động mô phỏng: ${await seedActivity()}`);
  console.log(`Seed xong. Hotel ${hotel.id}, tài khoản: letan@demo.airrest.vn / admin@demo.airrest.vn (mật khẩu: SEED_PASSWORD)`);
  await ensureBusinesses();
  await closeDb();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
