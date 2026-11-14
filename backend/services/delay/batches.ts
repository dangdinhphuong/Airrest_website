import { z } from 'zod';
import { lookupBody } from '@airrest/validation';
import { db, json, withTransaction } from '../../database/pg';
import type { DelayFlightPaxDoc, FlightDoc } from '../../database/types';
import { pickupPointsOf } from '../../data/pickupPoints';
import { generateGroupCode } from '../../lib/codes';
import { AppError, duplicateConstraint, isDuplicateKey } from '../../lib/errors';
import type { AuthContext } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { actorOf, writeAudit } from '../audit';
import { createPayerBooking } from '../bookings/bookings.service';
import { getConfig } from '../systemConfig';
import { contractPrice, loadContractRate, loadPlanHotelsWithMinutes } from './candidates';
import { publishOffer } from './offers';
import { payerScope } from './queries';
import { planRooms, type OfferUnit, type PlanHotel, type PlannedRoom, type PlanPax } from './rooms/plan';

const MIN_STAY_MIN = 30; // khung ở ngắn hơn mức này thì KS đó không dùng được (chuyến sắp bay quá sát)
const LIVE_GROUP = ['PENDING', 'OFFERED', 'CONFIRMED'];
const phoneOf = (p: DelayFlightPaxDoc) => p.contactPhone ?? p.phone ?? null;
const emailOf = (p: DelayFlightPaxDoc) => p.contactEmail ?? p.email ?? null;
const min = (m: number) => m * 60_000;

export interface UnplacedItem { paxId: string; pnr: string; reason: string }
export interface UpgradeReq { unitKey: string; roomTypeId: string }
export interface UpgradeOption { roomTypeId: string; roomTypeName: string; deltaVnd: number }

/**
 * Khóa ỔN ĐỊNH của một phòng giữa preview và place: id đơn vị của planRooms (u1, u2...) phụ thuộc thứ tự xếp và tồn phòng nên KHÔNG dùng;
 * thay vào đó dùng tập hành khách của phòng (id đã sắp, nối bằng '+'). Cùng danh sách khách => cùng khóa; danh sách khách khác => khóa không khớp => 422.
 */
export const roomKey = (r: PlannedRoom): string => [...r.paxIds].sort().join('+');

// ---------- dữ liệu chung của preview/place ----------
async function loadCtx(auth: AuthContext, flightId: string, passengerIds: string[]) {
  const { payerId, stationId } = payerScope(auth);
  const all = (
    await db.query<DelayFlightPaxDoc>('SELECT * FROM delay_flight_pax WHERE flight_id = $1 AND payer_id = $2 AND ($3::uuid IS NULL OR station_id = $3) ORDER BY is_representative DESC, seq', [flightId, payerId, stationId])
  ).rows;
  if (!all.length) throw new AppError(404, 'FLIGHT_NOT_FOUND', 'Không tìm thấy chuyến bay');
  const ids = [...new Set(passengerIds)];
  const chosen = ids.map((id) => all.find((p) => p.id === id));
  if (chosen.some((p) => !p)) throw new AppError(404, 'PASSENGER_NOT_FOUND', 'Có hành khách không thuộc chuyến này', { passengerIds: ids.filter((_, i) => !chosen[i]) });
  const pax = chosen as DelayFlightPaxDoc[];
  const flight = (await db.query<FlightDoc>('SELECT * FROM flights WHERE id = $1', [flightId])).rows[0]!;
  if (flight.status !== 'DELAYED') throw new AppError(409, 'FLIGHT_NOT_DELAYED', 'Chuyến bay không ở trạng thái delay');
  if (!flight.newDep) throw new AppError(409, 'FLIGHT_TIME_UNKNOWN', 'Chưa có giờ bay mới của chuyến, không thể tính giờ trả phòng. Cập nhật giờ bay rồi đặt lại');
  const taken = (
    await db.query<{ id: string }>(
      'SELECT p.id FROM delay_flight_pax p JOIN delay_groups g ON g.id = p.group_id JOIN delay_batches b ON b.id = g.batch_id WHERE p.id = ANY($1::uuid[]) AND g.status = ANY($2) AND b.status <> $3',
      [ids, LIVE_GROUP, 'CANCELLED'],
    )
  ).rows;
  if (taken.length) throw new AppError(409, 'PAX_ALREADY_PLACED', 'Có hành khách đã có đơn phòng hiệu lực cho chuyến này', { passengerIds: taken.map((t) => t.id) });
  const payer = (await db.query<{ sharedRoomPolicy: 'PRIVATE' | 'SHARED'; allowUpgrade: boolean; contact?: { phone?: string } }>('SELECT shared_room_policy, allow_upgrade, contact FROM payers WHERE id = $1', [payerId])).rows[0]!;
  return { payerId, flight, newDep: flight.newDep, all, pax, payer };
}
type Ctx = Awaited<ReturnType<typeof loadCtx>>;

