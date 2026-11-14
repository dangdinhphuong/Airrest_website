import { describe, expect, it } from 'vitest';
import { defaultSelected, toggleGroup, toggleId } from './payerDelay';

const groups = [
  { pnr: 'AAA111', passengers: [{ id: 'a' }, { id: 'b' }] },
  { pnr: 'BBB222', passengers: [{ id: 'c' }] },
];

describe('chọn khách nhận phòng', () => {
  it('mặc định chọn hết', () => {
    expect([...defaultSelected(groups)].sort()).toEqual(['a', 'b', 'c']);
    expect(defaultSelected(undefined).size).toBe(0);
  });
  it('bỏ/chọn một khách không đổi tập gốc', () => {
    const s = defaultSelected(groups);
    const n = toggleId(s, 'a');
    expect(n.has('a')).toBe(false);
    expect(s.has('a')).toBe(true);
  });
  it('chọn/bỏ cả nhóm', () => {
    const s = toggleGroup(defaultSelected(groups), groups[0]);
    expect([...s]).toEqual(['c']);
    expect([...toggleGroup(s, groups[0])].sort()).toEqual(['a', 'b', 'c']);
  });
});
