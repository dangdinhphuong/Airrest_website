// Xe + tài xế MẪU cho một số khách sạn (chạy thủ công: npm run db:seed:fleet). Chạy lại nhiều lần an toàn (upsert theo email / biển số).
// Không seed đơn hay chuyến xe: người dùng tự đặt thử. Khách sạn KHÔNG có xe (thử luồng hết xe -> xe ngoài): xem NO_FLEET.
import { env } from '../../config/env';
import { hashPassword } from '../../lib/password';
import { closeDb, connectDb, db } from '../pg';
import { ensureBusinesses } from '../backfillBusinesses';
import { ensureSystemRoles } from '../../services/systemRoles';

// Số chỗ của từng xe; mỗi xe một tài xế. HAN-01 có đúng 2 xe 4 chỗ (đoàn 5 người -> điều 2 xe).
const FLEET: Record<string, number[]> = {
  'HAN-01': [4, 4], 'HAN-02': [4, 7, 16], 'SGN-01': [4, 7, 16], 'DAD-01': [4, 7, 16], 'CXR-01': [7, 16], 'PQC-01': [4, 7], 'HPH-01': [4, 7],
};
export const NO_FLEET = 'HAN-03'; // cố ý không có xe
const NAMES = ['Nguyễn Văn An', 'Trần Minh Bình', 'Lê Quốc Cường', 'Phạm Hữu Dũng', 'Hoàng Gia Hải'];

export async function seedFleet(password: string): Promise<{ hotels: number; vehicles: number }> {
  await ensureSystemRoles();
  const role = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = 'hotel_driver' AND hotel_id IS NULL")).rows[0]!.id;
  const pw = await hashPassword(password);
  let vehicles = 0, p = 0;
  // Mọi khách sạn đã có tiện ích đưa đón (SHUTTLE*) mà chưa nêu ở FLEET cũng có 2 xe mẫu (4 và 7 chỗ) để hệ thống tự điều xe được; NO_FLEET vẫn không có.
  const withShuttle = (await db.query<{ code: string }>("SELECT code FROM hotels WHERE amenities && ARRAY['SHUTTLE','SHUTTLE_FREE','SHUTTLE_PAID'] AND code <> $1 ORDER BY code", [NO_FLEET])).rows.map((r) => r.code);
  const all: Record<string, number[]> = { ...Object.fromEntries(withShuttle.map((c) => [c, [4, 7]])), ...FLEET };
  for (const [code, seats] of Object.entries(all)) {
    const hotelId = (await db.query<{ id: string }>('SELECT id FROM hotels WHERE code = $1', [code])).rows[0]?.id;
    if (!hotelId) throw new Error(`Thiếu khách sạn ${code}: chạy npm run db:seed trước`);
    // Có xe thì phải có tiện ích đưa đón (hotelFeatures đọc tag trong amenities); giữ tag sẵn có nếu đã có.
    await db.query("UPDATE hotels SET amenities = array_append(amenities, 'SHUTTLE_PAID') WHERE id = $1 AND NOT amenities && ARRAY['SHUTTLE','SHUTTLE_FREE','SHUTTLE_PAID']", [hotelId]);
    for (const [i, s] of seats.entries()) {
      const email = `taixe.${code.toLowerCase().replace(/-/g, '')}.${i + 1}@airrest.vn`; // khớp seedAccounts (han01) và TAI_KHOAN_THU.md
      const name = `Mẫu ${NAMES[(p + i) % NAMES.length]}`; // "Mẫu" đứng đầu để chữ cái đại diện (từ cuối tên) vẫn là chữ thật
      const phone = `+8490700${String(100 + p)}`; // SĐT mẫu, tránh đầu +84900 (dấu hiệu khách mẫu của seedActivity)
      const acc = (await db.query<{ id: string }>(
        `INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner) VALUES ('DRIVER', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], false)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, hotel_id = EXCLUDED.hotel_id, role_ids = EXCLUDED.role_ids RETURNING id`, [email, pw, name, hotelId, [role]])).rows[0]!.id;
      await db.query(
        `INSERT INTO hotel_drivers (account_id, hotel_id, full_name, phone) VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, active = true, updated_at = now()`, [acc, hotelId, name, phone]);
      await db.query(
        `INSERT INTO vehicles (hotel_id, plate, seats, model, active, driver_account_id) VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (hotel_id, plate) DO UPDATE SET seats = EXCLUDED.seats, model = EXCLUDED.model, active = true, driver_account_id = EXCLUDED.driver_account_id, updated_at = now()`,
        [hotelId, `29A-${90000 + p}`, s, `Xe mẫu ${s} chỗ`, acc]);
      vehicles++; p++;
    }
  }
  // Quản lý khách sạn không xe, để thử luồng hết xe qua giao diện (cùng mật khẩu SEED_PASSWORD).
  const noFleetId = (await db.query<{ id: string }>('SELECT id FROM hotels WHERE code = $1', [NO_FLEET])).rows[0]!.id;
  const ownerRole = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = 'hotel_owner' AND hotel_id IS NULL")).rows[0]!.id;
  await db.query(`INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner) VALUES ('HOTEL', 'ql.han03@khachsan.mo', $1, 'Quản lý HAN-03 (không xe)', 'ACTIVE', $2, $3::uuid[], true) ON CONFLICT (email) DO NOTHING`, [pw, noFleetId, [ownerRole]]);
  return { hotels: Object.keys(all).length, vehicles };
}

if (process.argv[1]?.endsWith('seedFleet.ts')) {
  (async () => {
    await connectDb();
    const r = await seedFleet(env.SEED_PASSWORD);
    console.log(`Xe mẫu: ${r.vehicles} xe + ${r.vehicles} tài xế ở ${r.hotels} khách sạn (mật khẩu tài xế = SEED_PASSWORD); ${NO_FLEET} cố ý không có xe`);
    await ensureBusinesses();
    await closeDb();
  })().catch((e) => { console.error(e); process.exit(1); });
}
