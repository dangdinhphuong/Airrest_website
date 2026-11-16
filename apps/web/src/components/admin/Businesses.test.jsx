// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const calls = [];
const B = { id: 'b1', name: 'Công ty ABC', taxCode: '031', representative: 'An', email: 'a@abc.vn', phone: '090', status: 'PENDING_APPROVAL', hotelCount: 0, createdAt: '2026-11-01T00:00:00Z' };
vi.mock('../../data/admin', () => ({
  adminApi: {
    list: async () => ({ items: [B], nextCursor: null }),
    get: async () => ({ business: B, owner: { fullName: 'An', email: 'a@abc.vn', status: 'INVITED' }, hotels: [] }),
    post: async (path, body) => { calls.push([path, body]); return {}; },
  },
  listAirports: async () => ({ items: [] }),
}));
vi.mock('../../state/store', () => ({ useApp: () => ({ state: { session: { permissions: ['admin:hotel:read', 'admin:hotel:manage'] } } }) }));
import Businesses from './Businesses';

window.scrollTo = () => {};
afterEach(() => { cleanup(); calls.length = 0; });
const open = async () => { render(<Businesses />); fireEvent.click(await screen.findByTestId('open-biz')); await screen.findByTestId('biz-detail'); };

describe('tab Doanh nghiệp (admin)', () => {
  it('duyệt', async () => {
    await open();
    fireEvent.click(screen.getByTestId('b-approve'));
    fireEvent.click(screen.getByTestId('b-approve-confirm'));
    await waitFor(() => expect(calls).toContainEqual(['/businesses/b1/approve', {}]));
  });
  it('từ chối cần lý do', async () => {
    await open();
    fireEvent.click(screen.getByTestId('b-reject'));
    fireEvent.click(screen.getByTestId('b-reject-confirm'));
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByTestId('b-reject-reason'), { target: { value: 'Thiếu giấy phép' } });
    fireEvent.click(screen.getByTestId('b-reject-confirm'));
    await waitFor(() => expect(calls).toContainEqual(['/businesses/b1/reject', { reason: 'Thiếu giấy phép' }]));
  });
});
