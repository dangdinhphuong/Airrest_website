import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from './geocode';

const hit = (lat, lon, addresstype) => ({ ok: true, json: async () => [{ lat, lon, addresstype }] });
afterEach(() => vi.unstubAllGlobals());

describe('geocodeAddress', () => {
  it('bỏ kết quả mức thành phố, thử cách hỏi khác và đánh dấu gần đúng', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce(hit('21.02', '105.85', 'city')).mockResolvedValueOnce(hit('21.07', '105.82', 'road'));
    vi.stubGlobal('fetch', f);
    const p = geocodeAddress('238 Âu cơ Tây Hồ , Hà Nội', '');
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ lat: 21.07, lng: 105.82, approx: true });
    expect(decodeURIComponent(f.mock.calls[1][0])).toContain('q=Âu cơ Tây Hồ, Hà Nội, Việt Nam');
    vi.useRealTimers();
  });
  it('khớp đúng số nhà thì không gần đúng; rỗng thì null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hit('10.1', '106.1', 'building')));
    expect(await geocodeAddress('1 A', 'B')).toEqual({ lat: 10.1, lng: 106.1, approx: false });
    expect(await geocodeAddress('', '')).toBeNull();
  });
});
