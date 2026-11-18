// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MultiSelect from './MultiSelect';

const OPTS = [{ id: 'a', label: 'Sao Mai Hotel' }, { id: 'b', label: 'Đồng Xanh Apartment' }, { id: 'c', label: 'Gió Đêm Inn' }];
const Host = () => { const [v, setV] = useState(['a']); return <MultiSelect testid="ms" options={OPTS} value={v} onChange={setV} />; };

afterEach(cleanup);
describe('MultiSelect', () => {
  it('chọn nhiều, tìm không dấu, bỏ chọn tất cả', () => {
    render(<Host />);
    expect(screen.getByTestId('ms-trigger').textContent).toContain('1 đã chọn');
    fireEvent.click(screen.getByTestId('ms-trigger'));
    fireEvent.click(screen.getByTestId('ms-opt-c'));
    expect(screen.getByTestId('ms-trigger').textContent).toContain('2 đã chọn');
    fireEvent.change(screen.getByTestId('ms-search'), { target: { value: 'dong xanh' } }); // không dấu, đ = d
    expect(screen.queryByTestId('ms-opt-a')).toBeNull();
    fireEvent.click(screen.getByTestId('ms-opt-b'));
    expect(screen.getByTestId('ms-trigger').textContent).toContain('3 đã chọn');
    fireEvent.click(screen.getByTestId('ms-clear'));
    expect(screen.getByTestId('ms-trigger').textContent).toContain('Chọn…');
  });
});
