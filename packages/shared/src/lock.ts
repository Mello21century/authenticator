/** Same rule as desktop: locked at launch; re-lock once timeoutMs passed since last unlock (0 = launch only). */
export class LockState {
  locked = true;
  private lastUnlock = 0;
  constructor(public timeoutMs: number, private now: () => number = Date.now) {}
  unlock() { this.locked = false; this.lastUnlock = this.now(); }
  check(): boolean {
    if (this.locked || this.timeoutMs <= 0) return false;
    if (this.now() - this.lastUnlock >= this.timeoutMs) { this.locked = true; return true; }
    return false;
  }
}
