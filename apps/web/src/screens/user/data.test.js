import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRideText, copyText } from './data';

const hotel = { name: 'KS Test', address: '12 Nguyễn Trãi, Hà Nội' };
const base = { airport: 'Sân bay Nội Bài', pickupAt: '2026-11-20T05:30:00Z', passengers: 3 }; // 12:30 giờ VN

describe('buildRideText', () => {
  it('TO_HOTEL: đón ở sân bay, đến khách sạn', () => {
    expect(buildRideText({ ...base, direction: 'TO_HOTEL', hotel })).toBe('Điểm đón: Sân bay Nội Bài; Điểm đến: 12 Nguyễn Trãi, Hà Nội; Giờ đón: 20/11/2026 12:30; Số khách: 3');
  });
  it('TO_AIRPORT: đón ở khách sạn, đến sân bay', () => {
    expect(buildRideText({ ...base, direction: 'TO_AIRPORT', hotel })).toBe('Điểm đón: 12 Nguyễn Trãi, Hà Nội; Điểm đến: Sân bay Nội Bài; Giờ đón: 20/11/2026 12:30; Số khách: 3');
  });
  it('thiếu địa chỉ thì dùng tên khách sạn', () => {
    expect(buildRideText({ ...base, direction: 'TO_AIRPORT', hotel: { name: 'KS Test', address: null } })).toMatch(/^Điểm đón: KS Test;/);
  });
});

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('dùng clipboard khi có', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });
  it('clipboard lỗi thì dự phòng execCommand', async () => {
    const ta = { setAttribute() {}, style: {}, select() {}, remove: vi.fn() };
    const exec = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    vi.stubGlobal('document', { createElement: () => ta, body: { appendChild() {} }, execCommand: exec });
    expect(await copyText('abc')).toBe(true);
    expect(ta.value).toBe('abc'); expect(exec).toHaveBeenCalledWith('copy'); expect(ta.remove).toHaveBeenCalled();
  });
});
