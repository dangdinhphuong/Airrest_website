import { describe, expect, it } from 'vitest';
import { estimateRoute, haversineKm } from './route';

describe('route', () => {
  it('haversine Hà Nội–Nội Bài ~ 25km chim bay', () => {
    const km = haversineKm({ lat: 21.0285, lng: 105.8542 }, { lat: 21.2212, lng: 105.807 });
    expect(km).toBeGreaterThan(20); expect(km).toBeLessThan(25);
  });
  it('ước lượng có km, phút > 0 và đánh dấu estimated', () => {
    const r = estimateRoute({ lat: 21.0285, lng: 105.8542 }, { lat: 21.2212, lng: 105.807 });
    expect(r.km).toBeGreaterThan(25); expect(r.minutes).toBeGreaterThan(0); expect(r.estimated).toBe(true);
  });
});
