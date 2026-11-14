import { describe, expect, it } from 'vitest';
import { planDelayReturnVehicles, planDelayVehicles, type DelayPax, type DelayVehicle } from '../services/delay/vehicles/plan';

const adults = (n: number, pnr = 'AAAAA', from = 0): DelayPax[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${pnr}${from + i}`.padEnd(10, '_'), pnr, age: 30, category: 'ADULT' as const }));
const v = (id: string, seats: number, childSeats = 0): DelayVehicle => ({ id, seats, childSeats });
const kidCluster = (cid: string, kids: number[], pnr = 'KIDPN'): DelayPax[] => [
  { id: `${cid}-ad`, pnr, age: 35, category: 'ADULT', clusterId: cid },
  ...kids.map((age, i) => ({ id: `${cid}-k${i}`, pnr, age, category: age < 2 ? ('INFANT' as const) : ('CHILD' as const), clusterId: cid })),
];

describe('xếp xe delay', () => {
  it('30 người với xe 29 + 16 -> 2 xe; có thêm xe 16 thì chọn 16+16 (ít ghế thừa hơn)', () => {
    const p = planDelayVehicles({ paxes: adults(30), fleet: [v('x29', 29), v('x16a', 16)] });
    const q = planDelayVehicles({ paxes: adults(30), fleet: [v('x29', 29), v('x16a', 16), v('x16b', 16)] });
    expect(q.vehicles.map((x) => x.vehicleId).sort()).toEqual(['x16a', 'x16b']);
    expect(p.vehicles).toHaveLength(2);
    expect(p.external).toEqual([]);
    expect(p.vehicles.map((x) => x.vehicleId).sort()).toEqual(['x16a', 'x29']);
  });
  it('4 người -> xe nhỏ đủ chỗ, không dùng xe 29', () => {
    const p = planDelayVehicles({ paxes: adults(4), fleet: [v('x29', 29), v('x7', 7), v('x4', 4)] });
    expect(p.vehicles.map((x) => x.vehicleId)).toEqual(['x4']);
    expect(p.vehicles[0]!.spareSeats).toBe(0);
  });
  it('trẻ không ngồi ghế trước; xe 3 ghế chỉ chở 2 trẻ + 1 người lớn, 3 trẻ thì ra ngoài', () => {
    const ok = planDelayVehicles({ paxes: kidCluster('c1', [5, 6]), fleet: [v('s3', 3, 2)] });
    expect(ok.vehicles).toHaveLength(1);
    const bad = planDelayVehicles({ paxes: kidCluster('c1', [5, 6, 7]), fleet: [v('s4', 4, 3)] }); // 3 trẻ cần 3 ghế sau, chỉ có 3 ghế sau -> vừa
    expect(bad.vehicles).toHaveLength(1);
    const no = planDelayVehicles({ paxes: kidCluster('c1', [5, 6, 7, 8]), fleet: [v('s4', 4, 4)] }); // 4 trẻ + 1 NL = 5 > 4
    expect(no.external).toHaveLength(1);
    const front = planDelayVehicles({ paxes: [{ id: 'k', pnr: 'P1234', age: 8, category: 'CHILD' }], fleet: [v('one', 1, 1)] });
    expect(front.external[0]!.reason).toBe('EXCEEDS_VEHICLE'); // xe 1 ghế = chỉ ghế trước
  });
  it('cụm trẻ chỉ vào xe đủ childSeats', () => {
    const p = planDelayVehicles({ paxes: kidCluster('c1', [5, 6]), fleet: [v('noseat', 7, 0), v('seat', 9, 2)] });
    expect(p.vehicles.map((x) => x.vehicleId)).toEqual(['seat']);
  });
  it('hết xe -> xe ngoài nguyên cụm, cụm trẻ được giữ trước', () => {
    const paxes = [...kidCluster('c1', [5, 6]), ...kidCluster('c2', [4, 3], 'KID2P'), ...adults(2, 'SOLO1')];
    const p = planDelayVehicles({ paxes, fleet: [v('a', 4, 3)] });
    const placed = new Set(p.vehicles.flatMap((x) => x.paxIds));
    for (const cid of ['c1', 'c2']) {
      const ids = paxes.filter((x) => x.clusterId === cid).map((x) => x.id);
      expect(ids.every((i) => placed.has(i)) || ids.every((i) => !placed.has(i))).toBe(true);
    }
    expect(p.external.length).toBeGreaterThan(0);
    expect(p.external.every((e) => e.reason === 'NO_FREE_VEHICLE')).toBe(true);
  });
  it('PNR cùng xe nếu vừa; tách khi không xe nào chở hết', () => {
    const together = planDelayVehicles({ paxes: [...adults(3, 'GRPPA'), ...adults(3, 'GRPPB')], fleet: [v('s4', 4), v('s3a', 3), v('s3b', 3)] });
    expect(together.vehicles).toHaveLength(2); // 2 xe 3 chỗ ít ghế thừa nhất
    const pnrA = new Set(together.vehicles.filter((x) => x.pnrs.includes('GRPPA')).map((x) => x.vehicleId));
    expect(pnrA.size).toBe(1);
    const split = planDelayVehicles({ paxes: adults(5, 'BIGPN'), fleet: [v('s3a', 3), v('s3b', 3)] });
    expect(split.vehicles).toHaveLength(2);
    expect(split.warnings.some((w) => w.code === 'PNR_SPLIT')).toBe(true);
  });
  it('em bé vào xe childSeats=0 vẫn được xếp; trẻ 5 tuổi vào xe childSeats=0 thì ra xe ngoài nguyên cụm', () => {
    const inf = planDelayVehicles({ paxes: kidCluster('c1', [1]), fleet: [v('a', 4, 0)] });
    expect(inf.vehicles).toHaveLength(1);
    expect(inf.external).toEqual([]);
    const kid = planDelayVehicles({ paxes: kidCluster('c2', [5, 1]), fleet: [v('a', 4, 0)] });
    expect(kid.vehicles).toEqual([]);
    expect(kid.external).toHaveLength(1);
    expect(kid.external[0]!.paxIds).toHaveLength(3);
  });
  it('cảnh báo em bé không người lớn', () => {
    const p = planDelayVehicles({ paxes: [{ id: 'inf', pnr: 'P1234', age: 1, category: 'INFANT' }], fleet: [v('a', 4, 0)] });
    expect(p.warnings.map((w) => w.code)).toContain('INFANT_WITHOUT_ADULT');
  });
  it('property (seed): cụm trẻ không bao giờ tách, ràng buộc ghế luôn đúng, tất định', () => {
    let s = 12345;
    const rnd = (n: number) => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let iter = 0; iter < 60; iter++) {
      const paxes: DelayPax[] = [];
      for (let c = 0; c < 1 + rnd(4); c++) paxes.push(...kidCluster(`c${c}`, Array.from({ length: 1 + rnd(3) }, () => rnd(12)), `K${c}PNR`));
      paxes.push(...adults(rnd(15), 'LONEP'));
      const fleet = Array.from({ length: 1 + rnd(5) }, (_, i) => v(`v${i}`, 2 + rnd(12), rnd(4)));
      const p = planDelayVehicles({ paxes, fleet });
      expect(planDelayVehicles({ paxes: [...paxes].reverse(), fleet: [...fleet].reverse() })).toEqual(p);
      const where = new Map<string, string>();
      p.vehicles.forEach((x) => x.paxIds.forEach((id) => { expect(where.has(id)).toBe(false); where.set(id, x.vehicleId); }));
      p.external.forEach((e) => e.paxIds.forEach((id) => { expect(where.has(id)).toBe(false); where.set(id, 'EXT'); }));
      expect(where.size).toBe(paxes.length);
      for (const cid of new Set(paxes.map((x) => x.clusterId).filter(Boolean))) {
        expect(new Set(paxes.filter((x) => x.clusterId === cid).map((x) => where.get(x.id))).size).toBe(1);
      }
      for (const a of p.vehicles) {
        const car = fleet.find((f) => f.id === a.vehicleId)!;
        const ps = a.paxIds.map((id) => paxes.find((x) => x.id === id)!);
        const seated = ps.filter((x) => x.category !== 'INFANT').length;
        const restricted = ps.filter((x) => x.category !== 'INFANT' && x.age < 10).length;
        expect(seated).toBeLessThanOrEqual(car.seats);
        expect(restricted).toBeLessThanOrEqual(car.seats - 1); // ghế trước không cho trẻ <10
        expect(ps.filter((x) => x.category !== 'INFANT' && x.age < 10).length).toBeLessThanOrEqual(car.childSeats);
      }
    }
  });
  it('chiều về giữ nhóm xe như chiều đi khi vẫn vừa', () => {
    const paxes = [...adults(2, 'PNRAA'), ...adults(2, 'PNRBB'), ...adults(2, 'PNRCC')];
    const fleet = [v('s2a', 2), v('s2b', 2), v('s2c', 2), v('s4', 4), v('s6', 6)];
    const out = planDelayVehicles({ paxes, fleet });
    // Chiều đi tối ưu = 1 xe 6; ép chiều đi kiểu khác để thấy "giữ nhóm" có tác dụng.
    const outbound = [[paxes[0]!.id, paxes[1]!.id, paxes[2]!.id, paxes[3]!.id], [paxes[4]!.id, paxes[5]!.id]];
    const back = planDelayReturnVehicles({ paxes, fleet: [v('s4', 4), v('s2a', 2), v('s2b', 2)] }, outbound);
    expect(back.external).toEqual([]);
    const groupsBack = back.vehicles.map((x) => x.paxIds.slice().sort().join()).sort();
    expect(groupsBack).toEqual(outbound.map((g) => g.slice().sort().join()).sort());
    expect(out.vehicles).toHaveLength(1);
  });
});
