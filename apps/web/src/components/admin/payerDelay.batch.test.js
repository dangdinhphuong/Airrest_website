import { describe, expect, it } from 'vitest';
import { batchSummary, delayErrText, unplacedReason } from './payerDelay';

describe('lô đặt phòng', () => {
  it('gom trạng thái', () => {
    const s = batchSummary({
      groups: [{ status: 'FAILED' }, { status: 'OK' }],
      offers: [{ status: 'PENDING', transferCount: 0 }, { status: 'PENDING', transferCount: 2 }, { status: 'CONFIRMED' }, { status: 'REJECTED' }],
      unplaced: [{}],
    });
    expect(s).toEqual({ waiting: 1, transferring: 1, confirmed: 1, failedGroups: 1, unplaced: 1 });
    expect(batchSummary(null).confirmed).toBe(0);
  });
  it('lỗi và lý do tiếng Việt', () => {
    expect(delayErrText({ code: 'FLIGHT_TOO_SOON' })).toMatch(/gần/);
    expect(delayErrText({ code: 'X' })).toBeNull();
    expect(unplacedReason('NO_ROOM')).toMatch(/phòng/);
    expect(unplacedReason('LẠ')).toBe('LẠ');
  });
});

import { defaultPickup, pickupErrText, pickupOptions } from './payerDelay';
describe('điểm đón', () => {
  it('chọn mặc định', () => {
    expect(defaultPickup({ items: ['A', 'B'], default: 'B' })).toBe('B');
    expect(defaultPickup({ items: ['A', 'B'], default: 'Z' })).toBe('A');
    expect(defaultPickup(null)).toBe('');
    expect(pickupOptions({ items: [] })).toBeNull();
    expect(pickupOptions({ items: ['A', 1, ''] })).toEqual(['A']);
  });
  it('lỗi điểm đón', () => {
    expect(pickupErrText({ code: 'PICKUP_POINT_INVALID', details: { allowed: ['A', 'B'] } })).toMatch(/A, B/);
    expect(pickupErrText({ code: 'X' })).toBeNull();
  });
});

import { groupLabel } from './payerDelay';
describe('groupLabel', () => {
  const b = { groups: [{ id: '11111111-2222-3333-4444-555555555555', code: 'NH-ABCD1234' }] };
  it('có mã nhóm thì hiện mã NH-', () => expect(groupLabel(b, '11111111-2222-3333-4444-555555555555')).toBe('NH-ABCD1234'));
  it('không tra được thì rút gọn UUID', () => { expect(groupLabel(b, 'aaaaaaaa-bbbb-cccc')).toBe('aaaaaaaa'); expect(groupLabel(undefined, 'abcdefgh-1')).toBe('abcdefgh'); });
});