// Khung ở của một KS: [bây giờ + xe chạy, giờ bay mới - có mặt trước - dự phòng - xe chạy] (spec 6.5).
async function windowRule(newDep: Date) {
  const arrive = (await getConfig('delay.arriveBeforeMin')).value.minutes;
  const buffer = (await getConfig('delay.bufferMin')).value.minutes;
  const now = Date.now();
  return {
    // Khung rộng nhất (mọi KS nằm trong đó) để tính tồn một cách an toàn.
    wide: { from: new Date(now), to: new Date(newDep.getTime() - min(arrive + buffer)) },
    of: (driveMin: number) => ({ from: new Date(now + min(driveMin)), to: new Date(newDep.getTime() - min(arrive + buffer + driveMin)) }),
  };
}

/** Giờ rời KS = giờ bay - có mặt trước - dự phòng - xe chạy (cùng công thức với khung ở của lô; dùng khi giờ bay đổi). */
export async function leaveAtFor(flightDep: Date, driveMin: number): Promise<Date> {
  return (await windowRule(flightDep)).of(driveMin).to;
}

async function candidateHotels(c: Ctx, excluded: string[] = []) {
  const w = await windowRule(c.newDep);
  const { hotels, minutesByHotel } = await loadPlanHotelsWithMinutes({ payerId: c.payerId, airportIata: c.flight.origin, from: w.wide.from, to: w.wide.to, excludedHotelIds: excluded });
  const ok = hotels.filter((h) => { const x = w.of(minutesByHotel[h.hotelId]!); return x.to.getTime() - x.from.getTime() >= min(MIN_STAY_MIN); });
  if (hotels.length && !ok.length) throw new AppError(409, 'FLIGHT_TOO_SOON', 'Giờ bay mới quá sát, không đủ thời gian nghỉ trước khi ra sân bay');
  return { hotels: ok, w, minutesByHotel };
}

const toPlanPax = (p: DelayFlightPaxDoc): PlanPax => ({ id: p.id, pnr: p.pnr, age: p.age, category: p.category, isRepresentative: p.isRepresentative, specialNeeds: p.specialNeeds });

// Người đại diện của đơn vị đặt: đại diện PNR nếu có trong đơn vị, không thì người lớn đầu tiên; SĐT/email lấy dần từ người đó -> người khác trong đơn vị -> cả PNR -> SĐT liên hệ của đơn vị chi trả.
function guestOf(c: Ctx, unitPax: DelayFlightPaxDoc[]) {
  const ordered = [...unitPax].sort((a, b) => Number(b.isRepresentative) - Number(a.isRepresentative) || Number(b.category === 'ADULT') - Number(a.category === 'ADULT') || a.seq - b.seq);
  const rep = ordered[0]!;
  const pool = [...ordered, ...c.all.filter((p) => p.pnr === rep.pnr)];
  const phone = pool.map(phoneOf).find(Boolean) ?? c.payer.contact?.phone ?? null;
  const email = pool.map(emailOf).find(Boolean) ?? undefined;
  return { fullName: rep.fullName, phone, email };
}

function requirePhones(c: Ctx) {
  const missing = [...new Set(c.pax.map((p) => p.pnr))].filter((pnr) => !guestOf(c, c.pax.filter((p) => p.pnr === pnr)).phone);
  if (missing.length) throw new AppError(422, 'PAX_PHONE_REQUIRED', 'Chưa có số điện thoại liên hệ cho nhóm khách. Cập nhật SĐT của người đại diện rồi đặt lại', { pnrs: missing });
}

