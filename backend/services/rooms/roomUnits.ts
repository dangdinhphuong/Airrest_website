import type { BulkRoomsBody, CreateRoomBody, FloorBody, PatchFloorBody, PatchRoomBody, RoomListQuery } from '@airrest/validation';
import { db, json, withTransaction, type Db } from '../../database/pg';
import type { FloorDoc, RoomDoc, RoomTypeDoc } from '../../database/types';
import { AppError, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { actorOf, writeAudit } from '../audit';
import { imageViews } from '../hotels/profile';
import { lockRoomType, peakCommitted, resolveHotelId } from './rooms.service';

// Tầng + phòng riêng lẻ. Tồn kho vẫn đếm theo loại: loại có >= 1 dòng rooms thì total_rooms = số phòng ACTIVE (syncTotal).

const roomView = (r: RoomDoc) => ({ ...r, images: imageViews(r.images) });

// Đồng bộ total_rooms của loại phòng ĐÃ KHÓA (lockRoomType). Chưa có dòng rooms nào: giữ hành vi cũ (nhập tay).
// Giảm dưới số đang giữ/đặt/khóa -> 409 cùng mã với PATCH totalRooms; ném lỗi thì cả transaction rollback.
async function syncTotal(tx: Db, rt: RoomTypeDoc): Promise<number> {
  const c = (await tx.query<{ total: number; active: number }>(`SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ACTIVE') AS active FROM rooms WHERE room_type_id = $1`, [rt.id])).rows[0]!;
  if (c.active > MAX_ACTIVE_ROOMS) throw new AppError(409, 'ROOM_COUNT_LIMIT', `Một loại phòng tối đa ${MAX_ACTIVE_ROOMS} phòng đang hoạt động`, { limit: MAX_ACTIVE_ROOMS, active: Number(c.active) });
  if (c.total === 0 || c.active === rt.totalRooms) return rt.totalRooms;
  if (c.active < rt.totalRooms) {
    const peak = await peakCommitted(tx, rt.id, new Date());
    if (c.active < peak) throw new AppError(409, 'ROOM_TOTAL_BELOW_RESERVED', `Số phòng không được thấp hơn số đang giữ/đặt/khóa (${peak})`, { peak });
  }
  await tx.query('UPDATE room_types SET total_rooms = $2, updated_at = now() WHERE id = $1', [rt.id, c.active]);
  return c.active;
}

// Khóa nhiều loại phòng theo thứ tự id cố định (tránh deadlock khi chuyển phòng giữa hai loại).
async function lockTypes(tx: Db, hid: string, ids: string[]): Promise<Map<string, RoomTypeDoc>> {
  const out = new Map<string, RoomTypeDoc>();
  for (const id of [...new Set(ids)].sort()) out.set(id, await lockRoomType(tx, hid, id));
  return out;
}

async function requireFloor(tx: Db, hid: string, id: string): Promise<FloorDoc> {
  const f = (await tx.query<FloorDoc>('SELECT * FROM floors WHERE id = $1 AND hotel_id = $2 FOR SHARE', [id, hid])).rows[0];
  if (!f) throw new AppError(404, 'FLOOR_NOT_FOUND', 'Không tìm thấy tầng');
  return f;
}

export const MAX_ACTIVE_ROOMS = 500; // = trần totalRooms nhập tay (validation)

// Số phòng không phân biệt hoa/thường ("A1" = "a1"); khóa theo khách sạn để hai request song song không cùng lọt.
async function assertNumbersFree(tx: Db, hid: string, numbers: string[], exceptId?: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rooms:${hid}`]);
  const taken = (await tx.query<{ number: string }>('SELECT number FROM rooms WHERE hotel_id = $1 AND lower(number) = ANY($2::text[]) AND id IS DISTINCT FROM $3::uuid', [hid, numbers.map((x) => x.toLowerCase()), exceptId ?? null])).rows.map((x) => x.number);
  if (taken.length) throw new AppError(409, 'ROOM_NUMBER_TAKEN', `Số phòng đã tồn tại: ${taken.slice(0, 10).join(', ')}`, { numbers: taken });
}

const numberTaken = () => new AppError(409, 'ROOM_NUMBER_TAKEN', 'Số phòng đã tồn tại trong khách sạn');

// ---------- Tầng ----------
export async function listFloors(auth: AuthContext, hotelId?: string) {
  const hid = await resolveHotelId(auth, hotelId);
  const rows = (await db.query<FloorDoc & { roomCount: number }>('SELECT f.*, (SELECT count(*) FROM rooms r WHERE r.floor_id = f.id) AS room_count FROM floors f WHERE f.hotel_id = $1 ORDER BY f.sort_order, f.level', [hid])).rows;
  return rows;
}

export async function createFloor(auth: AuthContext, hotelId: string | undefined, body: FloorBody, requestId?: string): Promise<FloorDoc> {
  const hid = await resolveHotelId(auth, hotelId);
  try {
    return await withTransaction(async (tx) => {
      const f = (await tx.query<FloorDoc>('INSERT INTO floors (hotel_id, name, level, sort_order, note) VALUES ($1,$2,$3,$4,$5) RETURNING *', [hid, body.name, body.level, body.sortOrder, body.note ?? null])).rows[0]!;
      await writeAudit({ actor: actorOf(auth), action: 'FLOOR.CREATE', entity: { type: 'floor', id: f.id }, hotelId: hid, after: { name: f.name, level: f.level }, requestId }, tx);
      return f;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'FLOOR_LEVEL_TAKEN', 'Số tầng đã tồn tại trong khách sạn');
    throw e;
  }
}

export async function updateFloor(auth: AuthContext, hotelId: string | undefined, id: string, patch: PatchFloorBody, requestId?: string): Promise<FloorDoc> {
  const hid = await resolveHotelId(auth, hotelId);
  try {
    return await withTransaction(async (tx) => {
      const before = (await tx.query<FloorDoc>('SELECT * FROM floors WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [id, hid])).rows[0];
      if (!before) throw new AppError(404, 'FLOOR_NOT_FOUND', 'Không tìm thấy tầng');
      const f = (
        await tx.query<FloorDoc>('UPDATE floors SET name = $2, level = $3, sort_order = $4, note = $5, updated_at = now() WHERE id = $1 RETURNING *', [
          id, patch.name ?? before.name, patch.level ?? before.level, patch.sortOrder ?? before.sortOrder, patch.note === undefined ? before.note ?? null : patch.note,
        ])
      ).rows[0]!;
      await writeAudit({ actor: actorOf(auth), action: 'FLOOR.UPDATE', entity: { type: 'floor', id }, hotelId: hid, before: { name: before.name, level: before.level }, after: patch, requestId }, tx);
      return f;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError(409, 'FLOOR_LEVEL_TAKEN', 'Số tầng đã tồn tại trong khách sạn');
    throw e;
  }
}

export async function deleteFloor(auth: AuthContext, hotelId: string | undefined, id: string, requestId?: string): Promise<{ id: string }> {
  const hid = await resolveHotelId(auth, hotelId);
  return withTransaction(async (tx) => {
    const f = (await tx.query<FloorDoc>('SELECT * FROM floors WHERE id = $1 AND hotel_id = $2 FOR UPDATE', [id, hid])).rows[0];
    if (!f) throw new AppError(404, 'FLOOR_NOT_FOUND', 'Không tìm thấy tầng');
    const n = (await tx.query<{ n: number }>('SELECT count(*) AS n FROM rooms WHERE floor_id = $1', [id])).rows[0]!.n;
    if (n > 0) throw new AppError(409, 'FLOOR_HAS_ROOMS', `Tầng còn ${n} phòng, hãy chuyển hoặc xóa phòng trước`, { rooms: n });
    await tx.query('DELETE FROM floors WHERE id = $1', [id]);
    await writeAudit({ actor: actorOf(auth), action: 'FLOOR.DELETE', entity: { type: 'floor', id }, hotelId: hid, before: { name: f.name, level: f.level }, requestId }, tx);
    return { id };
  });
}

// ---------- Phòng ----------
export async function listRooms(auth: AuthContext, q: RoomListQuery) {
  const hid = await resolveHotelId(auth, q.hotelId);
  const where = ['hotel_id = $1'];
  const params: unknown[] = [hid];
  if (q.floorId) where.push(`floor_id = $${params.push(q.floorId)}`);
  if (q.roomTypeId) where.push(`room_type_id = $${params.push(q.roomTypeId)}`);
  return (await db.query<RoomDoc>(`SELECT * FROM rooms WHERE ${where.join(' AND ')} ORDER BY number`, params)).rows.map(roomView);
}

export async function createRoom(auth: AuthContext, hotelId: string | undefined, body: CreateRoomBody, requestId?: string) {
  const hid = await resolveHotelId(auth, hotelId);
  try {
    return await withTransaction(async (tx) => {
      const rt = (await lockTypes(tx, hid, [body.roomTypeId])).get(body.roomTypeId)!;
      await requireFloor(tx, hid, body.floorId);
      await assertNumbersFree(tx, hid, [body.number]);
      const r = (
        await tx.query<RoomDoc>(
          `INSERT INTO rooms (hotel_id, floor_id, room_type_id, number, status, note, view, smoking, max_adults, max_children, amenities_extra, images)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12::jsonb) RETURNING *`,
          [hid, body.floorId, body.roomTypeId, body.number, body.status, body.note ?? null, body.view ?? null, body.smoking ?? null, body.maxAdults ?? null, body.maxChildren ?? null, body.amenitiesExtra, json(body.images)],
        )
      ).rows[0]!;
      const total = await syncTotal(tx, rt);
      await writeAudit({ actor: actorOf(auth), action: 'ROOM.CREATE', entity: { type: 'room', id: r.id }, hotelId: hid, before: { totalRooms: rt.totalRooms }, after: { number: r.number, status: r.status, totalRooms: total }, requestId }, tx);
      return roomView(r);
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw numberTaken();
    throw e;
  }
}

export async function createRoomsBulk(auth: AuthContext, hotelId: string | undefined, body: BulkRoomsBody, requestId?: string) {
  const hid = await resolveHotelId(auth, hotelId);
  const numbers = Array.from({ length: body.to - body.from + 1 }, (_, i) => `${body.prefix}${body.from + i}`);
  try {
    return await withTransaction(async (tx) => {
      const rt = (await lockTypes(tx, hid, [body.roomTypeId])).get(body.roomTypeId)!;
      await requireFloor(tx, hid, body.floorId);
      await assertNumbersFree(tx, hid, numbers);
      const rows = (
        await tx.query<RoomDoc>(
          `INSERT INTO rooms (hotel_id, floor_id, room_type_id, number, status) SELECT $1,$2,$3,n,$5 FROM unnest($4::text[]) AS n RETURNING *`,
          [hid, body.floorId, body.roomTypeId, numbers, body.status],
        )
      ).rows;
      const total = await syncTotal(tx, rt);
      await writeAudit({ actor: actorOf(auth), action: 'ROOM.BULK_CREATE', entity: { type: 'room_type', id: rt.id }, hotelId: hid, before: { totalRooms: rt.totalRooms }, after: { count: rows.length, from: numbers[0], to: numbers[numbers.length - 1], totalRooms: total }, requestId }, tx);
      return rows.sort((a, b) => a.number.localeCompare(b.number)).map(roomView);
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw numberTaken();
    throw e;
  }
}

export async function updateRoom(auth: AuthContext, hotelId: string | undefined, id: string, patch: PatchRoomBody, requestId?: string) {
  const hid = await resolveHotelId(auth, hotelId);
  try {
    return await withTransaction(async (tx) => {
      const cur = (await tx.query<RoomDoc>('SELECT * FROM rooms WHERE id = $1 AND hotel_id = $2', [id, hid])).rows[0];
      if (!cur) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng');
      const types = await lockTypes(tx, hid, [cur.roomTypeId, patch.roomTypeId ?? cur.roomTypeId]);
      const before = (await tx.query<RoomDoc>('SELECT * FROM rooms WHERE id = $1 FOR UPDATE', [id])).rows[0]!;
      if (patch.floorId) await requireFloor(tx, hid, patch.floorId);
      if (patch.number !== undefined) await assertNumbersFree(tx, hid, [patch.number], id);
      const pick = <K extends keyof PatchRoomBody>(k: K, old: unknown) => (patch[k] === undefined ? old ?? null : patch[k]); // null = xóa ghi đè
      const r = (
        await tx.query<RoomDoc>(
          `UPDATE rooms SET floor_id = $2, room_type_id = $3, number = $4, status = $5, note = $6, view = $7, smoking = $8, max_adults = $9, max_children = $10,
             amenities_extra = $11::text[], images = $12::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
          [
            id, patch.floorId ?? before.floorId, patch.roomTypeId ?? before.roomTypeId, patch.number ?? before.number, patch.status ?? before.status,
            pick('note', before.note), pick('view', before.view), pick('smoking', before.smoking), pick('maxAdults', before.maxAdults), pick('maxChildren', before.maxChildren),
            patch.amenitiesExtra ?? before.amenitiesExtra, json(patch.images ?? before.images),
          ],
        )
      ).rows[0]!;
      const totals: Record<string, number> = {};
      for (const rt of types.values()) totals[rt.id] = await syncTotal(tx, rt);
      await writeAudit({ actor: actorOf(auth), action: 'ROOM.UPDATE', entity: { type: 'room', id }, hotelId: hid, before: { number: before.number, status: before.status, roomTypeId: before.roomTypeId, floorId: before.floorId }, after: { ...patch, totals }, requestId }, tx);
      return roomView(r);
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw numberTaken();
    throw e;
  }
}

// Xóa cứng: không có bảng nào tham chiếu rooms (đơn không gán vào phòng cụ thể); lịch sử còn trong audit. Muốn giữ dấu vết: đổi status INACTIVE.
export async function deleteRoom(auth: AuthContext, hotelId: string | undefined, id: string, requestId?: string): Promise<{ id: string }> {
  const hid = await resolveHotelId(auth, hotelId);
  return withTransaction(async (tx) => {
    const cur = (await tx.query<RoomDoc>('SELECT * FROM rooms WHERE id = $1 AND hotel_id = $2', [id, hid])).rows[0];
    if (!cur) throw new AppError(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng');
    const rt = (await lockTypes(tx, hid, [cur.roomTypeId])).get(cur.roomTypeId)!;
    await tx.query('DELETE FROM rooms WHERE id = $1', [id]);
    const total = await syncTotal(tx, rt);
    await writeAudit({ actor: actorOf(auth), action: 'ROOM.DELETE', entity: { type: 'room', id }, hotelId: hid, before: { number: cur.number, status: cur.status, totalRooms: rt.totalRooms }, after: { totalRooms: total }, requestId }, tx);
    return { id };
  });
}
