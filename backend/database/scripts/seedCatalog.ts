// Danh mục khách sạn mẫu quanh TOÀN BỘ sân bay thương mại Việt Nam (data/airports.ts): HAN/SGN giữ tên cũ, các sân bay khác sinh theo quy tắc, + tài khoản thử theo vai trò.
// Tính năng công khai (xe đưa đón, 24/24, theo giờ, gia đình) lưu bằng tag trong `amenities`, hủy miễn phí = policy FLEXIBLE: xem services/hotels/catalog.ts. Không đổi schema.
import { PERM } from '../../config/permissions';
import { hashPassword } from '../../lib/password';
import { db, json } from '../pg';
import { ensureSystemRoles } from '../../services/systemRoles';

import { AIRPORTS, type Airport } from '../../data/airports';

// Vị trí TỔNG HỢP: cách sân bay đúng `km` theo một góc cố định, không phải địa chỉ thật.
const offset = (c: Airport, km: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { lat: +(c.lat + (km * Math.cos(r)) / 111).toFixed(5), lng: +(c.lng + (km * Math.sin(r)) / (111 * Math.cos((c.lat * Math.PI) / 180))).toFixed(5) };
};
// HAN và SGN giữ danh sách tên cố định (dữ liệu mô phỏng cũ); các sân bay còn lại sinh tên theo quy tắc ở nameFor().
const FIXED: Record<string, string[]> = {
  HAN: ['Sao Mai Airport Hotel', 'Trăng Non Stay', 'Gió Đêm Inn', 'Hồng Hà Lodge', 'Cánh Cung Hotel', 'Lúa Vàng Stay', 'Mây Trắng Hostel', 'Bến Sông Hotel', 'Đồng Xanh Apartment', 'An Nhiên Inn', 'Phù Sa Hotel', 'Sen Hồ Stay', 'Bình Minh Capsule', 'Thanh Tâm Hotel', 'Nội Khu Lodge', 'Tre Xanh Stay', 'Sóng Biếc Hotel', 'Gạo Mới Hostel', 'Ngọc Lan Inn', 'Cầu Vồng Hotel'],
  SGN: ['Ánh Dương Airport Stay', 'Dừa Xiêm Hotel', 'Kênh Xanh Inn', 'Hoa Giấy Lodge', 'Nắng Sớm Hotel', 'Rạch Nhỏ Hostel', 'Sen Đất Stay', 'Bồ Câu Hotel', 'Lúa Nước Apartment', 'Cánh Én Inn', 'Vàm Cỏ Hotel', 'Trầu Cau Stay', 'Mộc Lan Capsule', 'Hạc Giấy Hotel'],
};
// Số cơ sở mô phỏng mỗi sân bay (các sân bay không liệt kê: 4).
const COUNT: Record<string, number> = { DAD: 14, CXR: 12, PQC: 12, HPH: 8, DLI: 8, VII: 6, HUI: 6, VCA: 6, VDO: 6, THD: 5, UIH: 5, VCL: 5, BMV: 5, VDH: 5, VCS: 3 };
const RESORT = new Set(['DAD', 'CXR', 'PQC', 'VDO', 'DLI', 'VCS']); // giá cao hơn
const TYPES = ['Khách sạn', 'Khách sạn', 'Nhà nghỉ', 'Căn hộ', 'Hộp ngủ', 'Phòng theo giờ'];
const ROOM_LABEL: Record<string, string> = { 'Khách sạn': 'Phòng đôi tiêu chuẩn', 'Nhà nghỉ': 'Phòng đôi', 'Căn hộ': 'Căn hộ 1 phòng ngủ', 'Hộp ngủ': 'Hộp ngủ đôi', 'Phòng theo giờ': 'Phòng đôi theo giờ' };
const PREFIX = ['Hoa Sữa', 'Bình An', 'Thiên Long', 'Hải Âu', 'Phượng Hoàng', 'Sao Biển', 'Ngọc Trai', 'Cánh Buồm', 'An Khang', 'Thịnh Vượng', 'Đại Dương', 'Ánh Trăng', 'Gió Núi', 'Sương Sớm', 'Hương Giang', 'Lúa Chín', 'Cà Phê', 'Thông Xanh', 'Mây Ngàn', 'Suối Mơ', 'Hồng Phúc', 'Kim Long', 'Tân Hoàng', 'Phù Đổng', 'Bạch Dương', 'Trường Sơn', 'Hạc Vàng', 'Sen Việt', 'Cỏ May', 'Mặt Trời', 'Lam Sơn', 'Thanh Bình', 'Minh Châu', 'Bảo An', 'Hải Đăng', 'Cát Trắng', 'San Hô', 'Tre Việt', 'Nam Phong', 'Bắc Đẩu'];
const SUFFIX: Record<string, string[]> = { 'Khách sạn': ['Hotel', 'Airport Hotel', 'Stay', 'Plaza'], 'Nhà nghỉ': ['Inn', 'Lodge', 'Guesthouse'], 'Căn hộ': ['Apartment', 'Residence', 'Suites'], 'Hộp ngủ': ['Capsule', 'Hostel', 'Pod'], 'Phòng theo giờ': ['Stay', 'Inn', 'Rest'] };