// ---------- nâng hạng ----------
interface UpCand extends UpgradeOption { free: boolean }
// shortcut: đơn vị nhiều phòng (cụm thông nhau) chưa cho nâng hạng, vì offer chỉ lưu một loại phòng + một khoản chênh; cần lưu theo phòng nếu muốn mở.
/** Hạng cao hơn CÙNG khách sạn của một phòng: có giá hợp đồng hiệu lực cho khung ở, đủ chỗ, giá cao hơn hạng chuẩn. free = còn phòng (tồn - số phòng đã xếp cùng loại >= 1). */
async function upgradeCands(c: Ctx, hotel: PlanHotel, unit: OfferUnit, room: PlannedRoom, stay: { from: Date; to: Date }, planned: Map<string, number>, typeNames: Map<string, string>): Promise<UpCand[]> {
  if (unit.rooms.length !== 1) return [];
  const base = await loadContractRate(c.payerId, room.roomTypeId, stay.from, stay.to);
  if (!base) return [];
  const basePrice = contractPrice(base, stay.from, stay.to);
  const seats = room.paxIds.filter((id) => c.pax.find((x) => x.id === id)?.category !== 'INFANT').length;
  const out: UpCand[] = [];
  for (const t of hotel.roomTypes) {
    if (t.roomTypeId === room.roomTypeId || t.capacity < seats || (unit.connecting && !t.connecting)) continue;
    const rate = await loadContractRate(c.payerId, t.roomTypeId, stay.from, stay.to);
    const price = rate ? contractPrice(rate, stay.from, stay.to) : 0;
    if (price <= basePrice) continue;
    out.push({ roomTypeId: t.roomTypeId, roomTypeName: typeNames.get(t.roomTypeId) ?? '', deltaVnd: price - basePrice, free: t.available - (planned.get(key2(hotel.hotelId, t.roomTypeId)) ?? 0) >= 1 });
  }
  return out.sort((a, b) => a.deltaVnd - b.deltaVnd);
}
const key2 = (h: string, t: string) => `${h}|${t}`;
const plannedCount = (units: OfferUnit[]) => {
  const m = new Map<string, number>();
  units.forEach((u) => u.rooms.forEach((r) => m.set(key2(u.hotelId, r.roomTypeId), (m.get(key2(u.hotelId, r.roomTypeId)) ?? 0) + 1)));
  return m;
};

/** Kiểm chặt `upgrades` của yêu cầu đặt: payer không cho -> 403; khóa lạ/trùng, hạng không thuộc danh sách -> 422; hết phòng hạng cao -> 409 (KHÔNG tự hạ cấp). */
async function validateUpgrades(c: Ctx, plan: { units: OfferUnit[] }, hotels: PlanHotel[], rule: Awaited<ReturnType<typeof windowRule>>, minutesByHotel: Record<string, number>, ups: UpgradeReq[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ups.length) return out;
  if (!c.payer.allowUpgrade) throw new AppError(403, 'UPGRADE_NOT_ALLOWED', 'Đơn vị chi trả này không được nâng hạng phòng');
  const planned = plannedCount(plan.units);
  const names = await nameMaps(plan.units.map((u) => u.hotelId), hotels.flatMap((h) => h.roomTypes.map((t) => t.roomTypeId)));
  const need = new Map(planned);
  for (const u of ups) {
    if (out.has(u.unitKey)) throw new AppError(422, 'UPGRADE_DUPLICATE', 'Một phòng chỉ được nâng hạng một lần', { unitKey: u.unitKey });
    const unit = plan.units.find((x) => x.rooms.some((r) => roomKey(r) === u.unitKey));
    const room = unit?.rooms.find((r) => roomKey(r) === u.unitKey);
    if (!unit || !room) throw new AppError(422, 'UPGRADE_UNIT_UNKNOWN', 'Phòng cần nâng hạng không có trong phương án đặt', { unitKey: u.unitKey });
    const cands = await upgradeCands(c, hotels.find((h) => h.hotelId === unit.hotelId)!, unit, room, rule.of(minutesByHotel[unit.hotelId]!), planned, names.types);
    const opt = cands.find((x) => x.roomTypeId === u.roomTypeId);
    if (!opt) throw new AppError(422, 'UPGRADE_NOT_AVAILABLE', 'Hạng phòng này không nâng được cho phòng đã chọn (khác khách sạn, không có giá hợp đồng, không đủ chỗ hoặc không cao hơn)', { unitKey: u.unitKey, roomTypeId: u.roomTypeId });
    need.set(key2(unit.hotelId, room.roomTypeId), need.get(key2(unit.hotelId, room.roomTypeId))! - 1);
    need.set(key2(unit.hotelId, u.roomTypeId), (need.get(key2(unit.hotelId, u.roomTypeId)) ?? 0) + 1);
    out.set(u.unitKey, u.roomTypeId);
  }
  for (const u of ups) {
    const unit = plan.units.find((x) => x.rooms.some((r) => roomKey(r) === u.unitKey))!;
    const avail = hotels.find((h) => h.hotelId === unit.hotelId)!.roomTypes.find((t) => t.roomTypeId === u.roomTypeId)!.available;
    if ((need.get(key2(unit.hotelId, u.roomTypeId)) ?? 0) > avail) throw new AppError(409, 'UPGRADE_NO_ROOM', 'Hạng phòng cao hơn đã hết phòng, không nâng hạng được', { unitKey: u.unitKey, roomTypeId: u.roomTypeId });
  }
  return out;
}

