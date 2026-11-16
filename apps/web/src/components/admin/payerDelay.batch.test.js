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

import { alertView, chosenUpgrade, extensionLabel, hasExtensionAlert, proposedOfferIds, pruneChoices, pushAlert, roomUpgradeOptions, upgradeLabel, upgradesPayload, upgradeTotal } from './payerDelay';
describe('nâng hạng', () => {
  const room = { unitKey: 'a+b', upgradeOptions: [{ roomTypeId: 't1', roomTypeName: 'Dlx', deltaVnd: 250000 }, { roomTypeId: 't2', roomTypeName: 'Ste', deltaVnd: 550000 }] };
  const units = [{ canUpgrade: true, rooms: [room, { unitKey: 'c', upgradeOptions: [] }] }];
  it('ẩn ô chọn khi payer không cho hoặc không có hạng', () => {
    expect(roomUpgradeOptions({ canUpgrade: false }, room)).toEqual([]);
    expect(roomUpgradeOptions(units[0], units[0].rooms[1])).toEqual([]);
    expect(roomUpgradeOptions(units[0], room)).toHaveLength(2);
  });
  it('tổng chênh, payload và bỏ lựa chọn lỗi thời', () => {
    const ch = { 'a+b': 't2', c: 'tX' };
    expect(upgradeTotal(units, ch)).toBe(550000);
    expect(upgradesPayload(ch)).toEqual([{ unitKey: 'a+b', roomTypeId: 't2' }, { unitKey: 'c', roomTypeId: 'tX' }]);
    expect(upgradesPayload({ 'a+b': '' })).toBeUndefined();
    expect(pruneChoices(units, ch)).toEqual({ 'a+b': 't2' });
    expect(chosenUpgrade(room, { 'a+b': 't1' }).deltaVnd).toBe(250000);
    expect(upgradeLabel(room.upgradeOptions[0])).toMatch(/^Dlx \(\+250\.000đ\)$/);
  });
  it('mã lỗi nâng hạng có tiếng Việt', () => {
    expect(delayErrText({ code: 'UPGRADE_NO_ROOM' })).toMatch(/hết phòng/);
    expect(delayErrText({ code: 'NO_EXTENSION_PROPOSED' })).toMatch(/gia hạn/);
  });
});
describe('cảnh báo đổi giờ bay + gia hạn', () => {
  const batch = { groups: [{ id: 'g1', code: 'NH-AAAA1111' }], offers: [{ id: 'o1', status: 'CONFIRMED', extensionStatus: 'PROPOSED' }, { id: 'o2', status: 'CONFIRMED', extensionStatus: 'REQUESTED' }, { id: 'o3', status: 'PENDING', extensionStatus: 'PROPOSED' }] };
  it('đỏ/cam theo loại và dùng mã nhóm NH-', () => {
    const a = alertView({ kind: 'FLIGHT_DELAYED_LATER', groupId: 'g1' }, batch);
    expect(a.tone).toBe('warn'); expect(a.text).toMatch(/NH-AAAA1111.*gia hạn/);
    for (const k of ['FLIGHT_EARLIER_URGENT', 'FLIGHT_CANCELLED', 'EXTENSION_NO_ROOM', 'EXTENSION_REJECTED']) expect(alertView({ kind: k, groupId: 'g1' }, batch).tone).toBe('error');
    expect(alertView({ kind: 'FLIGHT_TIME_UNKNOWN', groupId: 'g1' }, batch).tone).toBe('warn');
    expect(alertView({ kind: 'LẠ', groupId: 'g1', reason: 'X' }, batch).text).toMatch(/X/);
  });
  it('gom cảnh báo trùng, nút gia hạn chỉ khi có phòng PROPOSED đã xác nhận', () => {
    const l = pushAlert(pushAlert([], { kind: 'FLIGHT_DELAYED_LATER', offerId: 'o1' }), { kind: 'FLIGHT_DELAYED_LATER', offerId: 'o1', at: 2 });
    expect(l).toHaveLength(1); expect(hasExtensionAlert(l)).toBe(true);
    expect(proposedOfferIds(batch)).toEqual(['o1']);
    expect(extensionLabel(batch.offers[1])[0]).toMatch(/Chờ khách sạn đồng ý/);
    expect(extensionLabel({ extensionStatus: 'NONE' })).toBeNull();
  });
});