export type CatalogHotel = ReturnType<typeof buildCatalog>[number];
export function buildCatalog() {
  const used = new Set<string>(Object.values(FIXED).flat());
  return AIRPORTS.flatMap((ap, idx) => {
    const total = FIXED[ap.iata]?.length ?? COUNT[ap.iata] ?? 4;
    const base = ap.iata === 'HAN' ? 3 : ap.iata === 'SGN' ? 5 : 7 + idx * 11;
    return Array.from({ length: total }, (_, i) => {
      const n = base + i;
      // HAN/SGN giữ công thức cũ (chỉ 2 loại hình); các sân bay khác phân bổ đủ 5 loại hình.
      const type = TYPES[FIXED[ap.iata] ? (n * 3) % TYPES.length : (n * 5 + idx) % TYPES.length]!;
      let name = FIXED[ap.iata]?.[i];
      if (!name) {
        name = i === 0 ? `${ap.name} Airport Hotel` : '';
        const sx = SUFFIX[type]!;
        // Duyệt tổ hợp tiền tố × hậu tố; hết tổ hợp (hiếm) thì thêm số thứ tự để luôn kết thúc.
        for (let k = 0; !name || used.has(name); k++) name = k < PREFIX.length * sx.length ? `${PREFIX[(idx * 7 + i * 3 + k) % PREFIX.length]} ${sx[(idx + i + Math.floor(k / PREFIX.length)) % sx.length]}` : `${PREFIX[k % PREFIX.length]} ${sx[0]} ${k}`;
        used.add(name);
      }
      const minutes = 6 + ((n * 7) % 24);
      const km = Math.round((1 + minutes * 0.28) * 10) / 10;
      const reception24 = n % 3 !== 0;
      const shuttle = n % 4 === 0 ? 'SHUTTLE_FREE' : n % 4 === 1 ? 'SHUTTLE_PAID' : null;
      const amenities = ['HOT_WATER', 'WIFI', n % 2 ? 'LUGGAGE' : 'AIR_CON', ...(type === 'Căn hộ' ? ['KITCHENETTE'] : [])];
      if (shuttle) amenities.push(shuttle);
      if (reception24) amenities.push('24H_RECEPTION');
      if (type === 'Phòng theo giờ' || type === 'Hộp ngủ' || n % 7 === 0) amenities.push('HOURLY');
      if (n % 3 === 1) amenities.push('FAMILY_ROOM');
      const { lat, lng } = offset(ap, km, (n * 47) % 360);
      return {
        ap: ap.iata, airport: ap, code: `${ap.iata}-${String(i + 1).padStart(2, '0')}`, name, type, roomName: ROOM_LABEL[type]!, km, minutes, amenities,
        freeCancel: n % 2 === 0, closeExtHour: reception24 ? undefined : [22, 23, 24, 25, 26][n % 5]!, manual: n % 3 !== 1,
        rating: +(7 + ((n * 13) % 25) / 10).toFixed(1), price: Math.round(((320000 + ((n * 97) % 14) * 60000) * (RESORT.has(ap.iata) ? 1.3 : 1)) / 10000) * 10000,
        rooms: n % 11 === 0 ? 0 : 1 + (n % 4), capacity: type === 'Căn hộ' ? 4 : 2, family: n % 3 === 1, lat, lng,
      };
    });
  });
}

