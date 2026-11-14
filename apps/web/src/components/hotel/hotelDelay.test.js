import { describe, expect, it } from 'vitest';
import { addExtension, checkExtReason, checkRoomNumbers, delayOfferErr, extensionErr, fmtVN, label, setExtensionResult } from './hotelDelay';

describe('yêu cầu khách delay', () => {
  it('kiểm số phòng sau khi bỏ trùng', () => {
    expect(checkRoomNumbers([' 101 ', '102'], 2)).toEqual({ ok: true, list: ['101', '102'] });
    expect(checkRoomNumbers(['101', '101'], 2).ok).toBe(false);
    expect(checkRoomNumbers(['101', ''], 2).ok).toBe(false);
    expect(checkRoomNumbers(['101'], 1).ok).toBe(true);
  });
  it('lỗi tiếng Việt', () => {
    expect(delayOfferErr({ code: 'OFFER_EXPIRED' })).toMatch(/hết hạn/);
    expect(delayOfferErr({ code: 'X' })).toBeNull();
  });
  it('label lỏng tay', () => {
    expect(label(null)).toBe('—');
    expect(label({ fullName: 'An' })).toBe('An');
    expect(label([{ name: 'A' }, 'B'])).toBe('A, B');
    expect(label(3)).toBe('3');
  });
});

describe('yêu cầu gia hạn', () => {
  it('thêm/ghi đè theo offerId, không đổi mảng gốc', () => {
    const a = addExtension([], { offerId: 'o1', groupId: 'g', proposedLeaveAt: 'x', at: 'y' });
    const b = addExtension(a, { offerId: 'o2' });
    const c = addExtension(b, { offerId: 'o1', proposedLeaveAt: 'z' });
    expect(a).toHaveLength(1);
    expect(c.map((x) => x.offerId)).toEqual(['o1', 'o2']);
    expect(c[0].proposedLeaveAt).toBe('z');
    expect(addExtension(a, {})).toBe(a);
    expect(setExtensionResult(c, 'o2', 'ACCEPTED')[1].result).toBe('ACCEPTED');
  });
  it('lỗi, lý do, giờ VN', () => {
    expect(extensionErr({ code: 'EXTENSION_NO_ROOM' })).toMatch(/hết phòng/);
    expect(extensionErr({ code: 'INVALID_STATE' })).toMatch(/đã được xử lý/);
    expect(extensionErr({ status: 404 })).toMatch(/Không tìm thấy/);
    expect(extensionErr({ code: 'X' })).toBeNull();
    expect(checkExtReason('  ')).toEqual({ ok: true, reason: undefined });
    expect(checkExtReason('x'.repeat(301)).ok).toBe(false);
    expect(fmtVN('2026-12-02T17:30:00Z')).toMatch(/00:30/);
  });
});
