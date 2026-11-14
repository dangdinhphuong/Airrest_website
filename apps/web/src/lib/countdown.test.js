import { describe, expect, it } from 'vitest';
import { fmtCountdown, remainingSeconds } from './countdown';

describe('đếm ngược', () => {
  it('trừ dần theo thời gian, không âm', () => {
    expect(remainingSeconds(300, 1000, 1000)).toBe(300);
    expect(remainingSeconds(300, 1000, 61500)).toBe(240);
    expect(remainingSeconds(10, 0, 99999)).toBe(0);
    expect(remainingSeconds(undefined, 0, 5)).toBe(0);
  });
  it('định dạng m:ss', () => { expect(fmtCountdown(65)).toBe('1:05'); expect(fmtCountdown(0)).toBe('0:00'); });
});