// Chạy lại nhiều lần an toàn (upsert theo mã khách sạn / email).
export async function seedCatalog(password: string): Promise<{ hotels: number }> {
  const catalog = buildCatalog();
  for (const h of catalog) {
    const policy = { cancellationTemplate: h.freeCancel ? 'FLEXIBLE' : 'NON_REFUNDABLE', cleaningBufferMin: 0, ...(h.closeExtHour !== undefined && { receptionCloseHour: h.closeExtHour }) };
    const hotel = (await db.query<{ id: string }>(
      `INSERT INTO hotels (code, name, status, location, airports, amenities, policy, approval, rating, address, description)
       VALUES ($1, $2, 'ACTIVE', $3::jsonb, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location, airports = EXCLUDED.airports, amenities = EXCLUDED.amenities,
         policy = EXCLUDED.policy, rating = EXCLUDED.rating, address = EXCLUDED.address, description = EXCLUDED.description, updated_at = now() RETURNING id`,
      [h.code, h.name, json({ type: 'Point', coordinates: [h.lng, h.lat] }), json([{ iata: h.ap, km: h.km, minutes: h.minutes }]), h.amenities, json(policy),
        json({ manual: h.manual }), json({ avg: h.rating, count: 12 + (h.minutes % 30) }),
        json({ line: `Khu vực quanh sân bay ${h.airport.name} (mô phỏng)`, city: h.airport.city, country: 'VN' }), `${h.type} cách sân bay ${h.airport.name} ${h.km} km. Thông tin mô phỏng phục vụ nghiên cứu.`],
    )).rows[0]!;
    const has = (await db.query("SELECT 1 FROM room_types WHERE hotel_id = $1 AND code = 'STD'", [hotel.id])).rowCount;
    if (!has) await db.query("INSERT INTO room_types (hotel_id, code, name, capacity, beds, area_m2, total_rooms, pricing, active) VALUES ($1, 'STD', $2, $3, 1, 22, $4, $5::jsonb, true)", [hotel.id, h.roomName, h.capacity, h.rooms, json({ baseNightVnd: h.price })]);
    const hasFam = (await db.query("SELECT 1 FROM room_types WHERE hotel_id = $1 AND code = 'FAM'", [hotel.id])).rowCount;
    if (h.family && !hasFam) await db.query("INSERT INTO room_types (hotel_id, code, name, capacity, beds, area_m2, total_rooms, pricing, active) VALUES ($1, 'FAM', 'Phòng gia đình', 4, 2, 36, $2, $3::jsonb, true)", [hotel.id, Math.max(1, h.rooms), json({ baseNightVnd: Math.round((h.price * 1.6) / 10000) * 10000 })]);
  }

  // Tài khoản thử theo vai trò (mật khẩu = SEED_PASSWORD): quản lý khách sạn HAN-01/SGN-01, nhân viên HAN-01 và 4 vai trò quản trị.
  await ensureSystemRoles();
  const role = async (key: string) => (await db.query<{ id: string }>('SELECT id FROM roles WHERE key = $1 AND hotel_id IS NULL', [key])).rows[0]!.id;
  const pw = await hashPassword(password);
  for (const [email, code, name] of [['ql.han01@khachsan.mo', 'HAN-01', 'Quản lý Sao Mai'], ['ql.sgn01@khachsan.mo', 'SGN-01', 'Quản lý Ánh Dương'], ['ql.dad01@khachsan.mo', 'DAD-01', 'Quản lý Đà Nẵng'], ['ql.cxr01@khachsan.mo', 'CXR-01', 'Quản lý Cam Ranh'], ['ql.pqc01@khachsan.mo', 'PQC-01', 'Quản lý Phú Quốc']] as const) {
    const hotelId = (await db.query<{ id: string }>('SELECT id FROM hotels WHERE code = $1', [code])).rows[0]!.id;
    await db.query(`INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner) VALUES ('HOTEL', $1, $2, $3, 'ACTIVE', $4, $5::uuid[], true) ON CONFLICT (email) DO NOTHING`, [email, pw, name, hotelId, [await role('hotel_owner')]]);
  }
  const han01 = (await db.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'HAN-01'")).rows[0]!.id;
  const staffRole = (await db.query<{ id: string }>(
    `INSERT INTO roles (key, name, scope, hotel_id, permissions, system) VALUES ('frontdesk', 'Nhân viên', 'HOTEL', $1, $2, true)
     ON CONFLICT (hotel_id, key) WHERE hotel_id IS NOT NULL DO UPDATE SET permissions = EXCLUDED.permissions RETURNING id`, [han01, [PERM.BOOKING_READ, PERM.BOOKING_CHECKIN, PERM.SHUTTLE_HANDLE]])).rows[0]!.id;
  await db.query(`INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids) VALUES ('HOTEL', 'nv.han01@khachsan.mo', $1, 'Nhân viên Sao Mai', 'ACTIVE', $2, $3::uuid[]) ON CONFLICT (email) DO NOTHING`, [pw, han01, [staffRole]]);
  for (const [email, adminRole, name] of [['quantri@airrest.mo', 'SYSADMIN', 'Quản trị hệ thống'], ['vanhanh@airrest.mo', 'OPS', 'Điều phối xe'], ['hotro@airrest.mo', 'SUPPORT', 'CSKH'], ['taichinh@airrest.mo', 'FINANCE', 'Kế toán']] as const) {
    await db.query(`INSERT INTO accounts (type, email, password_hash, full_name, status, role_ids, admin_role) VALUES ('ADMIN', $1, $2, $3, 'ACTIVE', $4::uuid[], $5) ON CONFLICT (email) DO NOTHING`, [email, pw, name, [await role(adminRole)], adminRole]);
  }
  return { hotels: catalog.length };
}
