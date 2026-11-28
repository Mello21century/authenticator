import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSessionRejected, type AuthResponse, type MfaRequired, type User } from '@auth/shared';
import { api, onAuthLost } from './api';

interface AuthState {
  user: User | null;
  ready: boolean;
  /** Startup couldn't reach the server; retrying. The saved session is kept. */
  offline: boolean;
  /** Leave the retry screen for sign-in (e.g. to change the server). Keeps the saved session. */
  skipToSignIn(): void;
  setSession(r: AuthResponse): void;
  login(email: string, password: string): Promise<AuthResponse | MfaRequired>;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const qc = useQueryClient();

  const clear = useCallback(() => { setUser(null); qc.clear(); }, [qc]);

  useEffect(() => {
    onAuthLost(clear);
    const boot = () => api.refresh()
      .then(r => { setUser(r.user); setReady(true); setOffline(false); })
      .catch(e => {
        if (isSessionRejected(e)) { setUser(null); setReady(true); setOffline(false); }
        else { setOffline(true); retry.current = setTimeout(boot, 5000); } // server down: don't sign out, retry
      });
    void boot();
    return () => clearTimeout(retry.current);
  }, [clear]);

  const value: AuthState = {
    user, ready, offline,
    skipToSignIn() { clearTimeout(retry.current); setOffline(false); setReady(true); },
    setSession: r => setUser(r.user),
    async login(email, password) {
      const r = await api.login(email, password);
      if ('user' in r) setUser(r.user);
      return r;
    },
    async logout() { try { await api.logout(); } finally { clear(); } },
    async reloadUser() { setUser(await api.me()); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
