import { describe, expect, it } from 'vitest';
import { checkExtReason, checkRoomNumbers, delayOfferErr, extensionErr, extensionsOf, fmtVN, label, pendingOffersOf } from './hotelDelay';

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
  it('đọc yêu cầu gia hạn từ API; offer đã ACCEPTED/REJECTED hoặc thiếu giờ đề xuất không hiện', () => {
    const items = [
      { id: 'o1', status: 'PENDING', extensionStatus: 'NONE' },
      { id: 'o2', status: 'CONFIRMED', groupId: 'g', extensionStatus: 'REQUESTED', proposedLeaveAt: 'x', extensionRequestedAt: 'y' },
      { id: 'o3', status: 'CONFIRMED', extensionStatus: 'ACCEPTED', proposedLeaveAt: 'x' },
      { id: 'o4', status: 'CONFIRMED', extensionStatus: 'REJECTED', proposedLeaveAt: 'x' },
      { id: 'o5', status: 'CONFIRMED', extensionStatus: 'REQUESTED' },
    ];
    expect(extensionsOf(items)).toEqual([{ offerId: 'o2', groupId: 'g', proposedLeaveAt: 'x', at: 'y' }]);
    expect(extensionsOf(undefined)).toEqual([]);
    expect(pendingOffersOf(items).map((o) => o.id)).toEqual(['o1']);
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
