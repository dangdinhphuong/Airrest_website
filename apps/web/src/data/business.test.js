import { describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const setAuthToken = vi.fn();
vi.mock('../lib/api', () => ({ api: { post: (...a) => post(...a) }, setAuthToken: (t) => setAuthToken(t), apiBase: 'http://x', getAuthToken: () => 't' }));
import { switchWorkingHotel } from './business';

describe('switchWorkingHotel', () => {
  it('gọi switch-hotel và thay token trong phiên', async () => {
    post.mockResolvedValue({ token: 'tok2', hotel: { id: 'h2' }, hotels: [{ id: 'h1' }, { id: 'h2' }] });
    const r = await switchWorkingHotel('h2');
    expect(post).toHaveBeenCalledWith('/v1/auth/switch-hotel', { hotelId: 'h2' });
    expect(setAuthToken).toHaveBeenCalledWith('tok2');
    expect(r.hotel.id).toBe('h2');
  });
});
