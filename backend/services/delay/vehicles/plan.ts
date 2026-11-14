// Xếp xe thuần (không DB/IO) cho đợt khách delay của MỘT khách sạn + một chuyến bay/điểm đón.
// Không đụng dispatch.ts (luồng khách lẻ). Spec: docs/superpowers/specs/2026-11-14-airport-delay-booking-design.md mục 6.6.
import type { PaxCategory } from '@airrest/shared-types';

export interface DelayPax {
  id: string;
  pnr: string;
  age: number;
  category: PaxCategory;
  heightM?: number;
  specialNeeds?: string[];
  /** Cụm không tách (vd. nhóm có trẻ em): cùng clusterId thì luôn cùng một xe. Không có = khách lẻ. */
  clusterId?: string;
}
export interface DelayVehicle {
  id: string;
  /** Ghế hành khách, không tính tài xế (gồm cả ghế cạnh tài xế). */
  seats: number;
  childSeats: number;
  kind?: string;
}
export interface DelayVehiclePlanInput {
  paxes: DelayPax[];
  fleet: DelayVehicle[];
  /** Số ghế trước không dành cho trẻ <10 tuổi / <1,35 m. Mặc định 1. */
  frontSeatsRestricted?: number;
}
export type DelayPlanWarningCode = 'INFANT_WITHOUT_ADULT' | 'CHILD_WITHOUT_ADULT' | 'WHEELCHAIR' | 'PNR_SPLIT';
export interface DelayPlanWarning { code: DelayPlanWarningCode; vehicleId?: string; paxIds: string[]; message: string }
export interface DelayVehicleAssignment {
  vehicleId: string;
  paxIds: string[];
  clusterIds: string[];
  pnrs: string[];
  seatsUsed: number;
  spareSeats: number;
}
export interface DelayExternalGroup { paxIds: string[]; clusterIds: string[]; pnrs: string[]; reason: 'NO_FREE_VEHICLE' | 'EXCEEDS_VEHICLE' }
export interface DelayVehiclePlan { vehicles: DelayVehicleAssignment[]; external: DelayExternalGroup[]; warnings: DelayPlanWarning[] }

interface Unit { paxIds: string[]; clusterIds: string[]; pnrs: string[]; seats: number; restricted: number; childNeed: number; hasChild: boolean }
interface Load { seats: number; restricted: number; childNeed: number }

const NODE_BUDGET = 4000;
const COMBO_CAP = 30000; // shortcut: đội xe lớn (>~20) có thể cắt bớt tổ hợp, nâng cấp bằng DP khi cần

const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const restrictedPax = (p: DelayPax) => p.category !== 'INFANT' && (p.age < 10 || (p.heightM !== undefined && p.heightM < 1.35));

function mkUnit(ps: DelayPax[]): Unit {
  const ids = ps.map((p) => p.id).sort(lt);
  return {
    paxIds: ids,
    clusterIds: [...new Set(ps.map((p) => p.clusterId).filter((c): c is string => !!c))].sort(lt),
    pnrs: [...new Set(ps.map((p) => p.pnr))].sort(lt),
    seats: ps.filter((p) => p.category !== 'INFANT').length,
    restricted: ps.filter(restrictedPax).length,
    childNeed: ps.filter((p) => p.category !== 'INFANT' && p.age < 10).length, // chỉ trẻ 2-9 tuổi cần ghế trẻ em
    hasChild: ps.some((p) => p.category !== 'ADULT'),
  };
}
const mergeUnits = (us: Unit[]): Unit => ({
  paxIds: us.flatMap((u) => u.paxIds).sort(lt),
  clusterIds: [...new Set(us.flatMap((u) => u.clusterIds))].sort(lt),
  pnrs: [...new Set(us.flatMap((u) => u.pnrs))].sort(lt),
  seats: us.reduce((s, u) => s + u.seats, 0),
  restricted: us.reduce((s, u) => s + u.restricted, 0),
  childNeed: us.reduce((s, u) => s + u.childNeed, 0),
  hasChild: us.some((u) => u.hasChild),
});
const key = (u: Unit) => u.paxIds[0]!;

