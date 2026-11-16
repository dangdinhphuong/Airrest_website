import { describe, expect, it } from 'vitest';
import { adminTabs } from '../../lib/adminNav';
import { visibleTabs } from '../../lib/access';
import { checkAdjustment, checkPayerForm, checkPeriod, checkRef, checkStaffForm, lastPeriod, payoutActions, settleErr, stmtActions } from './adminSettle';

describe('quyết toán admin', () => {
  it('kỳ YYYY-MM và kỳ trước theo giờ VN', () => {
    expect(checkPeriod('2026-11').ok).toBe(true);
    expect(checkPeriod('2026-13').ok).toBe(false);
    expect(checkPeriod('').ok).toBe(false);
    expect(lastPeriod(Date.parse('2026-01-15T00:00:00Z'))).toBe('2025-12');
    expect(lastPeriod(Date.parse('2026-11-30T18:00:00Z'))).toBe('2026-11'); // 01/12 giờ VN -> kỳ trước là 11
  });
  it('nút theo trạng thái và quyền', () => {
    const both = { manage: true, finance: true };
    expect(stmtActions({ status: 'DRAFT' }, both)).toEqual({ generate: true, send: true, lock: false, reopen: false });
    expect(stmtActions({ status: 'SENT' }, both).lock).toBe(true);
    expect(stmtActions({ status: 'LOCKED' }, both)).toMatchObject({ generate: false, reopen: true, lock: false });
    expect(stmtActions({ status: 'SENT' }, { manage: true, finance: false }).lock).toBe(false);
    expect(stmtActions({ status: 'DRAFT' }, { manage: false, finance: true }).send).toBe(false);
    expect(payoutActions({ status: 'LOCKED', netVnd: 5 }, both).paid).toBe(true);
    expect(payoutActions({ status: 'LOCKED', netVnd: 0 }, both).paid).toBe(false);
    expect(payoutActions({ status: 'DRAFT', netVnd: 5 }, { manage: false, finance: true })).toEqual({ lock: true, paid: false, adjust: false });
  });
  it('điều chỉnh: khác 0, trong hạn mức, ghi chú 3..300', () => {
    expect(checkAdjustment({ amount: '-300000', memo: 'Hoàn khách' })).toEqual({ ok: true, amountVnd: -300000, memo: 'Hoàn khách' });
    expect(checkAdjustment({ amount: '0', memo: 'abc' }).ok).toBe(false);
    expect(checkAdjustment({ amount: 'abc', memo: 'abc' }).ok).toBe(false);
    expect(checkAdjustment({ amount: '1.5e3', memo: 'abc' }).ok).toBe(false);
    expect(checkAdjustment({ amount: '5000000000', memo: 'abc' }).ok).toBe(false);
    expect(checkAdjustment({ amount: '100', memo: 'ab' }).ok).toBe(false);
  });
  it('form đơn vị và nhân viên khớp zod backend', () => {
    const r = checkPayerForm({ code: ' vna ', name: 'Vietnam Airlines', kind: 'AIRLINE', email: '', allowUpgrade: true });
    expect(r.body).toEqual({ code: 'VNA', name: 'Vietnam Airlines', kind: 'AIRLINE', sharedRoomPolicy: 'PRIVATE', allowUpgrade: true });
    expect(checkPayerForm({ code: 'a', name: 'Xx', kind: 'AIRLINE' }).ok).toBe(false);
    expect(checkPayerForm({ code: 'VNA', name: 'Xx', kind: 'X' }).ok).toBe(false);
    expect(checkPayerForm({ code: 'VNA', name: 'Xx', kind: 'AIRPORT', email: 'sai' }).ok).toBe(false);
    expect(checkPayerForm({ code: 'VNA', name: 'Xx', kind: 'AIRPORT', contactName: 'A', phone: '0901234567' }).body.contact).toEqual({ name: 'A', phone: '0901234567' });
    expect(checkStaffForm({ email: 'a@b.vn', fullName: 'An', password: '12345678901' }).ok).toBe(false);
    expect(checkStaffForm({ email: 'a@b.vn', fullName: 'An', password: '123456789012', stationId: '' }).body).toEqual({ email: 'a@b.vn', fullName: 'An', password: '123456789012' });
    expect(checkRef(' ab ').ok).toBe(false);
    expect(checkRef(' FT123 ').ref).toBe('FT123');
  });
  it('mã lỗi và menu theo quyền', () => {
    expect(settleErr({ code: 'PAYER_SUSPENDED' })).toMatch(/tạm ngưng/);
    expect(settleErr({ code: 'KHAC' })).toBeNull();
    const ids = (perms) => visibleTabs({ permissions: perms }, adminTabs).map((t) => t.id);
    expect(ids(['admin:payer:read'])).toEqual(expect.arrayContaining(['adminPayers', 'adminSettle']));
    expect(ids(['admin:payment:read'])).toContain('adminSettle');
    expect(ids(['admin:payment:read'])).not.toContain('adminPayers');
    expect(ids([])).not.toContain('adminSettle');
  });
});
