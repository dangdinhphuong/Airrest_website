// Xếp phòng cho khách delay: hàm thuần, tham lam theo ưu tiên, tất định (spec 2026-11-14 mục 4, 6.3, 6.4).
import type { BedType, PaxCategory, SharedRoomPolicy } from '@airrest/shared-types';

export interface PlanPax { id: string; pnr: string; age: number; category: PaxCategory; isRepresentative: boolean; specialNeeds: string[] }
export interface PlanRoomType { roomTypeId: string; capacity: number; bedType: BedType; connecting: boolean; family: boolean; available: number; priceVnd: number }
// hotels phải đã sắp theo gần nhất; KS chưa có giá hợp đồng/đã từ chối thì caller loại (hoặc đưa vào excludedHotelIds).
export interface PlanHotel { hotelId: string; roomTypes: PlanRoomType[] }
export interface PlanInput {
  pax: PlanPax[];
  hotels: PlanHotel[];
  policy?: SharedRoomPolicy; // mặc định PRIVATE
  excludedHotelIds?: string[];
  preferredHotelIdsByPnr?: Record<string, string[]>; // KS nơi người cùng nhóm đã xác nhận
}
export interface PlannedRoom { roomTypeId: string; paxIds: string[] }
// Một phòng (rooms.length=1) hoặc một cụm phòng thông nhau (connecting) không tách được.
export interface OfferUnit {
  id: string; pnr: string; hotelId: string; rooms: PlannedRoom[];
  cluster: boolean; // có trẻ/em bé: cả đơn vị chuyển KS cùng nhau
  adjacent: boolean; // yêu cầu sát nhau (KS cam kết khi nhập số phòng)
  connecting: boolean; // yêu cầu phòng thông nhau
}
export type UnplacedReason = 'CHILD_WITHOUT_ADULT' | 'NO_ROOM_FOR_CLUSTER' | 'NO_ROOM';
export interface Unplaced { paxId: string; pnr: string; reason: UnplacedReason }
export interface RoomPlan { units: OfferUnit[]; unplaced: Unplaced[] }

type Item = { kind: 'cluster'; adults: PlanPax[]; kids: PlanPax[]; infants: PlanPax[] } | { kind: 'solo'; people: PlanPax[] };
type Avail = Map<string, number>;
interface Fit { rooms: PlannedRoom[]; connecting: boolean }
interface Placed extends Fit { hotelId: string }

const key = (h: string, t: string) => `${h}|${t}`;
const left = (a: Avail, h: PlanHotel, t: PlanRoomType) => a.get(key(h.hotelId, t.roomTypeId)) ?? 0;
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const bedRank = (b: BedType) => (b === 'TWIN' ? 0 : b === 'DOUBLE' ? 1 : 2);
// Người đi lẻ: phòng đơn, hết thì twin rồi đôi.
const soloRank = (b: BedType) => (b === 'SINGLE' ? 0 : b === 'TWIN' ? 1 : b === 'DOUBLE' ? 2 : 3);
const byCap = (a: PlanRoomType, b: PlanRoomType) => a.capacity - b.capacity || a.priceVnd - b.priceVnd || cmpStr(a.roomTypeId, b.roomTypeId);
const byId = (a: PlanPax, b: PlanPax) => cmpStr(a.id, b.id);

