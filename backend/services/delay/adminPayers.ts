import { randomUUID } from 'node:crypto';
import type { PayerCreateBody, PayerHotelRateBody, PayerStationCreateBody } from '@airrest/validation';
import { AIRPORTS } from '../../data/airports';
import { db, json, jsonOrNull, withTransaction, type Db } from '../../database/pg';
import { AppError, duplicateConstraint, isDuplicateKey } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { forgetAuth } from '../authz';
import { PAYER_STAFF_ROLE } from '../../config/roles';

// Quản trị đơn vị chi trả (onboarding): đơn vị, trạm, giá hợp đồng, khóa API, nhân viên. Chỉ admin hệ thống gọi (quyền kiểm ở router).
export type Ctx = { auth: AuthContext; requestId: string };
const audit = (c: Ctx, tx: Db, action: string, type: string, id: string, before?: unknown, after?: unknown) =>
  writeAudit({ actor: actorOf(c.auth), action, entity: { type, id }, before, after, requestId: c.requestId }, tx);
const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `Không tìm thấy ${what}`);

async function lockPayer(tx: Db, id: string): Promise<Record<string, any>> {
  const p = (await tx.query('SELECT * FROM payers WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!p) throw notFound('đơn vị chi trả');
  return p;
}
const payerExists = async (id: string) => {
  if (!(await db.query('SELECT 1 FROM payers WHERE id = $1', [id])).rows[0]) throw notFound('đơn vị chi trả');
};

// ---------- Đơn vị ----------
export const listPayers = async (q: { status?: string; limit: number; after?: number }) => {
  const rows = (await db.query('SELECT * FROM payers WHERE ($1::text IS NULL OR status = $1) AND ($2::bigint IS NULL OR seq < $2) ORDER BY seq DESC LIMIT $3', [q.status ?? null, q.after ?? null, q.limit + 1])).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1].seq : null };
};
export const getPayer = async (id: string) => (await db.query('SELECT * FROM payers WHERE id = $1', [id])).rows[0] ?? Promise.reject(notFound('đơn vị chi trả'));

