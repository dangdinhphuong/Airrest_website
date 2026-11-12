import { canBook, dailyAvailability, dayWindow, maxConcurrent, remainingRooms, type DayAvailability } from '@airrest/business-logic';
import type { BlockListQuery, CreateBlockBody, CreateRoomTypeBody, PatchRoomTypeBody } from '@airrest/validation';
import { PERM } from '../../config/permissions';
import { db, withTransaction, type Db } from '../../database/pg';
import type { RoomBlockDoc, RoomTypeDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { intervalsForCheck, loadActiveIntervals } from './availability';

const FIVE_YEARS_MS = 5 * 365 * 24 * 3600_000;

// Token khách sạn: luôn dùng hotelId của chính nó, bỏ qua tham số. Quyền xem mọi khách sạn (Admin): bắt buộc nêu hotelId.
export function resolveHotelId(auth: AuthContext, hotelId?: string): string {
  if (auth.permissions.includes(PERM.HOTEL_SCOPE_ALL)) {
    if (!hotelId) throw new AppError(422, 'HOTEL_ID_REQUIRED', 'Cần nêu hotelId');
    return hotelId;
  }
  if (!auth.hotelId) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không gắn với khách sạn nào');
  return auth.hotelId;
}

export async function listRoomTypes(auth: AuthContext, q: { hotelId?: string; includeRetired: boolean }): Promise<RoomTypeDoc[]> {
  const hotelId = resolveHotelId(auth, q.hotelId);
  return (await db.query<RoomTypeDoc>(`SELECT * FROM room_types WHERE hotel_id = $1 ${q.includeRetired ? '' : 'AND retired_at IS NULL'} ORDER BY retired_at NULLS FIRST, code`, [hotelId])).rows;
}

export async function createRoomType(auth: AuthContext, hotelId: string | undefined, body: CreateRoomTypeBody, requestId?: string): Promise<RoomTypeDoc> {
  const hid = resolveHotelId(auth, hotelId);
  try {
    return await withTransaction(async (tx) => {
      const created = (
        await tx.query<RoomTypeDoc>(
          `INSERT INTO room_types (hotel_id, code, name, capacity, beds, area_m2, total_rooms, pricing, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,jsonb_build_object('baseNightVnd', $8::bigint),true) RETURNING *`,
          [hid, body.code, body.name, body.capacity, body.beds, body.areaM2, body.totalRooms, body.baseNightVnd],
        )
      ).rows[0]!;
      await writeAudit({ actor: actorOf(auth), action: 'ROOM_TYPE.CREATE', entity: { type: 'room_type', id: created.id }, hotelId: hid, after: { code: created.code, totalRooms: created.totalRooms }, requestId }, tx);
      return created;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'ROOM_CODE_TAKEN', 'Mã loại phòng đã tồn tại trong khách sạn');
    throw e;
  }
}

// Khóa dòng loại phòng (cùng khóa với createBooking) và kiểm tra thuộc khách sạn, chưa ngừng dùng.
async function lockRoomType(tx: Db, hotelId: string, id: string, allowRetired = false): Promise<RoomTypeDoc> {
  const rt = (await tx.query<RoomTypeDoc>('SELECT * FROM room_types WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [id, hotelId])).rows[0];
  if (!rt) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng');
  if (rt.retiredAt && !allowRetired) throw new AppError(409, 'ROOM_TYPE_RETIRED', 'Loại phòng đã ngừng dùng');
  return rt;
}

// Số phòng bị chiếm đồng thời lớn nhất từ bây giờ trở đi (đơn còn hiệu lực + khóa).
async function peakCommitted(tx: Db, roomTypeId: string, now: Date): Promise<number> {
  const to = new Date(now.getTime() + FIVE_YEARS_MS);
  const r = await loadActiveIntervals(tx, roomTypeId, now, to, now);
  return maxConcurrent(intervalsForCheck(r, now), { from: now, to });
}

export async function updateRoomType(auth: AuthContext, hotelId: string | undefined, id: string, patch: PatchRoomTypeBody, requestId?: string): Promise<RoomTypeDoc> {
  const hid = resolveHotelId(auth, hotelId);
  // Mở bán lại: chỉ khi body đúng là { active: true } (UI 'Bán lại'); mọi sửa đổi khác trên loại đã ngừng dùng vẫn bị chặn.
  const reactivate = patch.active === true && Object.keys(patch).length === 1;
  return withTransaction(async (tx) => {
    const before = await lockRoomType(tx, hid, id, reactivate);
    if (before.retiredAt) return reactivateRoomType(tx, auth, hid, before, requestId);
    if (patch.totalRooms !== undefined && patch.totalRooms < before.totalRooms) {
      const peak = await peakCommitted(tx, id, new Date());
      if (patch.totalRooms < peak) throw new AppError(409, 'ROOM_TOTAL_BELOW_RESERVED', `Số phòng không được thấp hơn số đang giữ/đặt/khóa (${peak})`, { peak });
    }
    const next = (
      await tx.query<RoomTypeDoc>(
        `UPDATE room_types SET name = COALESCE($2, name), capacity = COALESCE($3, capacity), beds = COALESCE($4, beds), area_m2 = COALESCE($5, area_m2),
           total_rooms = COALESCE($6, total_rooms), active = COALESCE($7, active),
           pricing = CASE WHEN $8::bigint IS NULL THEN pricing ELSE jsonb_build_object('baseNightVnd', $8::bigint) END, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, patch.name ?? null, patch.capacity ?? null, patch.beds ?? null, patch.areaM2 ?? null, patch.totalRooms ?? null, patch.active ?? null, patch.baseNightVnd ?? null],
      )
    ).rows[0]!;
    await writeAudit(
      {
        actor: actorOf(auth),
        action: 'ROOM_TYPE.UPDATE',
        entity: { type: 'room_type', id },
        hotelId: hid,
        before: { name: before.name, totalRooms: before.totalRooms, baseNightVnd: before.pricing.baseNightVnd, active: before.active },
        after: patch,
        requestId,
      },
      tx,
    );
    return next;
  });
}

// Mở bán lại loại phòng đã ngừng dùng (retired_at != null): active=true, xóa retired_at.
async function reactivateRoomType(tx: Db, auth: AuthContext, hid: string, before: RoomTypeDoc, requestId?: string): Promise<RoomTypeDoc> {
  const clash = (await tx.query('SELECT 1 FROM room_types WHERE hotel_id = $1 AND code = $2 AND id <> $3 AND retired_at IS NULL', [hid, before.code, before.id])).rows[0];
  if (clash) throw new AppError(409, 'ROOM_TYPE_CODE_EXISTS', 'Mã loại phòng đã được dùng bởi loại đang hoạt động');
  try {
    const next = (await tx.query<RoomTypeDoc>('UPDATE room_types SET active = true, retired_at = NULL, updated_at = now() WHERE id = $1 RETURNING *', [before.id])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'ROOM_TYPE.REACTIVATE', entity: { type: 'room_type', id: before.id }, hotelId: hid, before: { active: before.active, retiredAt: before.retiredAt }, after: { active: true }, requestId }, tx);
    return next;
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'ROOM_TYPE_CODE_EXISTS', 'Mã loại phòng đã được dùng bởi loại đang hoạt động');
    throw e;
  }
}

// Ngừng dùng (mềm): giữ lịch sử đơn cũ. Còn đơn hoạt động hoặc khóa trong tương lai thì từ chối.
export async function retireRoomType(auth: AuthContext, hotelId: string | undefined, id: string, requestId?: string): Promise<RoomTypeDoc> {
  const hid = resolveHotelId(auth, hotelId);
  return withTransaction(async (tx) => {
    await lockRoomType(tx, hid, id);
    if ((await peakCommitted(tx, id, new Date())) > 0) throw new AppError(409, 'ROOM_TYPE_IN_USE', 'Loại phòng còn đơn hoặc khóa phòng đang hiệu lực');
    const next = (await tx.query<RoomTypeDoc>('UPDATE room_types SET active = false, retired_at = now(), updated_at = now() WHERE id = $1 RETURNING *', [id])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'ROOM_TYPE.RETIRE', entity: { type: 'room_type', id }, hotelId: hid, requestId }, tx);
    return next;
  });
}

// ---------- Tồn theo ngày + khóa/bảo trì phòng ----------

/** Danh sách ngày `YYYY-MM-DD` từ `from` đến `to` (gồm cả hai đầu). */
const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

export async function getInventory(auth: AuthContext, hotelId: string | undefined, roomTypeId: string, from: string, to: string, now = new Date()): Promise<DayAvailability[]> {
  const hid = resolveHotelId(auth, hotelId);
  const rt = (await db.query<RoomTypeDoc>('SELECT * FROM room_types WHERE id = $1 AND hotel_id = $2', [roomTypeId, hid])).rows[0];
  if (!rt) throw new AppError(404, 'ROOM_TYPE_NOT_FOUND', 'Không tìm thấy loại phòng');
  const win = { from: dayWindow(from).from, to: dayWindow(to).to };
  const r = await loadActiveIntervals(db, roomTypeId, win.from, win.to, now);
  return dailyAvailability(rt.totalRooms, r.reservations, r.blocks, datesBetween(from, to), now);
}

export async function createBlock(auth: AuthContext, hotelId: string | undefined, body: CreateBlockBody, requestId?: string): Promise<RoomBlockDoc> {
  const hid = resolveHotelId(auth, hotelId);
  return withTransaction(async (tx) => {
    const rt = await lockRoomType(tx, hid, body.roomTypeId);
    const now = new Date();
    const win = { from: body.from, to: body.to };
    const used = intervalsForCheck(await loadActiveIntervals(tx, rt.id, body.from, body.to, now), now);
    const remaining = remainingRooms(rt.totalRooms, used, win);
    // Không nêu qty = "đóng bán": khóa toàn bộ phần còn trống, không đụng đơn đang có.
    const qty = body.qty ?? remaining;
    if (body.qty === undefined && remaining <= 0) throw new AppError(409, 'NOTHING_TO_BLOCK', 'Không còn phòng trống để khóa trong khoảng này');
    if (!canBook(rt.totalRooms, used, { ...win, qty })) throw new AppError(409, 'BLOCK_CONFLICT', `Chỉ còn ${Math.max(0, remaining)} phòng trống trong khoảng này`, { remaining: Math.max(0, remaining) });
    const block = (
      await tx.query<RoomBlockDoc>(
        `INSERT INTO room_blocks (hotel_id, room_type_id, kind, qty, starts_at, ends_at, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
        [hid, rt.id, body.kind, qty, body.from, body.to, body.reason, JSON.stringify(actorOf(auth))],
      )
    ).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'ROOM_BLOCK.CREATE', entity: { type: 'room_block', id: block.id }, hotelId: hid, before: { remaining }, after: { kind: block.kind, qty, from: body.from, to: body.to }, reasonNote: body.reason, requestId }, tx);
    return block;
  });
}

export async function releaseBlock(auth: AuthContext, hotelId: string | undefined, blockId: string, requestId?: string): Promise<RoomBlockDoc> {
  const hid = resolveHotelId(auth, hotelId);
  return withTransaction(async (tx) => {
    const cur = (await tx.query<RoomBlockDoc>('SELECT * FROM room_blocks WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [blockId, hid])).rows[0];
    if (!cur) throw new AppError(404, 'ROOM_BLOCK_NOT_FOUND', 'Không tìm thấy khóa phòng');
    if (cur.releasedAt) throw new AppError(409, 'ROOM_BLOCK_RELEASED', 'Khóa phòng đã được gỡ');
    const block = (await tx.query<RoomBlockDoc>('UPDATE room_blocks SET released_at = now(), released_by = $2::jsonb WHERE id = $1 RETURNING *', [blockId, JSON.stringify(actorOf(auth))])).rows[0]!;
    await writeAudit({ actor: actorOf(auth), action: 'ROOM_BLOCK.RELEASE', entity: { type: 'room_block', id: blockId }, hotelId: hid, requestId }, tx);
    return block;
  });
}

export async function listBlocks(auth: AuthContext, q: BlockListQuery): Promise<{ items: RoomBlockDoc[]; nextCursor: number | null }> {
  const hid = resolveHotelId(auth, q.hotelId);
  const where = ['hotel_id = $1'];
  const params: unknown[] = [hid];
  const add = (sql: string, v: unknown) => where.push(sql.replace('?', `$${params.push(v)}`));
  if (q.roomTypeId) add('room_type_id = ?', q.roomTypeId);
  if (q.active) where.push('released_at IS NULL AND ends_at > now()');
  if (q.cursor !== undefined) add('seq < ?', q.cursor);
  const rows = (await db.query<RoomBlockDoc>(`SELECT * FROM room_blocks WHERE ${where.join(' AND ')} ORDER BY seq DESC LIMIT ${q.limit + 1}`, params)).rows;
  const items = rows.slice(0, q.limit);
  return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.seq : null };
}

export { lockRoomType, peakCommitted };