// ---------- preview ----------
export async function previewBatch(p: { auth: AuthContext; flightId: string; passengerIds: string[] }) {
  const c = await loadCtx(p.auth, p.flightId, p.passengerIds);
  const { hotels, w, minutesByHotel } = await candidateHotels(c);
  const plan = planRooms({ pax: c.pax.map(toPlanPax), hotels, policy: c.payer.sharedRoomPolicy });
  const names = await nameMaps(plan.units.map((u) => u.hotelId), [...plan.units.flatMap((u) => u.rooms.map((r) => r.roomTypeId)), ...hotels.flatMap((h) => h.roomTypes.map((t) => t.roomTypeId))]);
  const planned = plannedCount(plan.units);
  const byId = new Map(c.pax.map((x) => [x.id, x]));
  return {
    flightId: p.flightId,
    units: await Promise.all(plan.units.map(async (u) => {
      const stay = w.of(minutesByHotel[u.hotelId]!);
      const rooms = await Promise.all(u.rooms.map(async (r) => {
        const rate = await loadContractRate(c.payerId, r.roomTypeId, stay.from, stay.to);
        const upgradeOptions: UpgradeOption[] = c.payer.allowUpgrade
          ? (await upgradeCands(c, hotels.find((h) => h.hotelId === u.hotelId)!, u, r, stay, planned, names.types)).filter((x) => x.free).map(({ free: _f, ...o }) => o)
          : [];
        return { unitKey: roomKey(r), roomTypeId: r.roomTypeId, roomTypeName: names.types.get(r.roomTypeId) ?? '', paxIds: r.paxIds, priceVnd: rate ? contractPrice(rate, stay.from, stay.to) : null, upgradeOptions };
      }));
      const g = guestOf(c, u.rooms.flatMap((r) => r.paxIds).map((id) => byId.get(id)!));
      return { id: u.id, pnr: u.pnr, hotelId: u.hotelId, hotelName: names.hotels.get(u.hotelId) ?? '', canUpgrade: c.payer.allowUpgrade, cluster: u.cluster, adjacent: u.adjacent, connecting: u.connecting, rooms, stay: { checkInAt: stay.from.toISOString(), checkOutAt: stay.to.toISOString() }, totalVnd: rooms.reduce((s, r) => s + (r.priceVnd ?? 0), 0), contact: { fullName: g.fullName, phone: g.phone, email: g.email ?? null }, phoneMissing: !g.phone };
    })),
    unplaced: plan.unplaced as UnplacedItem[],
  };
}

async function nameMaps(hotelIds: string[], typeIds: string[]) {
  const h = (await db.query<{ id: string; name: string }>('SELECT id, name FROM hotels WHERE id = ANY($1::uuid[])', [hotelIds])).rows;
  const t = (await db.query<{ id: string; name: string }>('SELECT id, name FROM room_types WHERE id = ANY($1::uuid[])', [typeIds])).rows;
  return { hotels: new Map(h.map((x) => [x.id, x.name])), types: new Map(t.map((x) => [x.id, x.name])) };
}

