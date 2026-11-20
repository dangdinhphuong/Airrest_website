// @vitest-environment jsdom
// Công tắc VITE_CHATBOT_ENABLED: tắt thì UserSite không dựng ChatBot (không robot, không khung chat, không gọi API chat).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../../state/store', () => ({ useApp: () => ({ state: { user: null, session: null, screen: 'home' }, dispatch: vi.fn() }) }));
vi.mock('./ChatBot', () => ({ default: () => <div data-testid="chatbot-stub">chatbot</div> }));
vi.mock('./AccountMenu', () => ({ default: () => <div /> }));
vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn(), matchMedia: () => ({ add: vi.fn(), revert: vi.fn() }), utils: { toArray: () => [] }, from: vi.fn(), to: vi.fn() } }));
vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));

// CHATBOT_ENABLED được tính lúc nạp module: đặt biến rồi nạp lại module cho từng trường hợp.
const renderWith = async (value) => {
  vi.resetModules();
  if (value === undefined) vi.unstubAllEnvs(); else vi.stubEnv('VITE_CHATBOT_ENABLED', value);
  const { default: UserSite } = await import('./UserSite');
  render(<UserSite page="home"><p>nội dung trang</p></UserSite>);
};

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('UserSite: công tắc chatbot', () => {
  it.each([[undefined, 'không đặt biến (mặc định)'], ['true', 'true'], ['1', '1'], ['fasle', 'gõ sai vẫn bật']])('%s (%s) -> có chatbot', async (v) => {
    await renderWith(v);
    expect(screen.getByText('nội dung trang')).toBeTruthy();
    expect(screen.getByTestId('chatbot-stub')).toBeTruthy();
  });
  it.each(['false', 'FALSE', '0', 'off', 'no', 'disabled'])('%s -> KHÔNG có chatbot, trang vẫn hiển thị bình thường', async (v) => {
    await renderWith(v);
    expect(screen.getByText('nội dung trang')).toBeTruthy();
    expect(screen.queryByTestId('chatbot-stub')).toBeNull();
  });
});
