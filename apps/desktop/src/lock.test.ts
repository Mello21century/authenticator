import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LockState } from './lock';

test('locked at launch, re-locks after timeout, never with 0', () => {
  let t = 1_000;
  const s = new LockState(60_000, () => t);
  assert.equal(s.locked, true);
  s.unlock();
  t += 59_999; assert.equal(s.check(), false); assert.equal(s.locked, false);
  t += 1; assert.equal(s.check(), true); assert.equal(s.locked, true);
  assert.equal(s.check(), false); // already locked, no repeat event
  const never = new LockState(0, () => t);
  never.unlock(); t += 10 ** 9; assert.equal(never.check(), false);
});
