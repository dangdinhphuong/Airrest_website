// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessSteps } from './Bookings';

afterEach(cleanup);
describe('ProcessSteps', () => {
  it.each([
    ['PENDING_PAYMENT', 'Bước 2/5: Chờ khách thanh toán'],
    ['PENDING', 'Bước 3/5: Chờ khách sạn duyệt'],
    ['CONFIRMED', 'Bước 4/5: Chờ khách nhận phòng'],
    ['CHECKED_IN', 'Bước 5/5: Khách đang ở, chờ trả phòng'],
  ])('%s -> nhãn bước', (status, text) => {
    render(<ProcessSteps status={status} />);
    expect(screen.getByTestId('bk-step-label').textContent).toBe(text);
  });
  it('trạng thái kết thúc bất thường chỉ hiện huy hiệu', () => {
    render(<ProcessSteps status="CANCELLED" />);
    expect(screen.queryByTestId('bk-steps')).toBeNull();
    expect(screen.getByText('Đã hủy')).toBeTruthy();
  });
});