// ---------- đặt ----------
export async function placeBatch(p: { auth: AuthContext; flightId: string; passengerIds: string[]; idempotencyKey: string; pickupPoint?: string; upgrades?: UpgradeReq[] }) {
  const { payerId } = payerScope(p.auth);
  const existing = (await db.query<{ id: string }>('SELECT id FROM delay_batches WHERE payer_id = $1 AND idempotency_key = $2', [payerId, p.idempotencyKey])).rows[0];
  if (existing) return getBatch(p.auth, existing.id);

  const c = await loadCtx(p.auth, p.flightId, p.passengerIds);
  requirePhones(c);
  const points = pickupPointsOf(c.flight.origin);
  if (p.pickupPoint !== undefined && !points.includes(p.pickupPoint)) throw new AppError(422, 'PICKUP_POINT_INVALID', 'Điểm đón không thuộc danh sách của sân bay', { airport: c.flight.origin, allowed: points });
  const pickupPoint = p.pickupPoint ?? points[0]!;
  const first = await candidateHotels(c);
  const plan = planRooms({ pax: c.pax.map(toPlanPax), hotels: first.hotels, policy: c.payer.sharedRoomPolicy });
  const upgrades = await validateUpgrades(c, plan, first.hotels, first.w, first.minutesByHotel, p.upgrades ?? []); // trước khi tạo lô: lỗi thì không để lại gì

  // Giao dịch 1: khóa theo chuyến, kiểm lại "mỗi khách một đơn hiệu lực", tạo lô + nhóm theo PNR, gán group_id (chiếm chỗ khách).
  let batchId: string;
  const groupByPnr = new Map<string, string>();
  try {
    batchId = await withTransaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`delay-flight:${p.flightId}`]);
      const taken = (await tx.query('SELECT 1 FROM delay_flight_pax p JOIN delay_groups g ON g.id = p.group_id JOIN delay_batches b ON b.id = g.batch_id WHERE p.id = ANY($1::uuid[]) AND g.status = ANY($2) AND b.status <> $3 LIMIT 1', [c.pax.map((x) => x.id), LIVE_GROUP, 'CANCELLED'])).rows.length;
      if (taken) throw new AppError(409, 'PAX_ALREADY_PLACED', 'Có hành khách đã có đơn phòng hiệu lực cho chuyến này');
      const id = (await tx.query<{ id: string }>(
        'INSERT INTO delay_batches (payer_id, station_id, flight_id, status, simulated, created_by, idempotency_key, pickup_point) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [payerId, c.pax[0]!.stationId, p.flightId, 'PLACING', c.flight.simulated, p.auth.sub, p.idempotencyKey, pickupPoint],
      )).rows[0]!.id;
      for (const pnr of [...new Set(c.pax.map((x) => x.pnr))]) {
        const members = c.pax.filter((x) => x.pnr === pnr);
        for (let attempt = 0; ; attempt++) {
          try {
            const g = await tx.query<{ id: string }>('INSERT INTO delay_groups (batch_id, pnr, code, no_split) VALUES ($1,$2,$3,$4) RETURNING id', [id, pnr, generateGroupCode(), members.some((x) => x.category !== 'ADULT')]);
            groupByPnr.set(pnr, g.rows[0]!.id);
            break;
          } catch (e) { if (!(isDuplicateKey(e) && attempt < 2)) throw e; }
        }
        await tx.query('UPDATE delay_flight_pax SET group_id = $1, updated_at = now() WHERE id = ANY($2::uuid[])', [groupByPnr.get(pnr), members.map((x) => x.id)]);
      }
      return id;
    });
  } catch (e) {
    if (isDuplicateKey(e) && duplicateConstraint(e) === 'delay_batches_idem') { // hai yêu cầu cùng key đua nhau: bên thua trả kết quả của bên thắng
      const w = (await db.query<{ id: string }>('SELECT id FROM delay_batches WHERE payer_id = $1 AND idempotency_key = $2', [payerId, p.idempotencyKey])).rows[0];
      if (w) return getBatch(p.auth, w.id);
    }
    throw e;
  }

  // Mỗi đơn vị đặt = một booking PAYER + một offer. SOLD_OUT thì xếp lại phần khách đó, bỏ KS vừa hết.
  const paxById = new Map(c.pax.map((x) => [x.id, x]));
  const unplaced: UnplacedItem[] = plan.unplaced.map((u) => ({ ...u }));
  const placedPax = new Set<string>();
  const queue: Array<{ unit: OfferUnit; excluded: string[]; ups: Map<string, string> }> = plan.units.map((unit) => ({ unit, excluded: [], ups: upgrades }));
  while (queue.length) {
    const { unit, excluded, ups } = queue.shift()!;
    const ids = unit.rooms.flatMap((r) => r.paxIds);
    const members = ids.map((id) => paxById.get(id)!);
    const fail = (reason: string) => members.forEach((m) => unplaced.push({ paxId: m.id, pnr: m.pnr, reason }));
    try {
      await bookUnit(p.auth, c, batchId, groupByPnr.get(unit.pnr)!, unit, members, ups);
      ids.forEach((id) => placedPax.add(id));
    } catch (e) {
      if (e instanceof AppError && (e.code === 'SOLD_OUT' || e.code === 'NO_CONTRACT_RATE') && unit.rooms.some((r) => ups.has(roomKey(r)))) {
        fail('UPGRADE_NO_ROOM'); // hạng nâng vừa hết phòng giữa lúc kiểm và giữ: báo, không hạ cấp/đổi KS âm thầm
      } else if (e instanceof AppError && (e.code === 'SOLD_OUT' || e.code === 'NO_CONTRACT_RATE')) {
        const ex = [...excluded, unit.hotelId];
        const fresh = await candidateHotels(c, ex).catch(() => null);
        if (!fresh) fail('NO_ROOM');
        else {
          const re = planRooms({ pax: members.map(toPlanPax), hotels: fresh.hotels, policy: c.payer.sharedRoomPolicy, excludedHotelIds: ex });
          re.unplaced.forEach((u) => unplaced.push({ ...u }));
          re.units.forEach((u) => queue.push({ unit: u, excluded: ex, ups: new Map() }));
        }
      } else {
        logger.error({ err: e, batchId }, 'Đặt phòng cho một đơn vị của lô thất bại');
        fail('BOOKING_FAILED');
      }
    }
  }

  // Khách chưa xếp được: nhả chỗ (group_id null) để nhân viên đặt lại/xử lý tay; nhóm không còn khách nào thì FAILED.
  const unplacedIds = unplaced.map((u) => u.paxId).filter((id) => !placedPax.has(id));
  await withTransaction(async (tx) => {
    if (unplacedIds.length) await tx.query('UPDATE delay_flight_pax SET group_id = NULL, updated_at = now() WHERE id = ANY($1::uuid[])', [unplacedIds]);
    await tx.query(`UPDATE delay_groups g SET status = 'FAILED', updated_at = now() WHERE batch_id = $1 AND NOT EXISTS (SELECT 1 FROM delay_room_offers o WHERE o.group_id = g.id)`, [batchId]);
    await tx.query('UPDATE delay_batches SET status = $2, result = $3::jsonb, updated_at = now() WHERE id = $1', [batchId, placedPax.size ? 'PLACING' : 'CANCELLED', json({ unplaced: unplaced.filter((u) => !placedPax.has(u.paxId)) })]);
  });
  return getBatch(p.auth, batchId);
}

