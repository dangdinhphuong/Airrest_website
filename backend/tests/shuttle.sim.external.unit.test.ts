import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { validateShareUrl } from '../services/shuttle/externalLink';
import { demoExternal } from '../services/shuttle/simulation';

const ID = '0192f3a4-1111-7000-8000-00000000000a'; // hex cuối 'a' (chẵn)
const saved = env.EXTERNAL_RIDE_LINK_HOSTS;
afterEach(() => { env.EXTERNAL_RIDE_LINK_HOSTS = saved; vi.unstubAllEnvs(); vi.resetModules(); });

describe('xe ngoài mô phỏng: dữ liệu giả hợp lệ', () => {
  it('link giả qua validateShareUrl; provider xác định theo id; dữ liệu rõ ràng là mô phỏng', () => {
    const a = demoExternal(ID), b = demoExternal(ID.slice(0, -1) + '1');
    expect(demoExternal(ID, 0)).toEqual(demoExternal(ID, 0));
    expect([a.provider, b.provider].sort()).toEqual(['GRAB', 'XANHSM']);
    for (const d of [a, b]) {
      expect(d.shareUrl).toMatch(/^https:\/\/(r\.grab\.com\/g|xanhsm\.com\/share)\/DEMO-[0-9A-F]{8}$/);
      expect(validateShareUrl(d.shareUrl).url).toBe(d.shareUrl);
      expect(d).toMatchObject({ driverName: 'Tài xế mô phỏng', plate: '51A-DEMO', phone: '+84900000000' });
    }
  });

  it('cấu hình không có host của hai hãng -> dùng host đầu danh sách (vẫn hợp lệ)', () => {
    env.EXTERNAL_RIDE_LINK_HOSTS = 'taxi.example.vn, other.vn';
    const d = demoExternal(ID);
    expect(d.shareUrl).toMatch(/^https:\/\/taxi\.example\.vn\/share\/DEMO-/);
    expect(validateShareUrl(d.shareUrl).host).toBe('taxi.example.vn');
  });

  it('chỉ có xanhsm.com -> luôn XANHSM', () => {
    env.EXTERNAL_RIDE_LINK_HOSTS = 'xanhsm.com';
    expect(demoExternal(ID).provider).toBe('XANHSM');
  });
});

describe('cấu hình: production + SHUTTLE_SIM_AUTO', () => {
  const load = (auto?: string) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEPAY_ENABLED', 'false'); // production cấm SePay mock; test này chỉ xét SHUTTLE_SIM_AUTO
    if (auto !== undefined) vi.stubEnv('SHUTTLE_SIM_AUTO', auto);
    else delete process.env.SHUTTLE_SIM_AUTO;
    vi.resetModules();
    return import('../config/env.js');
  };
  it('production + AUTO=true -> từ chối khởi động', async () => {
    await expect(load('true')).rejects.toThrow(/SHUTTLE_SIM_AUTO/);
  });
  it('production + AUTO=false hoặc bỏ trống -> OK, AUTO=false', async () => {
    expect((await load('false')).env.SHUTTLE_SIM_AUTO).toBe(false);
    expect((await load()).env.SHUTTLE_SIM_AUTO).toBe(false);
  });
});
