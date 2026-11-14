import type { DriverCreateBody, DriverPatchBody, VehicleCreateBody, VehiclePatchBody } from '@airrest/validation';
import { db, withTransaction, type Db } from '../../database/pg';
import { AppError, duplicateConstraint, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { hashPassword } from '../../lib/password';
import { publicUrl } from '../../lib/storage';
import { actorOf, writeAudit } from '../audit';
import { forgetAuth } from '../authz';
import { BUSY_STATUSES } from '../shuttle/dispatch';

// Quản lý đội xe luôn khóa theo khách sạn trong token (kể cả admin có hotel:scope:all: phải gắn khách sạn mới tạo/sửa được).
const hotelOf = (auth: AuthContext): string => {
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return auth.hotelId;
};
const photoUrl = (key?: string): string | null => (key ? (publicUrl(key) ?? null) : null);
const busy = [...BUSY_STATUSES];

const VEHICLE_SQL = `SELECT v.*, d.full_name AS driver_name, d.phone AS driver_phone, d.photo_key AS driver_photo_key, d.active AS driver_active
  FROM vehicles v LEFT JOIN hotel_drivers d ON d.account_id = v.driver_account_id`;
const vehicleView = (v: any) => ({
  id: v.id, plate: v.plate, seats: v.seats, model: v.model ?? null, active: v.active,
  driver: v.driverAccountId ? { accountId: v.driverAccountId, name: v.driverName, phone: v.driverPhone, photoKey: v.driverPhotoKey ?? null, photoUrl: photoUrl(v.driverPhotoKey), active: v.driverActive } : null,
});
const DRIVER_SQL = `SELECT d.*, a.email, a.status AS account_status, (SELECT v.id FROM vehicles v WHERE v.driver_account_id = d.account_id) AS vehicle_id
  FROM hotel_drivers d JOIN accounts a ON a.id = d.account_id`;
const driverView = (d: any) => ({
  accountId: d.accountId, email: d.email, fullName: d.fullName, phone: d.phone, photoKey: d.photoKey ?? null, photoUrl: photoUrl(d.photoKey), active: d.active, vehicleId: d.vehicleId ?? null,
});

const getVehicle = async (tx: Db, hotelId: string, id: string) => {
  const v = (await tx.query<any>(`${VEHICLE_SQL} WHERE v.id = $1 AND v.hotel_id = $2`, [id, hotelId])).rows[0];
  if (!v) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Không tìm thấy xe');
  return v;
};
const getDriver = async (tx: Db, hotelId: string, id: string) => {
  const d = (await tx.query<any>(`${DRIVER_SQL} WHERE d.account_id = $1 AND d.hotel_id = $2`, [id, hotelId])).rows[0];
  if (!d) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Không tìm thấy tài xế');
  return d;
};
const dupe = (e: unknown): never => {
  if (isDuplicateKey(e)) {
    const c = duplicateConstraint(e);
    if (c === 'vehicles_hotel_plate') throw new AppError(409, 'PLATE_TAKEN', 'Biển số đã có trong khách sạn');
    if (c === 'vehicles_driver') throw new AppError(409, 'DRIVER_ALREADY_ASSIGNED', 'Tài xế đã được gán cho xe khác');
    if (c === 'accounts_email') throw new AppError(409, 'EMAIL_TAKEN', 'Email đã được sử dụng');
  }
  throw e;
};
const vehicleBusy = async (tx: Db, vehicleId: string) => (await tx.query('SELECT 1 FROM shuttle_trips WHERE vehicle_id = $1 AND status = ANY($2::text[]) LIMIT 1', [vehicleId, busy])).rowCount > 0;
const driverBusy = async (tx: Db, accountId: string) => (await tx.query('SELECT 1 FROM shuttle_trips WHERE driver_account_id = $1 AND status = ANY($2::text[]) LIMIT 1', [accountId, busy])).rowCount > 0;

// ---------- Xe ----------
export async function listVehicles(auth: AuthContext, q: { active?: boolean }) {
  const rows = (await db.query<any>(`${VEHICLE_SQL} WHERE v.hotel_id = $1 AND ($2::boolean IS NULL OR v.active = $2) ORDER BY v.seq`, [hotelOf(auth), q.active ?? null])).rows;
  return { items: rows.map(vehicleView) };
}

// Gán tài xế cho xe: tài xế phải thuộc khách sạn này (khác -> 404).
async function assertDriverInHotel(tx: Db, hotelId: string, driverId: string) {
  if (!(await tx.query('SELECT 1 FROM hotel_drivers WHERE account_id = $1 AND hotel_id = $2', [driverId, hotelId])).rowCount) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Không tìm thấy tài xế');
}

export async function createVehicle(auth: AuthContext, i: VehicleCreateBody, requestId?: string) {
  const hotelId = hotelOf(auth);
  try {
    return await withTransaction(async (tx) => {
      if (i.driverId) await assertDriverInHotel(tx, hotelId, i.driverId);
      const id = (await tx.query<{ id: string }>('INSERT INTO vehicles (hotel_id, plate, seats, model, active, driver_account_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [hotelId, i.plate, i.seats, i.model || null, i.active, i.driverId ?? null])).rows[0]!.id;
      await writeAudit({ actor: actorOf(auth), action: 'VEHICLE.CREATE', entity: { type: 'vehicle', id }, hotelId, after: { plate: i.plate, seats: i.seats, driverId: i.driverId }, requestId }, tx);
      return { vehicle: vehicleView(await getVehicle(tx, hotelId, id)) };
    });
  } catch (e) {
    return dupe(e);
  }
}

export async function patchVehicle(auth: AuthContext, id: string, i: VehiclePatchBody, requestId?: string) {
  const hotelId = hotelOf(auth);
  try {
    return await withTransaction(async (tx) => {
      const cur = (await tx.query<any>('SELECT * FROM vehicles WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [id, hotelId])).rows[0];
      if (!cur) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Không tìm thấy xe');
      const driverChanges = i.driverId !== undefined && (i.driverId ?? undefined) !== cur.driverAccountId;
      if ((driverChanges || i.active === false) && (await vehicleBusy(tx, id))) throw new AppError(409, 'VEHICLE_IN_USE', 'Xe đang có chuyến chưa hoàn tất');
      if (i.seats !== undefined && (await tx.query('SELECT 1 FROM shuttle_trips WHERE vehicle_id = $1 AND status = ANY($2::text[]) AND seats > $3 LIMIT 1', [id, busy, i.seats])).rowCount) throw new AppError(409, 'VEHICLE_IN_USE', 'Có chuyến chưa hoàn tất chở nhiều khách hơn số chỗ mới');
      if (i.driverId) await assertDriverInHotel(tx, hotelId, i.driverId);
      await tx.query(
        `UPDATE vehicles SET plate = $2, seats = $3, model = $4, active = $5, driver_account_id = $6, updated_at = now() WHERE id = $1`,
        [id, i.plate ?? cur.plate, i.seats ?? cur.seats, i.model === undefined ? (cur.model ?? null) : i.model || null, i.active ?? cur.active, i.driverId === undefined ? (cur.driverAccountId ?? null) : i.driverId],
      );
      await writeAudit({ actor: actorOf(auth), action: 'VEHICLE.UPDATE', entity: { type: 'vehicle', id }, hotelId, before: { plate: cur.plate, seats: cur.seats, active: cur.active, driverId: cur.driverAccountId }, after: i, requestId }, tx);
      return { vehicle: vehicleView(await getVehicle(tx, hotelId, id)) };
    });
  } catch (e) {
    return dupe(e);
  }
}

/** Có chuyến đang chạy -> 409; đã từng có chuyến -> ngừng hoạt động (giữ lịch sử); chưa từng -> xóa hẳn. */
export async function deleteVehicle(auth: AuthContext, id: string, requestId?: string) {
  const hotelId = hotelOf(auth);
  return withTransaction(async (tx) => {
    await getVehicle(tx, hotelId, id);
    await tx.query('SELECT 1 FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
    if (await vehicleBusy(tx, id)) throw new AppError(409, 'VEHICLE_IN_USE', 'Xe đang có chuyến chưa hoàn tất');
    const used = (await tx.query('SELECT 1 FROM shuttle_trips WHERE vehicle_id = $1 LIMIT 1', [id])).rowCount > 0;
    if (used) await tx.query('UPDATE vehicles SET active = false, updated_at = now() WHERE id = $1', [id]);
    else await tx.query('DELETE FROM vehicles WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(auth), action: used ? 'VEHICLE.DEACTIVATE' : 'VEHICLE.DELETE', entity: { type: 'vehicle', id }, hotelId, requestId }, tx);
    return { deleted: !used, deactivated: used };
  });
}

// ---------- Tài xế ----------
export async function listDrivers(auth: AuthContext, q: { active?: boolean }) {
  const rows = (await db.query<any>(`${DRIVER_SQL} WHERE d.hotel_id = $1 AND ($2::boolean IS NULL OR d.active = $2) ORDER BY d.created_at`, [hotelOf(auth), q.active ?? null])).rows;
  return { items: rows.map(driverView) };
}

// Gán/bỏ gán xe cho tài xế (một tài xế một xe; xe đã có tài xế khác -> 409). `vehicleId` null = bỏ gán.
async function assignVehicle(tx: Db, hotelId: string, accountId: string, vehicleId: string | null) {
  await tx.query('UPDATE vehicles SET driver_account_id = NULL, updated_at = now() WHERE driver_account_id = $1 AND ($2::uuid IS NULL OR id <> $2)', [accountId, vehicleId]);
  if (!vehicleId) return;
  const v = (await tx.query<{ driverAccountId?: string }>('SELECT driver_account_id FROM vehicles WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [vehicleId, hotelId])).rows[0];
  if (!v) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Không tìm thấy xe');
  if (v.driverAccountId && v.driverAccountId !== accountId) throw new AppError(409, 'VEHICLE_HAS_DRIVER', 'Xe đã có tài xế khác');
  await tx.query('UPDATE vehicles SET driver_account_id = $2, updated_at = now() WHERE id = $1', [vehicleId, accountId]);
}

/** Tạo tài xế = tài khoản DRIVER (email + mật khẩu ban đầu do quản lý đặt, băm scrypt, không trả lại) + hồ sơ + gán xe (tùy chọn). */
export async function createDriver(auth: AuthContext, i: DriverCreateBody, requestId?: string) {
  const hotelId = hotelOf(auth);
  const passwordHash = await hashPassword(i.password);
  try {
    const out = await withTransaction(async (tx) => {
      const role = (await tx.query<{ id: string }>("SELECT id FROM roles WHERE key = 'hotel_driver' AND hotel_id IS NULL")).rows[0];
      if (!role) throw new AppError(503, 'ROLE_NOT_SEEDED', 'Chưa có vai trò hotel_driver (chạy migrate/seed)');
      const id = (
        await tx.query<{ id: string }>(
          "INSERT INTO accounts (type, email, password_hash, full_name, status, hotel_id, role_ids, is_owner, created_by) VALUES ('DRIVER',$1,$2,$3,'ACTIVE',$4,ARRAY[$5]::uuid[],false,$6) RETURNING id",
          [i.email, passwordHash, i.fullName, hotelId, role.id, auth.sub],
        )
      ).rows[0]!.id;
      await tx.query('INSERT INTO hotel_drivers (account_id, hotel_id, full_name, phone, photo_key) VALUES ($1,$2,$3,$4,$5)', [id, hotelId, i.fullName, i.phone, i.photoKey ?? null]);
      await assignVehicle(tx, hotelId, id, i.vehicleId ?? null);
      await writeAudit({ actor: actorOf(auth), action: 'DRIVER.CREATE', entity: { type: 'driver', id }, hotelId, after: { email: i.email, fullName: i.fullName, vehicleId: i.vehicleId }, requestId }, tx);
      return { driver: driverView(await getDriver(tx, hotelId, id)) };
    });
    return out;
  } catch (e) {
    return dupe(e);
  }
}

export async function patchDriver(auth: AuthContext, id: string, i: DriverPatchBody, requestId?: string) {
  const hotelId = hotelOf(auth);
  const passwordHash = i.password ? await hashPassword(i.password) : undefined;
  try {
    const out = await withTransaction(async (tx) => {
      const cur = await getDriver(tx, hotelId, id);
      await tx.query('SELECT 1 FROM hotel_drivers WHERE account_id = $1 FOR UPDATE', [id]);
      const vehicleChanges = i.vehicleId !== undefined && (i.vehicleId ?? undefined) !== (cur.vehicleId ?? undefined);
      if ((vehicleChanges || i.active === false) && (await driverBusy(tx, id))) throw new AppError(409, 'DRIVER_IN_USE', 'Tài xế đang có chuyến chưa hoàn tất');
      await tx.query(
        'UPDATE hotel_drivers SET full_name = $2, phone = $3, photo_key = $4, active = $5, updated_at = now() WHERE account_id = $1',
        [id, i.fullName ?? cur.fullName, i.phone ?? cur.phone, i.photoKey === undefined ? (cur.photoKey ?? null) : i.photoKey, i.active ?? cur.active],
      );
      await tx.query(
        'UPDATE accounts SET full_name = $2, status = $3, password_hash = coalesce($4, password_hash), updated_at = now() WHERE id = $1',
        [id, i.fullName ?? cur.fullName, (i.active ?? cur.active) ? 'ACTIVE' : 'LOCKED', passwordHash ?? null],
      );
      if (i.vehicleId !== undefined) await assignVehicle(tx, hotelId, id, i.vehicleId);
      const { password: _p, ...logged } = i; // không ghi mật khẩu vào audit
      await writeAudit({ actor: actorOf(auth), action: 'DRIVER.UPDATE', entity: { type: 'driver', id }, hotelId, after: { ...logged, ...(i.password && { passwordChanged: true }) }, requestId }, tx);
      return { driver: driverView(await getDriver(tx, hotelId, id)) };
    });
    forgetAuth(id);
    return out;
  } catch (e) {
    return dupe(e);
  }
}

/** Có chuyến đang chạy -> 409; đã từng có chuyến -> khóa tài khoản + ngừng hoạt động (giữ lịch sử); chưa từng -> xóa hẳn tài khoản. */
export async function deleteDriver(auth: AuthContext, id: string, requestId?: string) {
  const hotelId = hotelOf(auth);
  const out = await withTransaction(async (tx) => {
    await getDriver(tx, hotelId, id);
    await tx.query('SELECT 1 FROM hotel_drivers WHERE account_id = $1 FOR UPDATE', [id]);
    if (await driverBusy(tx, id)) throw new AppError(409, 'DRIVER_IN_USE', 'Tài xế đang có chuyến chưa hoàn tất');
    const used = (await tx.query('SELECT 1 FROM shuttle_trips WHERE driver_account_id = $1 LIMIT 1', [id])).rowCount > 0;
    await assignVehicle(tx, hotelId, id, null);
    if (used) {
      await tx.query('UPDATE hotel_drivers SET active = false, updated_at = now() WHERE account_id = $1', [id]);
      await tx.query("UPDATE accounts SET status = 'LOCKED', updated_at = now() WHERE id = $1", [id]);
    } else {
      await tx.query('DELETE FROM accounts WHERE id = $1', [id]); // hotel_drivers xóa theo (ON DELETE CASCADE)
    }
    await writeAudit({ actor: actorOf(auth), action: used ? 'DRIVER.DEACTIVATE' : 'DRIVER.DELETE', entity: { type: 'driver', id }, hotelId, requestId }, tx);
    return { deleted: !used, deactivated: used };
  });
  forgetAuth(id);
  return out;
}
