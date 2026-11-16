import { describe, expect, it } from 'vitest';
import { bulkNumbers, checkImageFiles, makeCover, moveItem } from './roomLogic';

const f = (name, type, size = 1000) => ({ name, type, size });

describe('roomLogic', () => {
  it('checkImageFiles: sai định dạng, quá lớn, quá số ảnh', () => {
    const r = checkImageFiles([f('a.jpg', 'image/jpeg'), f('b.gif', 'image/gif'), f('c.png', 'image/png', 6 * 1024 * 1024), f('d.webp', 'image/webp'), f('e.jpg', 'image/jpeg')], 3, 5);
    expect(r.ok.map((x) => x.name)).toEqual(['a.jpg', 'd.webp']);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[2]).toContain('tối đa 5 ảnh');
  });
  it('moveItem / makeCover giữ thứ tự, không đổi mảng gốc', () => {
    const a = ['x', 'y', 'z'];
    expect(moveItem(a, 0, 1)).toEqual(['y', 'x', 'z']);
    expect(moveItem(a, 0, -1)).toBe(a);
    expect(moveItem(a, 2, 1)).toBe(a);
    expect(makeCover(a, 2)).toEqual(['z', 'x', 'y']);
    expect(makeCover(a, 0)).toBe(a);
    expect(a).toEqual(['x', 'y', 'z']);
  });
  it('bulkNumbers: dải hợp lệ và không hợp lệ', () => {
    expect(bulkNumbers('A', '101', '103')).toEqual(['A101', 'A102', 'A103']);
    expect(bulkNumbers('', '5', '5')).toEqual(['5']);
    expect(bulkNumbers('', '9', '3')).toBeNull();
    expect(bulkNumbers('', '1', '101')).toBeNull();
    expect(bulkNumbers('', '', '3')).toBeNull();
    expect(bulkNumbers('ABCDEF', '10000', '10001')).toBeNull();
  });
});
