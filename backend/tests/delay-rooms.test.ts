import { describe, expect, it } from 'vitest';
import { paxCategoryFromAge, type BedType } from '@airrest/shared-types';
import { planRooms, replan, type PlanHotel, type PlanPax, type PlanRoomType } from '../services/delay/rooms/plan';

let seq = 0;
const P = (pnr: string, age: number, o: Partial<PlanPax> = {}): PlanPax => ({ id: `p${String(++seq).padStart(4, '0')}`, pnr, age, category: paxCategoryFromAge(age), isRepresentative: false, specialNeeds: [], ...o });
const T = (id: string, bedType: BedType, capacity: number, available: number, o: Partial<PlanRoomType> = {}): PlanRoomType =>
  ({ roomTypeId: id, bedType, capacity, available, connecting: false, family: false, priceVnd: 500_000, ...o });
const H = (hotelId: string, ...roomTypes: PlanRoomType[]): PlanHotel => ({ hotelId, roomTypes });
const allIds = (r: ReturnType<typeof planRooms>) => r.units.flatMap((u) => u.rooms.flatMap((x) => x.paxIds));

describe('xếp phòng khách delay', () => {
  it('3 trẻ + 1 người lớn: ưu tiên phòng gia đình', () => {
    const pax = [P('AAAAA', 35, { isRepresentative: true }), P('AAAAA', 5), P('AAAAA', 7), P('AAAAA', 9)];
    const r = planRooms({ pax, hotels: [H('h1', T('dbl', 'DOUBLE', 3, 5), T('fam', 'FAMILY', 4, 1, { family: true }))] });
    expect(r.unplaced).toEqual([]);
    expect(r.units).toHaveLength(1);
    expect(r.units[0]!).toMatchObject({ hotelId: 'h1', cluster: true });
    expect(r.units[0]!.rooms).toEqual([{ roomTypeId: 'fam', paxIds: pax.map((p) => p.id) }]);
  });

  it('cụm thông nhau: mỗi phòng có ít nhất một người lớn', () => {
    const pax = [P('AAAAA', 35, { isRepresentative: true }), P('AAAAA', 33), P('AAAAA', 5), P('AAAAA', 7), P('AAAAA', 9), P('AAAAA', 1)];
    const r = planRooms({ pax, hotels: [H('h1', T('dbl', 'DOUBLE', 3, 5, { connecting: true }))] });
    expect(r.unplaced).toEqual([]);
    expect(r.units).toHaveLength(1);
    expect(r.units[0]!).toMatchObject({ cluster: true, connecting: true, adjacent: true });
    expect(r.units[0]!.rooms).toHaveLength(2);
    const adults = new Set(pax.filter((p) => p.category === 'ADULT').map((p) => p.id));
    for (const room of r.units[0]!.rooms) expect(room.paxIds.some((i) => adults.has(i))).toBe(true);
    expect(r.units[0]!.rooms.flatMap((x) => x.paxIds).sort()).toEqual(pax.map((p) => p.id).sort());
  });

  it('1 người lớn + 3 trẻ, không phòng đủ chỗ: không tách phòng thông nhau, vào xử lý tay', () => {
    const pax = [P('AAAAA', 35), P('AAAAA', 5), P('AAAAA', 7), P('AAAAA', 9)];
    const r = planRooms({ pax, hotels: [H('h1', T('dbl', 'DOUBLE', 2, 5, { connecting: true }))] });
    expect(r.units).toEqual([]);
    expect(r.unplaced.map((u) => u.reason)).toEqual(Array(4).fill('NO_ROOM_FOR_CLUSTER'));
  });

  it('người đi lẻ PRIVATE: phòng đơn trước, hết thì twin rồi đôi, rồi mới xử lý tay', () => {
    const pax = [P('A1AAA', 30), P('B1BBB', 30), P('C1CCC', 30), P('D1DDD', 30), P('E1EEE', 30)];
    const r = planRooms({ pax, hotels: [H('h', T('dbl', 'DOUBLE', 2, 1), T('tw', 'TWIN', 2, 1), T('s', 'SINGLE', 1, 1))] });
    const types = r.units.map((u) => u.rooms[0]!.roomTypeId);
    expect(types).toEqual(['s', 'tw', 'dbl']);
    expect(r.unplaced).toHaveLength(2);
    expect(r.unplaced.every((u) => u.reason === 'NO_ROOM')).toBe(true);
  });

  it('không có phòng đủ/thông nhau: danh sách xử lý tay, không tự xếp trẻ riêng', () => {
    const pax = [P('AAAAA', 35), P('AAAAA', 5), P('AAAAA', 7), P('AAAAA', 9)];
    const r = planRooms({ pax, hotels: [H('h1', T('dbl', 'DOUBLE', 2, 5))] });
    expect(r.units).toEqual([]);
    expect(r.unplaced.map((u) => u.reason)).toEqual(Array(4).fill('NO_ROOM_FOR_CLUSTER'));
  });

  it('trẻ không có người lớn cùng PNR: xử lý tay', () => {
    const c = P('BBBBB', 8);
    expect(planRooms({ pax: [c], hotels: [H('h1', T('s', 'SINGLE', 2, 5))] }).unplaced).toEqual([{ paxId: c.id, pnr: 'BBBBB', reason: 'CHILD_WITHOUT_ADULT' }]);
  });

  it('em bé không tính sức chứa', () => {
    const pax = [P('AAAAA', 30), P('AAAAA', 1), P('AAAAA', 0)];
    const r = planRooms({ pax, hotels: [H('h1', T('s', 'SINGLE', 1, 1))] });
    expect(r.unplaced).toEqual([]);
    expect(r.units).toHaveLength(1);
    expect(r.units[0]!.rooms[0]!.paxIds).toHaveLength(3);
  });

  it('nhóm không vừa một KS thì tách KS, giữ cụm có trẻ nguyên vẹn', () => {
    const fam = [P('AAAAA', 35, { isRepresentative: true }), P('AAAAA', 6)];
    const solo = [P('AAAAA', 40), P('AAAAA', 41), P('AAAAA', 42)];
    const r = planRooms({ pax: [...fam, ...solo], hotels: [H('near', T('d', 'DOUBLE', 2, 2)), H('far', T('s', 'SINGLE', 1, 5))] });
    expect(r.unplaced).toEqual([]);
    const famUnit = r.units.find((u) => u.cluster)!;
    expect(famUnit.rooms[0]!.paxIds.sort()).toEqual(fam.map((p) => p.id).sort());
    expect(new Set(r.units.map((u) => u.hotelId))).toEqual(new Set(['near', 'far']));
  });

  it('nhóm vừa một KS thì cùng KS và sát nhau', () => {
    const pax = [P('AAAAA', 30), P('AAAAA', 31)];
    const r = planRooms({ pax, hotels: [H('a', T('s', 'SINGLE', 1, 1)), H('b', T('s', 'SINGLE', 1, 5))] });
    expect(r.units.map((u) => u.hotelId)).toEqual(['b', 'b']);
    expect(r.units.every((u) => u.adjacent)).toBe(true);
  });

  it('hết phòng: người không xếp được vào danh sách xử lý tay', () => {
    const pax = [P('A1AAA', 30), P('B1BBB', 30)];
    const r = planRooms({ pax, hotels: [H('h1', T('s', 'SINGLE', 1, 1))] });
    expect(r.units).toHaveLength(1);
    expect(r.unplaced).toHaveLength(1);
    expect(r.unplaced[0]!.reason).toBe('NO_ROOM');
  });

  it('nhóm có trẻ/người già được ưu tiên khi tranh phòng', () => {
    const adultOnly = P('AAAAA', 30);
    const elder = P('ZZZZZ', 70);
    const r = planRooms({ pax: [adultOnly, elder], hotels: [H('h1', T('s', 'SINGLE', 1, 1))] });
    expect(allIds(r)).toEqual([elder.id]);
  });

  it('KS bị loại không được dùng; KS ưu tiên theo PNR được thử trước', () => {
    const pax = [P('AAAAA', 30)];
    const hotels = [H('x', T('s', 'SINGLE', 1, 1)), H('y', T('s', 'SINGLE', 1, 1)), H('z', T('s', 'SINGLE', 1, 1))];
    expect(planRooms({ pax, hotels, excludedHotelIds: ['x'] }).units[0]!.hotelId).toBe('y');
    expect(planRooms({ pax, hotels, preferredHotelIdsByPnr: { AAAAA: ['z'] } }).units[0]!.hotelId).toBe('z');
  });

  it('chính sách PRIVATE: mỗi người một phòng; SHARED: ghép 2 (kể cả chéo nhóm)', () => {
    const pax = [P('A1AAA', 30), P('A1AAA', 31), P('B1BBB', 30), P('C1CCC', 30), P('D1DDD', 30)];
    const hotels = [H('h', T('s', 'SINGLE', 1, 10), T('tw', 'TWIN', 2, 10))];
    expect(planRooms({ pax, hotels }).units).toHaveLength(5);
    const r = planRooms({ pax, hotels, policy: 'SHARED' });
    expect(r.unplaced).toEqual([]);
    expect(r.units.map((u) => u.rooms[0]!.paxIds.length).sort()).toEqual([1, 2, 2]);
    expect(allIds(r).sort()).toEqual(pax.map((p) => p.id).sort());
  });

  it('tất định: cùng đầu vào cho cùng đầu ra', () => {
    const pax = [P('A1AAA', 30), P('A1AAA', 4), P('B1BBB', 71), P('C1CCC', 30), P('C1CCC', 3)];
    const hotels = [H('h1', T('d', 'DOUBLE', 2, 2, { connecting: true }), T('s', 'SINGLE', 1, 1)), H('h2', T('f', 'FAMILY', 4, 3, { family: true }))];
    const a = planRooms({ pax, hotels });
    expect(planRooms({ pax: [...pax].reverse(), hotels })).toEqual(a);
  });

  it('property: trẻ không bao giờ ở phòng riêng, không ai bị xếp 2 lần, không vượt tồn (dữ liệu ngẫu nhiên có seed)', () => {
    let s = 12345;
    const rnd = (n: number) => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
    for (let iter = 0; iter < 200; iter++) {
      const pax: PlanPax[] = [];
      for (let g = 0; g < 1 + rnd(25); g++) {
        const pnr = `G${g}XXX`;
        for (let k = 0, m = 1 + rnd(5); k < m; k++) pax.push(P(pnr, [0, 1, 4, 9, 11, 12, 30, 45, 70][rnd(9)]!, { isRepresentative: k === 0 }));
      }
      const hotels = ['a', 'b', 'c'].map((h) => H(h, T('s', 'SINGLE', 1, rnd(8)), T('d', 'DOUBLE', 2 + rnd(2), rnd(6), { connecting: rnd(2) === 0 }), T('f', 'FAMILY', 4, rnd(3), { family: true })));
      const r = planRooms({ pax, hotels, policy: rnd(2) ? 'SHARED' : 'PRIVATE' });
      const ids = allIds(r);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length + r.unplaced.length).toBe(pax.length);
      const byId = new Map(pax.map((p) => [p.id, p]));
      for (const u of r.units) {
        const people = u.rooms.flatMap((x) => x.paxIds).map((i) => byId.get(i)!);
        if (people.some((p) => p.category !== 'ADULT')) {
          expect(u.cluster).toBe(true);
          expect(people.some((p) => p.category === 'ADULT')).toBe(true);
          expect(new Set(people.map((p) => p.pnr)).size).toBe(1);
        }
        if (u.connecting) for (const x of u.rooms) expect(x.paxIds.some((i) => byId.get(i)!.category === 'ADULT')).toBe(true);
        for (const x of u.rooms) {
          const t = hotels.find((h) => h.hotelId === u.hotelId)!.roomTypes.find((y) => y.roomTypeId === x.roomTypeId)!;
          expect(x.paxIds.filter((i) => byId.get(i)!.category !== 'INFANT').length).toBeLessThanOrEqual(t.capacity);
        }
      }
      for (const h of hotels) for (const t of h.roomTypes)
        expect(r.units.filter((u) => u.hotelId === h.hotelId).flatMap((u) => u.rooms).filter((x) => x.roomTypeId === t.roomTypeId).length).toBeLessThanOrEqual(t.available);
    }
  });
});

