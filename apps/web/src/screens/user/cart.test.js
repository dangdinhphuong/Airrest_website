import { describe, expect, it } from 'vitest';
import { CART_TTL_MS, cartPlan, defaultGuests, dropSoldOut, emptyCart, loadCart, reconcile, roomNote, setQty, suggestExtraRoom, switchesPlan, toApiRooms, totalCapacity, totalRooms } from './cart';

const R = (id, price, cap, left) => ({ id, name: id.toUpperCase(), price, maxOccupancy: cap, availableRooms: left });
const H = { id: 'h1', name: 'KS 1', rooms: [R('a', 500, 2, 3), R('b', 900, 4, 1), R('c', 300, 2, 0)] };
const [A, B, C] = H.rooms;

describe('setQty', () => {
  it('thêm, tăng, bỏ dòng khi về 0', () => {
    let c = setQty(emptyCart(), H, A, 1);
    c = setQty(c, H, B, 1);
    c = setQty(c, H, A, 2);
    expect(totalRooms(c)).toBe(3);
    expect(toApiRooms(c)).toEqual([{ roomTypeId: 'a', qty: 2 }, { roomTypeId: 'b', qty: 1 }]);
    expect(setQty(c, H, A, 0).lines.map((l) => l.roomTypeId)).toEqual(['b']);
    expect(setQty(setQty(emptyCart(), H, A, 1), H, A, 0).hotelId).toBeNull();
  });
  it('chặn quá tồn, quá 5, phòng hết', () => {
    expect(setQty(emptyCart(), H, A, 9).lines[0].qty).toBe(3);
    expect(setQty(emptyCart(), H, C, 1).lines).toHaveLength(0);
    expect(setQty(emptyCart(), { ...H }, R('z', 1, 2, 50), 9).lines[0].qty).toBe(5);
  });
  it('khách sạn khác thì bắt đầu giỏ mới; chặn dòng thứ 11', () => {
    const c = setQty(emptyCart(), H, A, 1);
    expect(setQty(c, { id: 'h2', name: 'KS 2' }, R('x', 1, 2, 2), 1).lines.map((l) => l.roomTypeId)).toEqual(['x']);
    let big = emptyCart();
    for (let i = 0; i < 11; i += 1) big = setQty(big, H, R(`r${i}`, 1, 2, 2), 1);
    expect(big.lines).toHaveLength(10);
  });
});

describe('khách, ghi chú, gợi ý', () => {
  it('khách mặc định nằm trong [số phòng, sức chứa]', () => {
    const c = setQty(setQty(emptyCart(), H, A, 2), H, B, 1); // 3 phòng, sức chứa 8
    expect(totalCapacity(c)).toBe(8);
    expect(defaultGuests(c, 2)).toBe(3);
    expect(defaultGuests(c, 6)).toBe(6);
    expect(defaultGuests(c, 20)).toBe(8);
  });
  it('roomNote: hết phòng / không đủ phòng', () => {
    expect(roomNote(C, 2)).toBe('Hết phòng');
    expect(roomNote(B, 8)).toBe('Chỉ còn 1 phòng, bạn cần 2');
    expect(roomNote(A, 4)).toBeNull();
  });
  it('suggestExtraRoom: phòng rẻ nhất còn thêm được', () => {
    const c = setQty(emptyCart(), H, A, 3); // A đã đủ tồn
    expect(suggestExtraRoom(H, c).id).toBe('b');
    expect(suggestExtraRoom(H, setQty(c, H, B, 1))).toBeNull();
  });
});

describe('reconcile / dropSoldOut / loadCart', () => {
  it('bỏ dòng hết, cắt qty, cập nhật giá; khách sạn mất thì rỗng', () => {
    const c = setQty(setQty(emptyCart(), H, A, 3), H, B, 1);
    const h2 = { ...H, rooms: [{ ...A, availableRooms: 2, price: 600 }, { ...B, availableRooms: 0 }] };
    const r = reconcile(c, h2);
    expect(r.dropped).toEqual(['B']);
    expect(r.cart.lines).toEqual([{ roomTypeId: 'a', name: 'A', qty: 2, price: 600, maxOccupancy: 2 }]);
    expect(reconcile(c, null).cart.hotelId).toBeNull();
  });
  it('dropSoldOut giữ phần còn lại', () => {
    const c = setQty(setQty(emptyCart(), H, A, 1), H, B, 1);
    const r = dropSoldOut(c, [{ roomTypeId: 'b', roomTypeName: 'B', qty: 1 }]);
    expect(r.names).toEqual(['B']);
    expect(r.cart.lines.map((l) => l.roomTypeId)).toEqual(['a']);
    expect(dropSoldOut(setQty(emptyCart(), H, B, 1), [{ roomTypeId: 'b' }]).cart.hotelId).toBeNull();
  });
  it('loadCart không có localStorage thì giỏ rỗng, không ném lỗi', () => {
    expect(loadCart(Date.now() + CART_TTL_MS).lines).toEqual([]);
  });
});