const fits = (l: Load, v: DelayVehicle, front: number) =>
  l.seats <= v.seats && l.restricted <= v.seats - Math.min(front, v.seats) && l.childNeed <= v.childSeats;
const add = (l: Load, u: Unit): Load => ({ seats: l.seats + u.seats, restricted: l.restricted + u.restricted, childNeed: l.childNeed + u.childNeed });

/** Backtracking: xếp hết units vào fleet; trả mảng chỉ số xe cho từng unit hoặc null. */
function feasible(units: Unit[], fleet: DelayVehicle[], front: number): number[] | null {
  const order = units.map((_, i) => i).sort((a, b) => units[b]!.seats - units[a]!.seats || units[b]!.restricted - units[a]!.restricted || lt(key(units[a]!), key(units[b]!)));
  const loads: Load[] = fleet.map(() => ({ seats: 0, restricted: 0, childNeed: 0 }));
  const res = new Array<number>(units.length).fill(-1);
  let nodes = 0;
  const go = (k: number): boolean => {
    if (k === order.length) return true;
    if (++nodes > NODE_BUDGET) return false;
    const ui = order[k]!;
    const seen = new Set<string>();
    for (let j = 0; j < fleet.length; j++) {
      const l = loads[j]!;
      const nl = add(l, units[ui]!);
      if (!fits(nl, fleet[j]!, front)) continue;
      const sig = `${fleet[j]!.seats}|${fleet[j]!.childSeats}|${l.seats}|${l.restricted}|${l.childNeed}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      loads[j] = nl; res[ui] = j;
      if (go(k + 1)) return true;
      loads[j] = l;
    }
    return false;
  };
  return go(0) ? res : null;
}

/** Ít xe nhất; cùng số xe thì tổng ghế nhỏ nhất (= ít ghế thừa nhất). Xe tie-break theo (seats, id). */
function packMin(units: Unit[], fleet: DelayVehicle[], front: number): { fleetIdx: number[]; assign: number[] } | null {
  if (!units.length) return { fleetIdx: [], assign: [] };
  const need = units.reduce((s, u) => s + u.seats, 0);
  const n = fleet.length;
  let kmin = 1, cap = 0;
  const desc = fleet.map((v) => v.seats).sort((a, b) => b - a);
  for (; kmin <= n; kmin++) { cap += desc[kmin - 1]!; if (cap >= need) break; }
  for (let k = Math.max(kmin, 1); k <= n; k++) {
    const subsets: { idx: number[]; total: number }[] = [];
    const rec = (start: number, idx: number[], total: number) => {
      if (subsets.length >= COMBO_CAP) return;
      if (idx.length === k) { if (total >= need) subsets.push({ idx: [...idx], total }); return; }
      for (let i = start; i <= n - (k - idx.length); i++) { idx.push(i); rec(i + 1, idx, total + fleet[i]!.seats); idx.pop(); }
    };
    rec(0, [], 0);
    subsets.sort((a, b) => a.total - b.total || lt(a.idx.join(','), b.idx.join(',')));
    for (const s of subsets) {
      const a = feasible(units, s.idx.map((i) => fleet[i]!), front);
      if (a) return { fleetIdx: s.idx, assign: a.map((j) => s.idx[j]!) };
    }
  }
  return null;
}

interface Packed { placed: Unit[]; external: { unit: Unit; reason: DelayExternalGroup['reason'] }[]; used: Map<number, Unit[]> }

function packAll(units: Unit[], fleet: DelayVehicle[], front: number): Packed {
  const external: Packed['external'] = [];
  let cand: Unit[] = [];
  for (const u of units) {
    if (fleet.some((v) => fits(add({ seats: 0, restricted: 0, childNeed: 0 }, u), v, front))) cand.push(u);
    else external.push({ unit: u, reason: 'EXCEEDS_VEHICLE' });
  }
  if (!feasible(cand, fleet, front)) {
    // Hết xe: giữ cụm có trẻ em trước, rồi cụm lớn; cụm nào không vừa nữa thì ra xe ngoài nguyên cụm.
    const prio = [...cand].sort((a, b) => Number(b.hasChild) - Number(a.hasChild) || b.seats - a.seats || lt(key(a), key(b)));
    const kept: Unit[] = [];
    for (const u of prio) {
      if (feasible([...kept, u], fleet, front)) kept.push(u);
      else external.push({ unit: u, reason: 'NO_FREE_VEHICLE' });
    }
    cand = kept;
  }
  const packed = packMin(cand, fleet, front);
  const used = new Map<number, Unit[]>();
  if (packed) cand.forEach((u, i) => { const j = packed.assign[i]!; used.set(j, [...(used.get(j) ?? []), u]); });
  return { placed: cand, external, used };
}

function plan(input: DelayVehiclePlanInput, previous?: string[][]): DelayVehiclePlan {
  const front = input.frontSeatsRestricted ?? 1;
  const fleet = [...input.fleet].sort((a, b) => a.seats - b.seats || a.childSeats - b.childSeats || lt(a.id, b.id));
  const paxes = [...input.paxes].sort((a, b) => lt(a.id, b.id));
  const byId = new Map(paxes.map((p) => [p.id, p]));

  // Đơn vị nguyên tử: cụm không tách hoặc khách lẻ.
  const groups = new Map<string, DelayPax[]>();
  for (const p of paxes) groups.set(p.clusterId ? `c:${p.clusterId}` : `p:${p.id}`, [...(groups.get(p.clusterId ? `c:${p.clusterId}` : `p:${p.id}`) ?? []), p]);
  const base = [...groups.values()].map(mkUnit).sort((a, b) => lt(key(a), key(b)));
  const unitOfPax = new Map<string, number>();
  base.forEach((u, i) => u.paxIds.forEach((id) => unitOfPax.set(id, i)));

  // Tập "ưu tiên cùng xe": nhóm xe chiều đi (nếu có) rồi nhóm cùng PNR; chỉ gộp khi gộp xong vẫn vừa một xe.
  const parent = base.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const fitsOne = (us: Unit[]) => { const m = mergeUnits(us); return fleet.some((v) => fits(m, v, front)); };
  const tryUnion = (idxs: number[]) => {
    const roots = [...new Set(idxs.map(find))].sort((a, b) => a - b);
    if (roots.length < 2) return;
    const members = base.map((_, i) => i).filter((i) => roots.includes(find(i)));
    if (!fitsOne(members.map((i) => base[i]!))) return;
    roots.slice(1).forEach((r) => (parent[r] = roots[0]!));
  };
  for (const g of previous ?? []) tryUnion(g.filter((id) => byId.has(id)).map((id) => unitOfPax.get(id)!));
  const pnrIdx = new Map<string, number[]>();
  base.forEach((u, i) => u.pnrs.forEach((p) => pnrIdx.set(p, [...(pnrIdx.get(p) ?? []), i])));
  for (const p of [...pnrIdx.keys()].sort(lt)) tryUnion(pnrIdx.get(p)!);
  const merged = new Map<number, Unit[]>();
  base.forEach((u, i) => merged.set(find(i), [...(merged.get(find(i)) ?? []), u]));
  const unitsA = [...merged.values()].map((us) => (us.length > 1 ? mergeUnits(us) : us[0]!)).sort((a, b) => lt(key(a), key(b)));

  const wants = [...(previous ?? []).map((g) => g.filter((id) => byId.has(id))), ...[...pnrIdx.values()].map((ix) => ix.flatMap((i) => base[i]!.paxIds))].filter((g) => g.length > 1);
  const broken = (p: Packed) => {
    const veh = new Map<string, number>();
    p.used.forEach((us, j) => us.forEach((u) => u.paxIds.forEach((id) => veh.set(id, j))));
    return wants.filter((g) => new Set(g.map((id) => veh.get(id))).size > 1).length;
  };
  const score = (p: Packed) => [-p.placed.reduce((s, u) => s + u.paxIds.length, 0), p.used.size, broken(p), [...p.used.entries()].reduce((s, [j, us]) => s + fleet[j]!.seats - us.reduce((t, u) => t + u.seats, 0), 0)];
  let best = packAll(unitsA, fleet, front);
  if (unitsA.length < base.length && !best.external.length) {
    const alt = packAll(base, fleet, front);
    const sa = score(best), sb = score(alt);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) { if (sb[i]! < sa[i]!) best = alt; break; }
  }

  const warnings: DelayPlanWarning[] = [];
  const vehicles: DelayVehicleAssignment[] = [...best.used.entries()].sort((a, b) => a[0] - b[0]).map(([j, us]) => {
    const v = fleet[j]!;
    const paxIds = us.flatMap((u) => u.paxIds).sort(lt);
    const ps = paxIds.map((id) => byId.get(id)!);
    const adults = ps.filter((p) => p.category === 'ADULT').length;
    const infants = ps.filter((p) => p.category === 'INFANT');
    if (infants.length > adults) warnings.push({ code: 'INFANT_WITHOUT_ADULT', vehicleId: v.id, paxIds: infants.map((p) => p.id), message: 'Em bé không có đủ người lớn đi cùng trên xe' });
    if (adults === 0 && ps.some((p) => p.category === 'CHILD')) warnings.push({ code: 'CHILD_WITHOUT_ADULT', vehicleId: v.id, paxIds, message: 'Trẻ em không có người lớn đi cùng trên xe' });
    const wc = ps.filter((p) => p.specialNeeds?.some((s) => s.toUpperCase() === 'WHEELCHAIR'));
    if (wc.length) warnings.push({ code: 'WHEELCHAIR', vehicleId: v.id, paxIds: wc.map((p) => p.id), message: 'Có khách xe lăn, cần xác nhận xe/tài xế hỗ trợ' });
    const seatsUsed = us.reduce((s, u) => s + u.seats, 0);
    return { vehicleId: v.id, paxIds, clusterIds: [...new Set(us.flatMap((u) => u.clusterIds))].sort(lt), pnrs: [...new Set(us.flatMap((u) => u.pnrs))].sort(lt), seatsUsed, spareSeats: v.seats - seatsUsed };
  });
  const veh = new Map<string, string>();
  vehicles.forEach((v) => v.paxIds.forEach((id) => veh.set(id, v.vehicleId)));
  for (const [pnr, ix] of [...pnrIdx.entries()].sort((a, b) => lt(a[0], b[0]))) {
    const ids = ix.flatMap((i) => base[i]!.paxIds);
    if (new Set(ids.map((id) => veh.get(id) ?? 'EXT')).size > 1) warnings.push({ code: 'PNR_SPLIT', paxIds: ids.sort(lt), message: `PNR ${pnr} không đi cùng một xe` });
  }
  const external = best.external.map(({ unit, reason }) => ({ paxIds: unit.paxIds, clusterIds: unit.clusterIds, pnrs: unit.pnrs, reason })).sort((a, b) => lt(a.paxIds[0]!, b.paxIds[0]!));
  return { vehicles, external, warnings };
}

/** Chiều đi (KS -> điểm đón/sân bay tùy luồng): ít xe nhất, ít ghế thừa, cụm trẻ không tách, hết xe -> xe ngoài nguyên cụm. */
export function planDelayVehicles(input: DelayVehiclePlanInput): DelayVehiclePlan {
  return plan(input);
}

/** Chiều về sân bay: cùng quy tắc; truyền phương án chiều đi (hoặc mảng paxIds theo xe) để ưu tiên giữ nhóm xe. */
export function planDelayReturnVehicles(input: DelayVehiclePlanInput, outbound?: DelayVehiclePlan | string[][]): DelayVehiclePlan {
  const prev = Array.isArray(outbound) ? outbound : outbound?.vehicles.map((v) => v.paxIds);
  return plan(input, prev);
}
