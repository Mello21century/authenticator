/** Lock state machine: locked at launch, re-locks once `timeoutMs` has passed since the last unlock (0 = only on launch). */
export class LockState {
  locked = true;
  private lastUnlock = 0;

  constructor(public timeoutMs: number, private now: () => number = Date.now) {}

  unlock() { this.locked = false; this.lastUnlock = this.now(); }

  /** Returns true when this check transitioned to locked. */
  check(): boolean {
    if (this.locked || this.timeoutMs <= 0) return false;
    if (this.now() - this.lastUnlock >= this.timeoutMs) { this.locked = true; return true; }
    return false;
  }
}
