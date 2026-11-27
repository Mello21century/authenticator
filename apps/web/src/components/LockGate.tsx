import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@auth/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { desktop } from '../lib/desktop';
import { errMsg } from '../lib/ui';

/** Desktop-only lock. Locked at launch and after the configured idle time; web never locks. */
export function useLock() {
  const [locked, setLocked] = useState(!!desktop);
  useEffect(() => {
    if (!desktop) return;
    void desktop.isLocked().then(setLocked);
    return desktop.onLock(() => setLocked(true));
  }, []);
  return { locked, unlock: () => setLocked(false) };
}

export function LockScreen({ onUnlocked }: { onUnlocked(): void }) {
  const { user, logout } = useAuth();
  // password form shows when there is no Touch ID, or as a fallback after a failed/cancelled Touch ID
  const [bio, setBio] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const label = desktop!.biometricLabel ?? 'Touch ID';

  async function tryBio() {
    setErr('');
    if (await desktop!.unlockBiometric()) onUnlocked();
    else setErr(`${label} was cancelled`);
  }

  useEffect(() => {
    void desktop!.canBiometric().then(ok => { setBio(ok); if (ok) void tryBio(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withPassword(e: FormEvent) {
    e.preventDefault(); setErr('');
    try {
      await api.verifyPassword(password); // checks only; no new session
      await desktop!.markUnlocked();
      onUnlocked();
    } catch (x) { setErr(x instanceof ApiError && x.status === 401 ? 'Wrong password' : errMsg(x)); }
  }

  return (
    <div className="lock">
      <div className="lock-card">
        <img className="lock-icon" src="./logo.png" alt="" />
        <h2>Space Authenticator is locked</h2>
        <p className="muted" style={{ margin: 0 }}>{user?.email}</p>
        {bio && <button className="btn primary block" onClick={tryBio}>Unlock with {label}</button>}
        {bio !== null && (!bio || err) && (
          <form className="stack" style={{ width: '100%' }} onSubmit={withPassword}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoFocus autoComplete="current-password" />
            <button className="btn primary block">Unlock</button>
          </form>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn small" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