function fitCluster(it: Extract<Item, { kind: 'cluster' }>, h: PlanHotel, avail: Avail): Fit | null {
  const seats = it.adults.length + it.kids.length; // em bé ngủ chung, không tính chỗ
  const types = h.roomTypes.filter((t) => t.capacity >= 1 && left(avail, h, t) > 0);
  const ids = (xs: PlanPax[]) => xs.map((p) => p.id);
  const one = types.filter((t) => t.capacity >= seats).sort((a, b) => Number(b.family) - Number(a.family) || byCap(a, b))[0];
  if (one) {
    avail.set(key(h.hotelId, one.roomTypeId), left(avail, h, one) - 1);
    return { rooms: [{ roomTypeId: one.roomTypeId, paxIds: [...ids(it.adults), ...ids(it.kids), ...ids(it.infants)] }], connecting: false };
  }
  // Cụm phòng thông nhau: chọn tham lam, phòng cuối là phòng nhỏ nhất đủ chỗ; mỗi phòng cần >=1 người lớn.
  const local = new Map(avail);
  const used: PlanRoomType[] = [];
  for (let rem = seats; rem > 0; ) {
    const c = types.filter((t) => t.connecting && left(local, h, t) > 0);
    if (!c.length || used.length >= it.adults.length) return null;
    const t = c.filter((x) => x.capacity >= rem).sort(byCap)[0] ?? c.sort((a, b) => b.capacity - a.capacity || byCap(a, b))[0]!;
    used.push(t);
    local.set(key(h.hotelId, t.roomTypeId), left(local, h, t) - 1);
    rem -= t.capacity;
  }
  const rooms = used.map((t) => ({ roomTypeId: t.roomTypeId, paxIds: [] as string[], cap: t.capacity }));
  rooms.forEach((r, i) => r.paxIds.push(it.adults[i]!.id));
  rooms[0]!.paxIds.push(...ids(it.infants));
  for (const p of [...it.adults.slice(rooms.length), ...it.kids]) {
    const r = rooms.find((x) => x.paxIds.filter((i) => !it.infants.some((f) => f.id === i)).length < x.cap);
    if (!r) return null;
    r.paxIds.push(p.id);
  }
  local.forEach((v, k) => avail.set(k, v));
  return { rooms: rooms.map(({ roomTypeId, paxIds }) => ({ roomTypeId, paxIds })), connecting: true };
}

function fitSolo(people: PlanPax[], h: PlanHotel, avail: Avail): Fit | null {
  const n = people.length;
  const t = h.roomTypes
    .filter((x) => x.capacity >= n && left(avail, h, x) > 0)
    .sort((a, b) => Number(a.family) - Number(b.family) || (n > 1 ? bedRank(a.bedType) - bedRank(b.bedType) : soloRank(a.bedType) - soloRank(b.bedType) || Number(a.connecting) - Number(b.connecting)) || byCap(a, b))[0];
  if (!t) return null;
  avail.set(key(h.hotelId, t.roomTypeId), left(avail, h, t) - 1);
  return { rooms: [{ roomTypeId: t.roomTypeId, paxIds: people.map((p) => p.id) }], connecting: false };
}

const fit = (it: Item, h: PlanHotel, a: Avail) => (it.kind === 'cluster' ? fitCluster(it, h, a) : fitSolo(it.people, h, a));

// Xếp các item của một nhóm: ưu tiên một KS chứa hết, không thì tách theo item (không tách item).
function placeItems(items: Item[], hotels: PlanHotel[], avail: Avail): (Placed | null)[] {
  for (const h of hotels) {
    const a = new Map(avail);
    const res = items.map((it) => { const f = fit(it, h, a); return f && { ...f, hotelId: h.hotelId }; });
    if (res.every(Boolean)) { a.forEach((v, k) => avail.set(k, v)); return res; }
  }
  const used: PlanHotel[] = [];
  return items.map((it) => {
    for (const h of [...used, ...hotels.filter((x) => !used.includes(x))]) {
      const f = fit(it, h, avail);
      if (f) { if (!used.includes(h)) used.push(h); return { ...f, hotelId: h.hotelId }; }
    }
    return null;
  });
}

const orderHotels = (hotels: PlanHotel[], excluded: Set<string>, preferred: string[] = []) => {
  const ok = hotels.filter((h) => !excluded.has(h.hotelId));
  return [...preferred.flatMap((id) => ok.filter((h) => h.hotelId === id)), ...ok.filter((h) => !preferred.includes(h.hotelId))];
};
const makeAvail = (hotels: PlanHotel[]): Avail =>
  new Map(hotels.flatMap((h) => h.roomTypes.map((t) => [key(h.hotelId, t.roomTypeId), t.available] as const)));