async function bookUnit(auth: AuthContext, c: Ctx, batchId: string, groupId: string, unit: OfferUnit, members: DelayFlightPaxDoc[], ups: Map<string, string>) {
  const w = await windowRule(c.newDep);
  const minutes = (await db.query<{ m: number }>(`SELECT (a->>'minutes')::int AS m FROM hotels h, jsonb_array_elements(h.airports) a WHERE h.id = $1 AND upper(a->>'iata') = upper($2) LIMIT 1`, [unit.hotelId, c.flight.origin])).rows[0]?.m ?? 0;
  const stay = w.of(minutes);
  if (stay.to.getTime() - stay.from.getTime() < min(MIN_STAY_MIN)) throw new AppError(409, 'SOLD_OUT', 'Khung ở quá ngắn ở khách sạn này'); // thử KS khác
  let roomVnd = 0, deltaVnd = 0;
  let upgradeFrom: string | null = null;
  const qty = new Map<string, number>();
  const finalTypes: string[] = [];
  for (const r of unit.rooms) {
    const rate = await loadContractRate(c.payerId, r.roomTypeId, stay.from, stay.to);
    if (!rate) throw new AppError(409, 'NO_CONTRACT_RATE', 'Không còn giá hợp đồng');
    const stdPrice = contractPrice(rate, stay.from, stay.to);
    const upTo = ups.get(roomKey(r));
    let type = r.roomTypeId, price = stdPrice;
    if (upTo) { // giá hợp đồng của hạng ĐÃ nâng; phần chênh lưu riêng cho kết toán
      const up = await loadContractRate(c.payerId, upTo, stay.from, stay.to);
      if (!up || contractPrice(up, stay.from, stay.to) <= stdPrice) throw new AppError(409, 'NO_CONTRACT_RATE', 'Không còn giá hợp đồng cho hạng nâng');
      type = upTo; price = contractPrice(up, stay.from, stay.to); deltaVnd += price - stdPrice; upgradeFrom = r.roomTypeId;
    }
    roomVnd += price;
    finalTypes.push(type);
    qty.set(type, (qty.get(type) ?? 0) + 1);
  }
  const g = guestOf(c, members);
  const booking = await createPayerBooking({
    hotelId: unit.hotelId, rooms: [...qty].map(([roomTypeId, q]) => ({ roomTypeId, qty: q })), from: stay.from, to: stay.to,
    guest: { fullName: g.fullName, phone: g.phone!, ...(g.email && { email: g.email }) },
    guests: members.filter((m) => m.category !== 'INFANT').length, children: members.filter((m) => m.category === 'CHILD').length,
    batchId, groupId, simulated: members.some((m) => m.simulated), contractRoomVnd: roomVnd,
  }, undefined, actorOf(auth));
  await withTransaction(async (tx) => {
    const offerId = (await tx.query<{ id: string }>(
      `INSERT INTO delay_room_offers (batch_id, group_id, booking_id, hotel_id, room_type_id, qty, status, expires_at, pax_ids, upgrade_from_room_type_id, upgrade_delta_vnd) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8::uuid[],$9,$10) RETURNING id`,
      [batchId, groupId, booking.id, unit.hotelId, finalTypes[0]!, unit.rooms.length, booking.expiresAt!, members.map((m) => m.id), upgradeFrom, deltaVnd || null],
    )).rows[0]!.id;
    await publishOffer(offerId, tx); // phát delay:offer cho KS sau commit
    await tx.query("UPDATE delay_groups SET status = 'OFFERED', updated_at = now() WHERE id = $1", [groupId]);
  });
}

