import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, MfaRequired, User } from '@auth/shared';
import { api, onAuthLost } from './api';

interface AuthState {
  user: User | null;
  ready: boolean;
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
  const qc = useQueryClient();

  const clear = useCallback(() => { setUser(null); qc.clear(); }, [qc]);

  useEffect(() => {
    onAuthLost(clear);
    api.refresh().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, [clear]);

  const value: AuthState = {
    user, ready,
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
