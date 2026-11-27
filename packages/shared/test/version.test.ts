import { describe, expect, it } from 'vitest';
import { isOutdated } from '../src/version';

describe('isOutdated', () => {
  it('compares numerically, not as strings', () => {
    expect(isOutdated('1.9.0', '1.10.0')).toBe(true);
    expect(isOutdated('1.10.0', '1.9.0')).toBe(false);
  });
  it('equal versions are fine, missing parts count as 0', () => {
    expect(isOutdated('1.2.0', '1.2.0')).toBe(false);
    expect(isOutdated('1.2', '1.2.0')).toBe(false);
    expect(isOutdated('1.2', '1.2.1')).toBe(true);
  });
  it('never blocks on garbage or an empty minimum', () => {
    expect(isOutdated('1.0.0', '')).toBe(false);
    expect(isOutdated('', '2.0.0')).toBe(false);
    expect(isOutdated('abc', '2.0.0')).toBe(false);
  });
});