// ---------- xem lô ----------
export async function getBatch(auth: AuthContext, batchId: string) {
  const { payerId, stationId } = payerScope(auth);
  const b = (await db.query<{ id: string; flightId: string; status: string; simulated: boolean; createdAt: Date; pickupPoint: string | null; result: { unplaced?: UnplacedItem[] } }>(
    'SELECT id, flight_id, status, simulated, created_at, pickup_point, result FROM delay_batches WHERE id = $1 AND payer_id = $2 AND ($3::uuid IS NULL OR station_id = $3)', [batchId, payerId, stationId])).rows[0];
  if (!b) throw new AppError(404, 'BATCH_NOT_FOUND', 'Không tìm thấy lô đặt phòng');
  const groups = (await db.query<{ id: string; code: string | null; pnr: string; noSplit: boolean; status: string }>('SELECT id, code, pnr, no_split, status FROM delay_groups WHERE batch_id = $1 ORDER BY code', [batchId])).rows;
  const offers = (
    await db.query<{ id: string; groupId: string; hotelId: string; hotelName: string; roomTypeId: string; roomTypeName: string; qty: number; status: string; expiresAt: Date; roomNumbers: string[]; transferCount: number; rejectReason: string | null; paxIds: string[]; bookingCode: string | null; upgradeFromRoomTypeName: string | null; upgradeDeltaVnd: number | null; extensionStatus: string; proposedLeaveAt: Date | null }>(
      `SELECT o.id, o.group_id, o.hotel_id, h.name AS hotel_name, o.room_type_id, t.name AS room_type_name, o.qty, o.status, o.expires_at, o.room_numbers, o.transfer_count, o.reject_reason, o.pax_ids, bk.code AS booking_code, ut.name AS upgrade_from_room_type_name, o.upgrade_delta_vnd, o.extension_status, o.proposed_leave_at
       FROM delay_room_offers o JOIN hotels h ON h.id = o.hotel_id JOIN room_types t ON t.id = o.room_type_id LEFT JOIN room_types ut ON ut.id = o.upgrade_from_room_type_id LEFT JOIN bookings bk ON bk.id = o.booking_id
       WHERE o.batch_id = $1 ORDER BY o.seq`, [batchId])
  ).rows;
  const now = Date.now();
  const codeOf = new Map(groups.map((g) => [g.id, g.code]));
  return {
    id: b.id, flightId: b.flightId, status: b.status, simulated: b.simulated, createdAt: new Date(b.createdAt).toISOString(), pickupPoint: b.pickupPoint,
    groups: groups.map((g) => ({ id: g.id, code: g.code, pnr: g.pnr, noSplit: g.noSplit, status: g.status })),
    offers: offers.map((o) => ({
      id: o.id, groupId: o.groupId, groupCode: codeOf.get(o.groupId) ?? null, hotelId: o.hotelId, hotelName: o.hotelName, roomTypeId: o.roomTypeId, roomTypeName: o.roomTypeName, qty: o.qty,
      status: o.status, bookingCode: o.bookingCode, expiresAt: new Date(o.expiresAt).toISOString(),
      secondsLeft: o.status === 'PENDING' ? Math.max(0, Math.ceil((new Date(o.expiresAt).getTime() - now) / 1000)) : null, // đếm ngược 5'
      roomNumbers: o.roomNumbers, transferCount: o.transferCount, rejectReason: o.rejectReason, paxIds: o.paxIds,
      upgradedFrom: o.upgradeFromRoomTypeName ?? null, upgradeDeltaVnd: o.upgradeDeltaVnd ?? null, // nâng hạng: tên hạng chuẩn ban đầu + phần chênh khách tự trả đơn vị chi trả
      extensionStatus: o.extensionStatus, proposedLeaveAt: o.proposedLeaveAt ? new Date(o.proposedLeaveAt).toISOString() : null,
    })),
    unplaced: b.result.unplaced ?? [],
  };
}