describe('replan điều chuyển', () => {
  const fam = [P('AAAAA', 35, { isRepresentative: true }), P('AAAAA', 6), P('AAAAA', 8)];
  const solo = [P('AAAAA', 40), P('AAAAA', 41)];
  const pax = [...fam, ...solo];
  const hotels = [H('h1', T('f', 'FAMILY', 4, 1, { family: true }), T('s', 'SINGLE', 1, 1)), H('h2', T('f', 'FAMILY', 4, 2, { family: true }), T('s', 'SINGLE', 1, 5)), H('h3', T('f', 'FAMILY', 4, 2, { family: true }), T('s', 'SINGLE', 1, 5))];

  it('cụm chuyển nguyên cụm sang KS khác, không về KS đã từ chối', () => {
    const plan = planRooms({ pax, hotels });
    const cl = plan.units.find((u) => u.cluster)!;
    const r = replan({ pax, hotels: hotels.map((h) => ({ ...h, roomTypes: h.roomTypes.map((t) => ({ ...t, available: 2 })) })), units: plan.units, failedUnitIds: [cl.id], rejectedHotelIdsByUnit: { [cl.id]: ['h2'] } });
    expect(r.unplaced).toEqual([]);
    expect(r.replacements).toHaveLength(1);
    const nu = r.replacements[0]!.unit;
    expect(nu.cluster).toBe(true);
    expect([cl.hotelId, 'h2']).not.toContain(nu.hotelId);
    expect(nu.rooms.flatMap((x) => x.paxIds).sort()).toEqual(fam.map((p) => p.id).sort());
  });

  it('phòng độc lập được tách KS, ưu tiên KS nơi người cùng nhóm đã xác nhận', () => {
    const plan = planRooms({ pax: solo, hotels });
    const u = plan.units[0]!;
    const r = replan({ pax: solo, hotels, units: plan.units, failedUnitIds: [u.id], confirmedHotelIdsByPnr: { AAAAA: ['h3'] } });
    expect(r.replacements[0]!.unit.hotelId).toBe('h3');
    expect(r.replacements[0]!.unit.cluster).toBe(false);
    expect(r.replacements[0]!.unit.rooms[0]!.paxIds).toEqual(u.rooms[0]!.paxIds);
  });

  it('hết KS thay thế: vào danh sách xử lý tay', () => {
    const plan = planRooms({ pax: fam, hotels: [hotels[0]!] });
    const r = replan({ pax: fam, hotels: [hotels[0]!], units: plan.units, failedUnitIds: [plan.units[0]!.id] });
    expect(r.replacements).toEqual([]);
    expect(r.unplaced).toHaveLength(3);
  });
});