// ---- Đặt theo giờ ----
import { cartTotal, hasNight, hourlyLineOf, hourlySpan, hourlyPriceOf, lineTotal, perNight, qtyOf, roomsText } from './cart';
import { hourChoices } from './HourlyPicker';

const HCFG = { enabled: true, firstHourVnd: 120000, nextHourVnd: 70000, minHours: 1, maxHours: 8, cleaningMin: 30 };
const HR = { ...R('p', 500000, 2, 1), hourly: HCFG };
const HH = { id: 'h1', name: 'KS 1', rooms: [HR] };
const T0 = '2030-12-01T07:00:00.000Z'; // 14:00 giờ VN
const hOpt = (hours = 3, startsAt = T0) => ({ kind: 'HOURLY', startsAt, hours });

describe('giá giờ', () => {
  it('giờ đầu + (giờ - 1) × giờ tiếp theo', () => {
    expect(hourlyPriceOf(HCFG, 1)).toBe(120000);
    expect(hourlyPriceOf(HCFG, 3)).toBe(260000);
  });
  it('nút số giờ: 2h/3h/4h/6h trong [min, max], không thì min và max', () => {
    expect(hourChoices({ minHours: 1, maxHours: 8 })).toEqual([2, 3, 4, 6]);
    expect(hourChoices({ minHours: 3, maxHours: 4 })).toEqual([3, 4]);
    expect(hourChoices({ minHours: 1, maxHours: 1 })).toEqual([1]);
    expect(hourChoices({ minHours: 7, maxHours: 8 })).toEqual([7, 8]);
  });
});

describe('giỏ trộn đêm + giờ', () => {
  it('cùng loại phòng có hai dòng (đêm, giờ); hourly bỏ qua tồn của đêm', () => {
    let c = setQty(emptyCart(), HH, HR, 1);
    c = setQty(c, HH, HR, 2, undefined, hOpt(3));
    expect(c.lines).toHaveLength(2);
    expect(qtyOf(c, 'p')).toBe(1);
    expect(hourlyLineOf(c, 'p')).toMatchObject({ qty: 2, hours: 3, price: 260000, kind: 'HOURLY', startsAt: T0 });
    expect(setQty(emptyCart(), HH, { ...HR, availableRooms: 0 }, 2, undefined, hOpt()).lines[0].qty).toBe(2); // tồn khung giờ do backend kiểm
    expect(setQty(emptyCart(), HH, HR, 9, undefined, hOpt()).lines[0].qty).toBe(5);
  });
  it('đổi giờ/số giờ của dòng giờ cập nhật đúng dòng đó, giữ số lượng; về 0 thì bỏ dòng giờ, giữ dòng đêm', () => {
    let c = setQty(setQty(emptyCart(), HH, HR, 1), HH, HR, 2, undefined, hOpt(2));
    c = setQty(c, HH, HR, 2, undefined, hOpt(4, '2030-12-01T09:00:00.000Z'));
    expect(c.lines.filter((l) => l.kind === 'HOURLY')).toEqual([expect.objectContaining({ qty: 2, hours: 4, price: 120000 + 3 * 70000 })]);
    c = setQty(c, HH, HR, 0, undefined, hOpt());
    expect(c.lines.map((l) => l.kind)).toEqual([undefined]);
  });
  it('tổng tiền: đêm × số đêm + giờ không nhân đêm; perNight chỉ tính đêm', () => {
    const c = setQty(setQty(emptyCart(), HH, HR, 1), HH, HR, 2, undefined, hOpt(3));
    expect(perNight(c)).toBe(500000);
    expect(cartTotal(c, 2)).toBe(500000 * 2 + 2 * 260000);
    expect(lineTotal(c.lines[1], 5)).toBe(520000);
    expect(hasNight(c)).toBe(true);
    expect(hasNight(setQty(emptyCart(), HH, HR, 1, undefined, hOpt()))).toBe(false);
  });
  it('toApiRooms: dòng đêm giữ dạng cũ, dòng giờ có kind/startsAt/hours; hourlySpan = giờ vào sớm nhất → giờ ra muộn nhất', () => {
    const c = setQty(setQty(emptyCart(), HH, HR, 1), HH, { ...HR, id: 'q' }, 1, undefined, hOpt(3));
    expect(toApiRooms(c)).toEqual([{ roomTypeId: 'p', qty: 1 }, { roomTypeId: 'q', qty: 1, kind: 'HOURLY', startsAt: T0, hours: 3 }]);
    const c2 = setQty(c, HH, HR, 1, undefined, hOpt(2, '2030-12-01T03:00:00.000Z'));
    expect(hourlySpan(c2)).toEqual({ from: Date.parse('2030-12-01T03:00:00.000Z'), to: Date.parse(T0) + 3 * 3600_000 });
    expect(hourlySpan(setQty(emptyCart(), HH, HR, 1))).toBeNull();
  });
  it('roomsText ghi số giờ cho dòng giờ', () => {
    expect(roomsText([{ roomTypeName: 'A', qty: 1 }, { roomTypeName: 'B', qty: 2, kind: 'HOURLY', hours: 3 }])).toBe('A × 1, B × 2 (3 giờ)');
  });
  it('dropSoldOut theo (loại phòng, kind): hết dòng giờ không bỏ dòng đêm cùng loại', () => {
    const c = setQty(setQty(emptyCart(), HH, HR, 1), HH, HR, 1, undefined, hOpt());
    const r = dropSoldOut(c, [{ roomTypeId: 'p', kind: 'HOURLY', startsAt: T0, hours: 3 }]);
    expect(r.cart.lines.map((l) => l.kind)).toEqual([undefined]);
    expect(r.names).toEqual(['P (theo giờ)']);
    expect(dropSoldOut(c, [{ roomTypeId: 'p' }]).cart.lines.map((l) => l.kind)).toEqual(['HOURLY']);
  });
  it('reconcile: bỏ dòng giờ khi giờ vào đã qua, loại phòng tắt giờ hoặc số giờ ngoài khoảng; cập nhật giá theo cấu hình mới', () => {
    const c = setQty(setQty(emptyCart(), HH, HR, 1), HH, HR, 1, undefined, hOpt(3));
    const now = Date.parse(T0) - 3600_000;
    const ok = reconcile(c, { ...HH, rooms: [{ ...HR, hourly: { ...HCFG, firstHourVnd: 100000 } }] }, now);
    expect(ok.cart.lines.find((l) => l.kind === 'HOURLY').price).toBe(100000 + 2 * 70000);
    expect(reconcile(c, HH, Date.parse(T0) + 3600_000).dropped).toEqual(['P (theo giờ)']);
    expect(reconcile(c, { ...HH, rooms: [{ ...HR, hourly: null }] }, now).dropped).toEqual(['P (theo giờ)']);
    expect(reconcile(c, { ...HH, rooms: [{ ...HR, hourly: { ...HCFG, maxHours: 2 } }] }, now).dropped).toEqual(['P (theo giờ)']);
  });
});