export async function createPayer(c: Ctx, b: PayerCreateBody) {
  try {
    return await withTransaction(async (tx) => {
      const p = (await tx.query('INSERT INTO payers (code, name, kind, contact, shared_room_policy, allow_upgrade) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *', [b.code, b.name, b.kind, jsonOrNull(b.contact), b.sharedRoomPolicy, b.allowUpgrade])).rows[0];
      await audit(c, tx, 'PAYER.CREATE', 'payer', p.id, undefined, { code: b.code, name: b.name, kind: b.kind });
      return p;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'PAYER_CODE_EXISTS', 'Mã đơn vị chi trả đã tồn tại');
    throw e;
  }
}

export type PayerPatch = { name?: string; kind?: string; status?: string; contact?: object; sharedRoomPolicy?: string; allowUpgrade?: boolean };
export async function patchPayer(c: Ctx, id: string, p: PayerPatch) {
  return withTransaction(async (tx) => {
    const before = await lockPayer(tx, id);
    const next = (
      await tx.query(
        `UPDATE payers SET name = COALESCE($2, name), kind = COALESCE($3, kind), status = COALESCE($4, status), contact = COALESCE($5::jsonb, contact),
           shared_room_policy = COALESCE($6, shared_room_policy), allow_upgrade = COALESCE($7, allow_upgrade), updated_at = now() WHERE id = $1 RETURNING *`,
        [id, p.name ?? null, p.kind ?? null, p.status ?? null, jsonOrNull(p.contact), p.sharedRoomPolicy ?? null, p.allowUpgrade ?? null],
      )
    ).rows[0];
    await audit(c, tx, 'PAYER.UPDATE', 'payer', id, { name: before.name, kind: before.kind, status: before.status, contact: before.contact, sharedRoomPolicy: before.sharedRoomPolicy, allowUpgrade: before.allowUpgrade }, p);
    if (p.status && p.status !== before.status) {
      // Xóa cache quyền để nhân viên bị chặn/mở ngay trên bản API này.
      for (const a of (await tx.query<{ id: string }>('SELECT id FROM accounts WHERE payer_id = $1', [id])).rows) forgetAuth(a.id);
    }
    return next;
  });
}

// ---------- Trạm ----------
export const listStations = async (payerId: string) => (await payerExists(payerId), (await db.query('SELECT * FROM payer_stations WHERE payer_id = $1 ORDER BY airport_iata', [payerId])).rows);

export async function createStation(c: Ctx, payerId: string, b: PayerStationCreateBody) {
  if (!AIRPORTS.some((a) => a.iata === b.airportIata)) throw new AppError(422, 'AIRPORT_UNKNOWN', 'Sân bay không có trong danh sách');
  try {
    return await withTransaction(async (tx) => {
      await lockPayer(tx, payerId);
      const s = (await tx.query('INSERT INTO payer_stations (payer_id, airport_iata, name, active) VALUES ($1,$2,$3,$4) RETURNING *', [payerId, b.airportIata, b.name, b.active])).rows[0];
      await audit(c, tx, 'PAYER_STATION.CREATE', 'payer_station', s.id, undefined, { payerId, airportIata: b.airportIata, name: b.name, active: b.active });
      return s;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'STATION_EXISTS', 'Đơn vị đã có trạm ở sân bay này');
    throw e;
  }
}

export async function patchStation(c: Ctx, payerId: string, stationId: string, p: { name?: string; active?: boolean }) {
  return withTransaction(async (tx) => {
    const before = (await tx.query('SELECT * FROM payer_stations WHERE id = $1 AND payer_id = $2 FOR UPDATE', [stationId, payerId])).rows[0];
    if (!before) throw notFound('trạm');
    const next = (await tx.query('UPDATE payer_stations SET name = COALESCE($2, name), active = COALESCE($3, active), updated_at = now() WHERE id = $1 RETURNING *', [stationId, p.name ?? null, p.active ?? null])).rows[0];
    await audit(c, tx, 'PAYER_STATION.UPDATE', 'payer_station', stationId, { name: before.name, active: before.active }, p);
    return next;
  });
}

// ---------- Giá hợp đồng ----------
export const listRates = async (payerId: string, hotelId?: string) =>
  (await payerExists(payerId), (await db.query('SELECT * FROM payer_hotel_rates WHERE payer_id = $1 AND ($2::uuid IS NULL OR hotel_id = $2) ORDER BY hotel_id, room_type_id, valid_from', [payerId, hotelId ?? null])).rows);

function checkRateShape(b: PayerHotelRateBody): void {
  const bad = (m: string) => new AppError(422, 'RATE_INVALID', m);
  if (b.nightRateVnd <= 0) throw bad('Giá đêm phải lớn hơn 0');
  let prev = 0;
  for (const t of b.hourlyRates) {
    if (t.priceVnd <= 0) throw bad('Giá theo giờ phải lớn hơn 0');
    if (t.priceVnd > b.nightRateVnd) throw bad('Giá theo giờ không được vượt giá đêm');
    if (t.hours <= prev) throw bad('Các bậc giờ phải tăng dần, không trùng');
    prev = t.hours;
  }
}

// PUT = tạo mới hoặc cập nhật theo (payer, room_type, valid_from). Giá hợp đồng tính bằng VND; commission_pct là % trên giá hợp đồng.
export async function putRate(c: Ctx, payerId: string, b: PayerHotelRateBody) {
  checkRateShape(b);
  return withTransaction(async (tx) => {
    await lockPayer(tx, payerId); // tuần tự hóa các thay đổi giá của cùng đơn vị để kiểm tra chồng hiệu lực không bị race
    if (!(await tx.query("SELECT 1 FROM hotels WHERE id = $1 AND status = 'ACTIVE'", [b.hotelId])).rows[0]) throw new AppError(422, 'HOTEL_NOT_ACTIVE', 'Khách sạn không tồn tại hoặc chưa hoạt động');
    if (!(await tx.query('SELECT 1 FROM room_types WHERE id = $1 AND hotel_id = $2', [b.roomTypeId, b.hotelId])).rows[0]) throw new AppError(422, 'ROOM_TYPE_MISMATCH', 'Loại phòng không thuộc khách sạn này');
    const before = (await tx.query('SELECT * FROM payer_hotel_rates WHERE payer_id = $1 AND room_type_id = $2 AND valid_from = $3', [payerId, b.roomTypeId, b.validFrom])).rows[0];
    if (before && before.hotelId !== b.hotelId) throw new AppError(422, 'ROOM_TYPE_MISMATCH', 'Loại phòng không thuộc khách sạn này');
    if (b.active) {
      const clash = (
        await tx.query(
          `SELECT valid_from, valid_to FROM payer_hotel_rates WHERE payer_id = $1 AND room_type_id = $2 AND active AND valid_from <> $3
             AND daterange(valid_from, valid_to, '[]') && daterange($3::date, $4::date, '[]') LIMIT 1`,
          [payerId, b.roomTypeId, b.validFrom, b.validTo ?? null],
        )
      ).rows[0];
      if (clash) throw new AppError(409, 'RATE_OVERLAP', 'Khoảng hiệu lực chồng lên một giá hợp đồng đang hoạt động của cùng loại phòng');
    }
    const row = (
      await tx.query(
        `INSERT INTO payer_hotel_rates (payer_id, hotel_id, room_type_id, night_rate_vnd, hourly_rates, commission_pct, valid_from, valid_to, active)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         ON CONFLICT (payer_id, room_type_id, valid_from) DO UPDATE SET night_rate_vnd = EXCLUDED.night_rate_vnd, hourly_rates = EXCLUDED.hourly_rates,
           commission_pct = EXCLUDED.commission_pct, valid_to = EXCLUDED.valid_to, active = EXCLUDED.active, updated_at = now() RETURNING *`,
        [payerId, b.hotelId, b.roomTypeId, b.nightRateVnd, json(b.hourlyRates), b.commissionPct, b.validFrom, b.validTo ?? null, b.active],
      )
    ).rows[0];
    await audit(c, tx, before ? 'PAYER_RATE.UPDATE' : 'PAYER_RATE.CREATE', 'payer_hotel_rate', row.id, before, b);
    return { rate: row, created: !before };
  });
}

// ---------- Khóa API (khóa thô do issuePayerKey trả, router chỉ chuyển tiếp một lần) ----------
export const listKeys = async (payerId: string) =>
  (await payerExists(payerId), (await db.query('SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM payer_api_keys WHERE payer_id = $1 ORDER BY created_at DESC', [payerId])).rows);

export async function revokeKey(c: Ctx, payerId: string, keyId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const r = await tx.query('UPDATE payer_api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND payer_id = $2 RETURNING id', [keyId, payerId]);
    if (!r.rows[0]) throw notFound('khóa API');
    await audit(c, tx, 'PAYER_KEY.REVOKE', 'payer_api_key', keyId, undefined, { payerId });
  });
}

