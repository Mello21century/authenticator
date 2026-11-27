import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse, User } from '@auth/shared';
import { api, loadServer, onAuthLost } from './api';
import { LockState } from '@auth/shared';

const HOUR = 3_600_000;

interface Session {
  ready: boolean;
  user: User | null;
  locked: boolean;
  covered: boolean; // app switcher privacy cover
  lockTimeout: number;
  lockError: string;
  setSession(r: AuthResponse): void;
  signOut(): Promise<void>;
  unlock(): Promise<void>;
  setLockTimeout(ms: number): Promise<void>;
  reloadUser(): Promise<void>;
}

const Ctx = createContext<Session>(null!);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const lock = useRef(new LockState(HOUR)).current;
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [locked, setLocked] = useState(true);
  const [covered, setCovered] = useState(false);
  const [lockTimeout, setTimeoutState] = useState(HOUR);
  const [lockError, setLockError] = useState('');

  const unlock = useCallback(async () => {
    setLockError('');
    // no biometrics and no passcode on the device: there is nothing to check against, don't trap the user
    if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) {
      lock.unlock(); setLocked(false); return;
    }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Space Authenticator' });
    if (r.success) { lock.unlock(); setLocked(false); }
    else if (r.error !== 'user_cancel' && r.error !== 'app_cancel' && r.error !== 'system_cancel') setLockError(`Couldn't unlock (${r.error}).`);
  }, [lock]);

  useEffect(() => {
    onAuthLost(() => setUser(null));
    (async () => {
      await loadServer();
      const t = Number(await SecureStore.getItemAsync('lockTimeout'));
      if (Number.isFinite(t) && (await SecureStore.getItemAsync('lockTimeout')) !== null) { lock.timeoutMs = t; setTimeoutState(t); }
      try { setUser((await api.refresh()).user); } catch { setUser(null); }
      setReady(true);
    })();
  }, [lock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      setCovered(s !== 'active');
      if (s === 'active' && lock.check()) setLocked(true);
    });
    const id = setInterval(() => { if (lock.check()) setLocked(true); }, 15_000);
    return () => { sub.remove(); clearInterval(id); };
  }, [lock]);

  const value: Session = {
    ready, user, locked, covered, lockTimeout, lockError, unlock,
    setSession: r => { setUser(r.user); lock.unlock(); setLocked(false); }, // fresh sign-in counts as unlock
    async signOut() { try { await api.logout(); } finally { setUser(null); } },
    async setLockTimeout(ms) { lock.timeoutMs = ms; setTimeoutState(ms); await SecureStore.setItemAsync('lockTimeout', String(ms)); },
    async reloadUser() { setUser(await api.me()); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
