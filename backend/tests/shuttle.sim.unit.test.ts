import { describe, expect, it } from 'vitest';
import { guestTripView } from '../services/shuttle/guestView';
import { computePosition, downsample, endpoints, haversineM, pointAt, polyLen, type LatLng, type Route } from '../services/shuttle/route';

// Tuyến thẳng theo kinh tuyến ~11.1 km: 0.1 độ vĩ ở lng cố định.
const A: LatLng = [10, 106], B: LatLng = [10.05, 106], C: LatLng = [10.1, 106];
const route: Route = { approach: [A, B], ride: [B, C], approachDistanceM: 0, approachDurationS: 0, rideDistanceM: 0, rideDurationS: 0, source: 'straight' };
const T0 = Date.UTC(2030, 0, 1);
const V = 36; // km/h = 10 m/s
const alen = polyLen(route.approach);

describe('mô phỏng: hình học + vị trí theo thời gian', () => {
  it('polyLen/pointAt: đầu, giữa, cuối, quá cuối; heading hướng bắc', () => {
    const pts: LatLng[] = [A, B, C];
    expect(polyLen(pts)).toBeCloseTo(haversineM(A, C), -1);
    expect(pointAt(pts, 0)).toMatchObject({ lat: 10, lng: 106 });
    expect(pointAt(pts, polyLen(pts) / 2).lat).toBeCloseTo(10.05, 3);
    expect(pointAt(pts, 1e9)).toMatchObject({ lat: 10.1, lng: 106 });
    expect(pointAt(pts, 5).heading).toBe(0);
  });

  it('EN_ROUTE nội suy theo (now - en_route_at) * scale * speed; ETA là phần còn lại', () => {
    const t = { status: 'EN_ROUTE', route, enRouteAt: new Date(T0) };
    const p0 = computePosition(t, T0, V, 1)!;
    expect(p0).toMatchObject({ phase: 'APPROACH', speedKmh: V, lat: 10 });
    expect(p0.etaSec).toBe(Math.ceil(alen / 10));
    const p100 = computePosition(t, T0 + 100_000, V, 1)!;
    expect(haversineM(A, [p100.lat, p100.lng])).toBeCloseTo(1000, -1); // 100 s x 10 m/s
    expect(p100.etaSec).toBe(Math.ceil((alen - 1000) / 10));
    // scale x10 = cùng quãng sau 10 s thật
    const s10 = computePosition(t, T0 + 10_000, V, 10)!;
    expect(s10.lat).toBeCloseTo(p100.lat, 5);
  });

  it('qua cuối tuyến: đứng ở điểm đón, ETA 0, remainingM 0, speed 0', () => {
    const p = computePosition({ status: 'EN_ROUTE', route, enRouteAt: new Date(T0) }, T0 + 1e9, V, 1)!;
    expect(p).toMatchObject({ lat: 10.05, etaSec: 0, remainingM: 0, speedKmh: 0 });
  });

  it('ARRIVED đứng ở điểm đón; ONBOARD dọc ride từ onboard_at; DROPPED_OFF đứng ở điểm trả (DONE)', () => {
    expect(computePosition({ status: 'ARRIVED', route }, T0, V, 1)).toMatchObject({ phase: 'ARRIVED', lat: 10.05, etaSec: 0 });
    const on = computePosition({ status: 'ONBOARD', route, onboardAt: new Date(T0) }, T0 + 50_000, V, 1)!;
    expect(on.phase).toBe('RIDE');
    expect(haversineM(B, [on.lat, on.lng])).toBeCloseTo(500, -1);
    expect(computePosition({ status: 'DROPPED_OFF', route }, T0, V, 1)).toMatchObject({ phase: 'DONE', lat: 10.1, speedKmh: 0 });
  });

  it('không có tuyến / trạng thái chưa chạy -> null; ACCEPTED ở đầu tuyến', () => {
    expect(computePosition({ status: 'EN_ROUTE' }, T0, V, 1)).toBeNull();
    expect(computePosition({ status: 'OFFERED', route }, T0, V, 1)).toBeNull();
    expect(computePosition({ status: 'ACCEPTED', route }, T0, V, 1)).toMatchObject({ lat: 10, speedKmh: 0, phase: 'APPROACH' });
  });

  it('downsample giữ điểm đầu và cuối, <= max+1 điểm', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => [10 + i / 1e4, 106] as LatLng);
    const d = downsample(pts, 300);
    expect(d.length).toBeLessThanOrEqual(301);
    expect(d[0]).toBe(pts[0]);
    expect(d[d.length - 1]).toBe(pts[999]);
  });

  it('endpoints theo chiều: TO_HOTEL đón sân bay trả khách sạn; TO_AIRPORT đón khách sạn trả sân bay; sân bay lạ -> null', () => {
    const loc = { type: 'Point', coordinates: [105.8, 21.2] };
    const h = endpoints('TO_HOTEL', 'HAN', loc)!;
    expect(h.pickup).toEqual([21.2212, 105.807]);
    expect(h.dropoff).toEqual([21.2, 105.8]);
    const a = endpoints('TO_AIRPORT', 'HAN', loc)!;
    expect(a.pickup).toEqual([21.2, 105.8]);
    expect(a.dropoff).toEqual([21.2212, 105.807]);
    expect(endpoints('TO_HOTEL', 'XXX', loc)).toBeNull();
  });

  it('DTO khách: xe ngoài không có route/position; xe OWN chỉ có từ ACCEPTED', () => {
    const own = { id: 't', kind: 'OWN', seats: 4, route, plate: '30A', vehicleSeats: 4, driverName: 'X', driverPhone: '1' };
    expect(guestTripView({ ...own, status: 'OFFERED' })).not.toHaveProperty('route');
    expect(guestTripView({ ...own, status: 'ACCEPTED' })).toHaveProperty('position');
    expect(guestTripView({ ...own, status: 'ACCEPTED' })).toHaveProperty('route');
    expect(guestTripView({ ...own, kind: 'EXTERNAL', status: 'ACCEPTED', shareUrl: 'https://grab.com/x' })).not.toHaveProperty('position');
  });
});