describe('mức giá Không hoàn hủy', () => {
  const N = { ...A, nonRefundablePct: 10, nonRefundablePrice: 450 }; // a: có mức không hoàn; b: không có
  const HN = { id: 'h1', name: 'KS 1', rooms: [N, B] };
  it('thêm dòng ở mức không hoàn: giá thấp hơn, ghi ratePlan; gửi API kèm ratePlan, mặc định không gửi', () => {
    const c = setQty(emptyCart(), HN, N, 2, Date.now(), { plan: 'NON_REFUNDABLE' });
    expect(c.lines[0]).toMatchObject({ roomTypeId: 'a', qty: 2, price: 450, ratePlan: 'NON_REFUNDABLE' });
    expect(cartPlan(c)).toBe('NON_REFUNDABLE');
    expect(toApiRooms(c)).toEqual([{ roomTypeId: 'a', qty: 2, ratePlan: 'NON_REFUNDABLE' }]);
    expect(toApiRooms(setQty(emptyCart(), HN, N, 1))).toEqual([{ roomTypeId: 'a', qty: 1 }]);
  });
  it('đổi qty không đổi mức; loại phòng không có mức không hoàn thì không thêm được vào giỏ không hoàn', () => {
    let c = setQty(emptyCart(), HN, N, 1, Date.now(), { plan: 'NON_REFUNDABLE' });
    c = setQty(c, HN, N, 2);
    expect(c.lines[0]).toMatchObject({ qty: 2, price: 450, ratePlan: 'NON_REFUNDABLE' });
    expect(setQty(c, HN, B, 1).lines.map((l) => l.roomTypeId)).toEqual(['a']); // b không bán mức này
    expect(suggestExtraRoom(HN, c).id).toBe('a'); // gợi ý thêm phòng chỉ lấy loại có mức không hoàn (b bị loại)
  });
  it('chọn mức khác thì bỏ các dòng đêm cũ (một đơn một mức) nhưng giữ dòng theo giờ', () => {
    let c = setQty(emptyCart(), HN, N, 1, Date.now(), { plan: 'NON_REFUNDABLE' });
    expect(switchesPlan(c, 'STANDARD')).toBe(true);
    c = setQty(c, HN, B, 1, Date.now(), { plan: 'STANDARD' });
    expect(c.lines.map((l) => [l.roomTypeId, l.ratePlan])).toEqual([['b', undefined]]);
  });
  it('reconcile: cập nhật giá theo mức; bỏ dòng khi loại phòng ngừng bán mức không hoàn', () => {
    const c = setQty(emptyCart(), HN, N, 1, Date.now(), { plan: 'NON_REFUNDABLE' });
    expect(reconcile(c, { ...HN, rooms: [{ ...N, nonRefundablePrice: 400 }, B] }).cart.lines[0]).toMatchObject({ price: 400, ratePlan: 'NON_REFUNDABLE' });
    expect(reconcile(c, { ...HN, rooms: [{ ...A }, B] }).dropped).toEqual(['A']);
  });
});
