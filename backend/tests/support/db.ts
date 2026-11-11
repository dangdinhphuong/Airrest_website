import { randomUUID } from 'node:crypto';
import { resetDatabaseForTest } from '../../database/migrate';
import { closeDb, connectDb, db, json } from '../../database/pg';
import { signAccountToken } from '../../lib/jwt';
import { hashPassword } from '../../lib/password';
import { ensureSystemRoles } from '../../services/systemRoles';

export { closeDb, db };

// Mỗi file test tích hợp bắt đầu bằng DB sạch + schema mới nhất (chỉ chạy được với DB local).
export async function freshDb(opts: { roles?: boolean } = {}): Promise<void> {
  await connectDb();
  await resetDatabaseForTest();
  if (opts.roles) await ensureSystemRoles();
}

export const one = async <T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> => (await db.query<T>(sql, params)).rows[0];
export const count = async (table: string, where = 'true', params: unknown[] = []): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, params)).rows[0]!.n;

export async function mkHotel(o: { code?: string; name?: string; manual?: boolean; status?: string } = {}): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO hotels (id, code, name, status, location, airports, amenities, policy, approval, rating)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'{}',$7::jsonb,$8::jsonb,'{"avg":0,"count":0}')`,
    [
      id, o.code ?? `T-${id.slice(0, 6)}`, o.name ?? 'KS Test', o.status ?? 'ACTIVE',
      json({ type: 'Point', coordinates: [105.8, 21.2] }), json([{ iata: 'HAN', km: 5, minutes: 10 }]),
      json({ cancellationTemplate: 'FLEXIBLE', cleaningBufferMin: 0 }), json({ manual: o.manual ?? false }),
    ],
  );
  return id;
}

export async function mkRoomType(hotelId: string, totalRooms: number, baseNightVnd = 600_000, o: { code?: string; name?: string; active?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await db.query('INSERT INTO room_types (id, hotel_id, name, code, total_rooms, pricing, active) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)', [
    id, hotelId, o.name ?? 'Deluxe', o.code ?? id.replace(/-/g, '').slice(0, 6).toUpperCase(), totalRooms, json({ baseNightVnd }), o.active ?? true,
  ]);
  return id;
}

export async function mkAccount(o: { type: 'HOTEL' | 'ADMIN'; email: string; password?: string; hotelId?: string; roleIds: string[]; adminRole?: string; status?: string }): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO accounts (id, type, email, password_hash, full_name, status, hotel_id, role_ids, admin_role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9)`,
    [id, o.type, o.email, await hashPassword(o.password ?? 'Pass12345678!'), o.email, o.status ?? 'ACTIVE', o.hotelId ?? null, o.roleIds, o.adminRole ?? null],
  );
  return id;
}

export const systemRoleId = async (key: string): Promise<string> => (await one<{ id: string }>('SELECT id FROM roles WHERE key = $1 AND hotel_id IS NULL', [key]))!.id;

// Tài khoản khách sạn có đúng các quyền cho trước (vai trò riêng của khách sạn) + token.
export async function mkStaff(hotelId: string, permissions: string[], email = `staff-${randomUUID().slice(0, 8)}@airrest.vn`): Promise<{ id: string; token: string }> {
  const roleId = randomUUID();
  await db.query("INSERT INTO roles (id, key, name, scope, hotel_id, permissions) VALUES ($1,$2,'Test','HOTEL',$3,$4::text[])", [roleId, `t-${roleId.slice(0, 8)}`, hotelId, permissions]);
  const id = await mkAccount({ type: 'HOTEL', email, hotelId, roleIds: [roleId] });
  return { id, token: signAccountToken({ sub: id, accountType: 'HOTEL' }) };
}

// Tài khoản Admin có đúng các quyền cho trước (vai trò hệ thống riêng) + token.
export async function mkAdmin(permissions: string[], email = `admin-${randomUUID().slice(0, 8)}@airrest.vn`): Promise<{ id: string; token: string }> {
  const roleId = randomUUID();
  await db.query("INSERT INTO roles (id, key, name, scope, permissions) VALUES ($1,$2,'Test','SYSTEM',$3::text[])", [roleId, `t-${roleId.slice(0, 8)}`, permissions]);
  const id = await mkAccount({ type: 'ADMIN', email, roleIds: [roleId] });
  return { id, token: signAccountToken({ sub: id, accountType: 'ADMIN' }) };
}
