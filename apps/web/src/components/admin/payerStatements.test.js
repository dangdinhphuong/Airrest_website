import { describe, expect, it } from 'vitest';
import { canDispute, checkReason, fmtRemaining, fmtVN, statementErr, sumByKind } from './payerStatements';

const NOW = Date.parse('2026-12-02T00:00:00Z');
describe('bảng kê tháng', () => {
  it('đếm ngược hạn khiếu nại', () => {
    expect(fmtRemaining('2026-12-06T03:30:00Z', NOW)).toBe('Còn 4 ngày 3 giờ');
    expect(fmtRemaining('2026-12-02T02:05:00Z', NOW)).toBe('Còn 2 giờ 5 phút');
    expect(fmtRemaining('2026-12-02T00:20:00Z', NOW)).toBe('Còn 20 phút');
    expect(fmtRemaining('2026-12-01T00:00:00Z', NOW)).toBe('Đã hết hạn');
    expect(fmtRemaining(undefined, NOW)).toBeNull();
  });
  it('chỉ SENT trong hạn và có quyền manage mới khiếu nại', () => {
    const s = { status: 'SENT', disputeDeadline: '2026-12-06T00:00:00Z' };
    expect(canDispute(s, NOW, true)).toBe(true);
    expect(canDispute(s, NOW, false)).toBe(false);
    expect(canDispute({ ...s, status: 'DISPUTED' }, NOW, true)).toBe(false);
    expect(canDispute({ ...s, status: 'LOCKED' }, NOW, true)).toBe(false);
    expect(canDispute({ ...s, disputeDeadline: '2026-12-01T00:00:00Z' }, NOW, true)).toBe(false);
  });
  it('kiểm lý do', () => {
    expect(checkReason('  sai  ').ok).toBe(false);
    expect(checkReason(' sai số tiền ')).toEqual({ ok: true, reason: 'sai số tiền' });
    expect(checkReason('x'.repeat(1001)).ok).toBe(false);
  });
  it('giờ VN, lỗi, tổng theo loại', () => {
    expect(fmtVN('2026-12-02T17:30:00Z')).toMatch(/00:30/); // +7h -> 03/12 00:30
    expect(statementErr({ code: 'DISPUTE_WINDOW_CLOSED' })).toMatch(/quá hạn/);
    expect(statementErr({ code: 'X' })).toBeNull();
    expect(sumByKind([{ kind: 'ROOM', amountVnd: 100 }, { kind: 'ROOM', amountVnd: 50 }, { kind: 'ADJUSTMENT', amountVnd: -20 }])).toEqual({ ROOM: 150, ADJUSTMENT: -20 });
  });
});
