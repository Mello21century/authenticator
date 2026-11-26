import { describe, it, expect } from 'vitest';
import { nextRefreshDelay, remainingMs } from '../src';

describe('codes timing', () => {
  it('waits until the earliest expiry, corrected for clock offset', () => {
    // server is 2s ahead of client
    const codes = [{ entryId: 'a', code: '1', period: 30, expiresAt: 60_000 }, { entryId: 'b', code: '2', period: 60, expiresAt: 120_000 }];
    expect(nextRefreshDelay(codes, 50_000, 48_000)).toBe(10_000 + 100);
  });
  it('never polls faster than 250ms', () => {
    expect(nextRefreshDelay([{ entryId: 'a', code: '1', period: 30, expiresAt: 1000 }], 5000, 5000)).toBe(250);
  });
  it('idles at 30s when empty', () => {
    expect(nextRefreshDelay([], 0, 0)).toBe(30_000);
  });
  it('remaining time uses offset', () => {
    expect(remainingMs(60_000, 2_000, 48_000)).toBe(10_000);
    expect(remainingMs(60_000, 0, 70_000)).toBe(0);
  });
});