// ---------- Nhân viên ----------
const STAFF_COLS = 'id, email, full_name, status, payer_id, payer_station_id, created_at, updated_at';
export const listStaff = async (payerId: string) => (await payerExists(payerId), (await db.query(`SELECT ${STAFF_COLS} FROM accounts WHERE type = 'PAYER' AND payer_id = $1 ORDER BY seq`, [payerId])).rows);

export async function createStaff(c: Ctx, payerId: string, b: { email: string; fullName: string; password: string; stationId?: string }) {
  const role = (await db.query<{ id: string }>("SELECT id FROM roles WHERE key = $1 AND scope = 'SYSTEM' AND hotel_id IS NULL", [PAYER_STAFF_ROLE.key])).rows[0];
  if (!role) throw new AppError(500, 'ROLE_NOT_SEEDED', 'Chưa có vai trò nhân viên đơn vị chi trả (chạy npm run db:seed)');
  const passwordHash = await hashPassword(b.password);
  try {
    return await withTransaction(async (tx) => {
      await lockPayer(tx, payerId);
      // DB không ép trạm thuộc đúng đơn vị: kiểm ở đây.
      if (b.stationId && !(await tx.query('SELECT 1 FROM payer_stations WHERE id = $1 AND payer_id = $2', [b.stationId, payerId])).rows[0]) throw new AppError(422, 'STATION_MISMATCH', 'Trạm không thuộc đơn vị chi trả này');
      const id = randomUUID();
      const a = (
        await tx.query(`INSERT INTO accounts (id, type, email, password_hash, full_name, status, payer_id, payer_station_id, role_ids, created_by) VALUES ($1,'PAYER',$2,$3,$4,'ACTIVE',$5,$6,$7::uuid[],$8) RETURNING ${STAFF_COLS}`, [id, b.email.toLowerCase(), passwordHash, b.fullName, payerId, b.stationId ?? null, [role.id], c.auth.sub])
      ).rows[0];
      await audit(c, tx, 'PAYER_STAFF.CREATE', 'account', id, undefined, { payerId, email: a.email, stationId: b.stationId ?? null });
      return a;
    });
  } catch (e) {
    if (isDuplicateKey(e) && duplicateConstraint(e).includes('email')) throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được dùng');
    throw e;
  }
}

export async function patchStaff(c: Ctx, payerId: string, id: string, p: { status?: string; fullName?: string }) {
  const next = await withTransaction(async (tx) => {
    const before = (await tx.query("SELECT * FROM accounts WHERE id = $1 AND type = 'PAYER' AND payer_id = $2 FOR UPDATE", [id, payerId])).rows[0];
    if (!before) throw notFound('nhân viên');
    const a = (await tx.query(`UPDATE accounts SET status = COALESCE($2, status), full_name = COALESCE($3, full_name), updated_at = now() WHERE id = $1 RETURNING ${STAFF_COLS}`, [id, p.status ?? null, p.fullName ?? null])).rows[0];
    await audit(c, tx, 'PAYER_STAFF.UPDATE', 'account', id, { status: before.status, fullName: before.fullName }, p);
    return a;
  });
  forgetAuth(id);
  return next;
}
