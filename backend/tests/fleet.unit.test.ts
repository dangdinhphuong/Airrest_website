import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG } from '../config/permissionCatalog';
import { PERM } from '../config/permissions';
import { planVehicles } from '../services/shuttle/dispatch';
import { hostAllowed, validateShareUrl } from '../services/shuttle/externalLink';

const fleet = (...seats: number[]) => seats.map((s, i) => ({ id: `v${i}-${s}`, seats: s }));
const sum = (r: ReturnType<typeof planVehicles>) => r.assignments.reduce((n, a) => n + a.seats, 0);

describe('planVehicles (điều phối chọn xe)', () => {
  it('1 người: xe nhỏ nhất đủ chỗ', () => {
    const r = planVehicles(1, fleet(7, 4, 16));
    expect(r).toEqual({ assignments: [{ vehicleId: 'v1-4', seats: 1 }], remaining: 0 });
  });
  it('4 người: một xe 4 chỗ', () => {
    expect(planVehicles(4, fleet(4, 4, 7)).assignments).toEqual([{ vehicleId: 'v0-4', seats: 4 }]);
  });
  it('5 người: xe 4+4 chở 4 và 1', () => {
    const r = planVehicles(5, fleet(4, 4));
    expect(r.remaining).toBe(0);
    expect(r.assignments.map((a) => a.seats)).toEqual([4, 1]);
  });
  it('5 người: xe 7 chỗ được ưu tiên nếu có (một xe thay vì hai)', () => {
    expect(planVehicles(5, fleet(4, 4, 7))).toEqual({ assignments: [{ vehicleId: 'v2-7', seats: 5 }], remaining: 0 });
  });
  it('9 người với 4+4+4: lấy ba xe, xe cuối chở 1', () => {
    const r = planVehicles(9, fleet(4, 4, 4));
    expect(r.assignments.map((a) => a.seats)).toEqual([4, 4, 1]);
    expect(r.remaining).toBe(0);
  });
  it('9 người với 16+4: một xe 16 chỗ (nhỏ nhất đủ)', () => {
    expect(planVehicles(9, fleet(16, 4)).assignments).toEqual([{ vehicleId: 'v0-16', seats: 9 }]);
  });
  it('thu nhỏ xe cuối: 6 người với 4+2+2 -> 4+2 (không dùng xe thứ ba)', () => {
    const r = planVehicles(6, fleet(4, 2, 2));
    expect(r.assignments.map((a) => a.seats)).toEqual([4, 2]);
    expect(sum(r)).toBe(6);
  });
  it('không có xe nào: remaining = cả đoàn', () => {
    expect(planVehicles(5, [])).toEqual({ assignments: [], remaining: 5 });
  });
  it('thiếu xe: dùng hết xe rảnh, phần còn lại sang xe ngoài', () => {
    const r = planVehicles(10, fleet(4, 4));
    expect(r.assignments.map((a) => a.seats)).toEqual([4, 4]);
    expect(r.remaining).toBe(2);
  });
  it('xe trùng giờ bị loại: chỉ truyền xe rảnh vào, xe bận không được chọn', () => {
    const all = fleet(7, 4, 4);
    const free = all.filter((v) => v.id !== 'v0-7'); // xe 7 chỗ đang bận
    expect(planVehicles(5, free).assignments.map((a) => a.vehicleId).sort()).toEqual(['v1-4', 'v2-4']);
  });
});

describe('liên kết chia sẻ xe ngoài', () => {
  const bad = (u: string) => expect(() => validateShareUrl(u), u).toThrowError(expect.objectContaining({ status: 422, code: 'EXTERNAL_LINK_NOT_ALLOWED' }));
  it('hợp lệ: https + tên miền cho phép (kể cả tên miền con)', () => {
    expect(validateShareUrl('https://r.grab.com/abc?x=1')).toMatchObject({ host: 'r.grab.com' });
    expect(validateShareUrl('https://xanhsm.com/share/1').host).toBe('xanhsm.com');
  });
  it('từ chối http, javascript:, data:, IP, localhost, thông tin đăng nhập, cổng, tên miền lạ', () => {
    ['http://grab.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://user:pw@grab.com/x', 'https://grab.com:8443/x',
      'https://evilgrab.com/x', 'https://grab.com.evil.io/x', 'https://example.com/x', 'https://2130706433/x', 'not a url', `https://grab.com/${'a'.repeat(500)}`].forEach(bad);
  });
  it('khớp hậu tố theo nhãn tên miền', () => {
    expect(hostAllowed('r.grab.com', ['grab.com'])).toBe(true);
    expect(hostAllowed('evilgrab.com', ['grab.com'])).toBe(false);
  });
});

describe('danh mục quyền', () => {
  it('phủ fleet:manage và trip:drive với nhóm + mô tả tiếng Việt', () => {
    for (const p of [PERM.FLEET_MANAGE, PERM.TRIP_DRIVE]) expect(PERMISSION_CATALOG[p].description.length).toBeGreaterThan(10);
  });
});