const failReason = (it: Item): UnplacedReason => (it.kind === 'cluster' ? 'NO_ROOM_FOR_CLUSTER' : 'NO_ROOM');
const itemPax = (it: Item) => (it.kind === 'cluster' ? [...it.adults, ...it.kids, ...it.infants] : it.people);

function toUnits(pnr: string, items: Item[], placed: (Placed | null)[], nextId: () => string, units: OfferUnit[], unplaced: Unplaced[]) {
  const perHotel = new Map<string, number>();
  placed.forEach((p) => p && perHotel.set(p.hotelId, (perHotel.get(p.hotelId) ?? 0) + p.rooms.length));
  placed.forEach((p, i) => {
    if (!p) { itemPax(items[i]!).forEach((x) => unplaced.push({ paxId: x.id, pnr, reason: failReason(items[i]!) })); return; }
    units.push({ id: nextId(), pnr, hotelId: p.hotelId, rooms: p.rooms, cluster: items[i]!.kind === 'cluster', adjacent: perHotel.get(p.hotelId)! >= 2, connecting: p.connecting });
  });
}

export function planRooms(input: PlanInput): RoomPlan {
  const { pax, policy = 'PRIVATE', preferredHotelIdsByPnr = {} } = input;
  const excluded = new Set(input.excludedHotelIds);
  const avail = makeAvail(input.hotels);
  const units: OfferUnit[] = [];
  const unplaced: Unplaced[] = [];
  let n = 0;
  const nextId = () => `u${++n}`;

  const byPnr = new Map<string, PlanPax[]>();
  for (const p of [...pax].sort(byId)) byPnr.set(p.pnr, [...(byPnr.get(p.pnr) ?? []), p]);
  const prio = (g: PlanPax[]) => [g.some((p) => p.category !== 'ADULT') ? 0 : 1, g.some((p) => p.age >= 65 || p.specialNeeds.length) ? 0 : 1, -g.length];
  const groups = [...byPnr.entries()].sort(([ka, a], [kb, b]) => {
    const pa = prio(a), pb = prio(b);
    return pa[0]! - pb[0]! || pa[1]! - pb[1]! || pa[2]! - pb[2]! || cmpStr(ka, kb);
  });

  const maxCap = Math.max(0, ...input.hotels.filter((h) => !excluded.has(h.hotelId)).flatMap((h) => h.roomTypes.filter((t) => t.available > 0).map((t) => t.capacity)));
  const pool: PlanPax[] = []; // SHARED: người lẻ chờ ghép chéo nhóm
  for (const [pnr, members] of groups) {
    const adults = members.filter((p) => p.category === 'ADULT');
    const deps = members.filter((p) => p.category !== 'ADULT');
    const items: Item[] = [];
    let rest = adults;
    if (deps.length) {
      if (!adults.length) { deps.forEach((x) => unplaced.push({ paxId: x.id, pnr, reason: 'CHILD_WITHOUT_ADULT' })); }
      else {
        const rep = adults.find((a) => a.isRepresentative) ?? adults[0]!;
        const kids = deps.filter((d) => d.category === 'CHILD');
        // Không phòng nào chứa nổi rep + trẻ: các người lớn khác cùng PNR vào cụm để mỗi phòng thông nhau có người lớn.
        const split = 1 + kids.length > maxCap;
        rest = split ? [] : adults.filter((a) => a !== rep);
        items.push({ kind: 'cluster', adults: split ? [rep, ...adults.filter((a) => a !== rep)] : [rep], kids, infants: deps.filter((d) => d.category === 'INFANT') });
      }
    }
    if (policy === 'SHARED') {
      for (let i = 0; i + 1 < rest.length; i += 2) items.push({ kind: 'solo', people: [rest[i]!, rest[i + 1]!] });
      if (rest.length % 2) pool.push(rest[rest.length - 1]!);
    } else rest.forEach((a) => items.push({ kind: 'solo', people: [a] }));
    if (!items.length) continue;
    const placed = placeItems(items, orderHotels(input.hotels, excluded, preferredHotelIdsByPnr[pnr]), avail);
    toUnits(pnr, items, placed, nextId, units, unplaced);
  }

  const hotels = orderHotels(input.hotels, excluded);
  for (let i = 0; i < pool.length; i += 2) {
    const pair = pool.slice(i, i + 2);
    const items: Item[] = [{ kind: 'solo', people: pair }];
    const placed = placeItems(items, hotels, avail);
    if (!placed[0] && pair.length === 2) { // không còn phòng đôi: thử phòng đơn riêng
      const singles: Item[] = pair.map((p) => ({ kind: 'solo', people: [p] }));
      singles.forEach((s) => toUnits(s.kind === 'solo' ? s.people[0]!.pnr : '', [s], placeItems([s], hotels, avail), nextId, units, unplaced));
      continue;
    }
    toUnits(pair[0]!.pnr, items, placed, nextId, units, unplaced);
  }
  return { units, unplaced };
}