// ---------- sửa liên hệ hành khách ----------
export const paxContactBody = z.object({ email: z.string().trim().toLowerCase().email('Email không hợp lệ').max(200).optional(), phone: lookupBody.shape.phone.optional() }).strict().refine((b) => b.email !== undefined || b.phone !== undefined, { message: 'Cần email hoặc phone' });

/** Bản sửa nằm ở contact_email/contact_phone (áp dụng cho đơn); email/phone gốc của hãng giữ nguyên. */
export async function updatePassengerContact(auth: AuthContext, paxId: string, raw: { email?: string; phone?: string }) {
  const { payerId, stationId } = payerScope(auth);
  const body = paxContactBody.parse(raw);
  const pax = (await db.query<DelayFlightPaxDoc>('SELECT * FROM delay_flight_pax WHERE id = $1 AND payer_id = $2 AND ($3::uuid IS NULL OR station_id = $3)', [paxId, payerId, stationId])).rows[0];
  if (!pax) throw new AppError(404, 'PASSENGER_NOT_FOUND', 'Không tìm thấy hành khách');
  const before = { email: emailOf(pax), phone: phoneOf(pax) };
  const after = { email: body.email ?? before.email, phone: body.phone ?? before.phone };
  await withTransaction(async (tx) => {
    await tx.query('UPDATE delay_flight_pax SET contact_email = COALESCE($2, contact_email), contact_phone = COALESCE($3, contact_phone), updated_at = now() WHERE id = $1', [paxId, body.email ?? null, body.phone ?? null]);
    await writeAudit({ actor: actorOf(auth), action: 'DELAY.PAX_CONTACT_UPDATE', entity: { type: 'delay_flight_pax', id: paxId }, before, after }, tx);
  });
  return { id: paxId, email: after.email, phone: after.phone };
}
