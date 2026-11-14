import { describe, expect, it } from 'vitest';
import { buildShuttle, defaultPickup, windowFor } from './user';

const day = '2030-12-05';
describe('cửa sổ đơn theo giờ và xe', () => {
  it('đơn toàn giờ không gửi from/to', () => {
    expect(windowFor([{ roomTypeId: 'a', qty: 1, kind: 'HOURLY', startsAt: '2030-12-05T07:00:00.000Z', hours: 2 }], day, '2030-12-06')).toEqual({});
  });
  it('đơn có dòng đêm gửi 14:00 → 12:00 giờ VN; dòng giờ nằm trước from (hôm nay quá 14:00) kéo from về giờ vào', () => {
    const w = windowFor([{ roomTypeId: 'a', qty: 1 }], day, '2030-12-06');
    expect(w.from.toISOString()).toBe('2030-12-05T07:00:00.000Z');
    expect(w.to.toISOString()).toBe('2030-12-06T05:00:00.000Z');
    const mixed = windowFor([{ roomTypeId: 'a', qty: 1 }, { roomTypeId: 'b', qty: 1, kind: 'HOURLY', startsAt: '2030-12-05T08:00:00.000Z', hours: 2 }], day, '2030-12-06');
    expect(mixed.from.toISOString()).toBe('2030-12-05T07:00:00.000Z'); // giờ vào sau from: giữ nguyên
  });
  it('giờ đón mặc định của đơn có phòng giờ bám giờ vào sớm nhất / giờ ra muộn nhất', () => {
    const hourly = { arrive: '2030-12-05T16:30', leave: '2030-12-05T19:30' };
    const now = Date.parse('2030-12-01T00:00:00Z');
    expect(defaultPickup('TO_HOTEL', day, '2030-12-06', now, hourly)).toBe('2030-12-05T16:30');
    expect(defaultPickup('TO_AIRPORT', day, '2030-12-06', now, hourly)).toBe('2030-12-05T19:30');
    expect(defaultPickup('TO_HOTEL', day, '2030-12-06', now)).toBe('2030-12-05T12:00'); // không có giờ: như cũ
    const legs = buildShuttle({ airport: 'HAN', TO_HOTEL: { on: true }, TO_AIRPORT: { on: false } }, day, '2030-12-06', now, hourly);
    expect(legs.legs[0].pickupAt).toBe('2030-12-05T16:30:00+07:00');
  });
});