export interface ReplanInput {
  pax: PlanPax[];
  hotels: PlanHotel[]; // tồn phòng hiện tại (đã trả lại phòng của unit hỏng), gần nhất trước
  units: OfferUnit[]; // phương án hiện hành
  failedUnitIds: string[]; // hủy/từ chối/quá hạn
  excludedHotelIds?: string[];
  rejectedHotelIdsByUnit?: Record<string, string[]>;
  confirmedHotelIdsByPnr?: Record<string, string[]>;
}
export interface Replacement { replaces: string; unit: OfferUnit }
export interface ReplanResult { replacements: Replacement[]; unplaced: Unplaced[] }

// Cụm chuyển nguyên cụm sang KS khác; phòng độc lập chuyển riêng (được tách KS), ưu tiên KS nơi người cùng nhóm đã xác nhận.
export function replan(input: ReplanInput): ReplanResult {
  const avail = makeAvail(input.hotels);
  const byId = new Map(input.pax.map((p) => [p.id, p]));
  const failed = new Set(input.failedUnitIds);
  const replacements: Replacement[] = [];
  const unplaced: Unplaced[] = [];
  const alive = input.units.filter((u) => !failed.has(u.id));
  for (const old of input.units.filter((u) => failed.has(u.id))) {
    const people = old.rooms.flatMap((r) => r.paxIds).map((id) => byId.get(id)).filter((p): p is PlanPax => !!p);
    const adults = people.filter((p) => p.category === 'ADULT');
    const item: Item = old.cluster && adults.length
      ? { kind: 'cluster', adults, kids: people.filter((p) => p.category === 'CHILD'), infants: people.filter((p) => p.category === 'INFANT') }
      : { kind: 'solo', people };
    const excluded = new Set([...(input.excludedHotelIds ?? []), ...(input.rejectedHotelIdsByUnit?.[old.id] ?? []), old.hotelId]);
    const [p] = placeItems([item], orderHotels(input.hotels, excluded, input.confirmedHotelIdsByPnr?.[old.pnr]), avail);
    if (!p) { itemPax(item).forEach((x) => unplaced.push({ paxId: x.id, pnr: x.pnr, reason: failReason(item) })); continue; }
    const sameHotelRooms = [...alive, ...replacements.map((r) => r.unit)].filter((u) => u.pnr === old.pnr && u.hotelId === p.hotelId).reduce((s, u) => s + u.rooms.length, 0);
    const unit: OfferUnit = { id: `${old.id}~`, pnr: old.pnr, hotelId: p.hotelId, rooms: p.rooms, cluster: old.cluster, adjacent: sameHotelRooms + p.rooms.length >= 2, connecting: p.connecting };
    replacements.push({ replaces: old.id, unit });
  }
  return { replacements, unplaced };
}
