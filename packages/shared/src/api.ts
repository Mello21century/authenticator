import type { AuthResponse, CodesResponse, Entry, EntryInput, ExportFile, Member, MfaRequired, User } from './types';

export interface ApiOptions {
  baseUrl: string; // ends with /api
  native: boolean; // desktop/mobile: refresh token in body + secure storage; web: httpOnly cookie
  getRefreshToken?(): Promise<string | null>;
  setRefreshToken?(t: string | null): Promise<void>;
  onAuthLost?(): void;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) { super(message); }
}

export type Api = ReturnType<typeof createApi>;

export function createApi(o: ApiOptions) {
  let accessToken: string | null = null;
  let refreshing: Promise<AuthResponse> | null = null;

  async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (o.native) headers['X-Client'] = 'native';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(o.baseUrl + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      credentials: o.native ? 'omit' : 'include',
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? res.statusText;
      throw new ApiError(res.status, data, msg || `HTTP ${res.status}`);
    }
    return data as T;
  }

  async function handleAuth<T extends AuthResponse | MfaRequired>(r: T): Promise<T> {
    if ('accessToken' in r) {
      accessToken = r.accessToken;
      if (o.native && r.refreshToken) await o.setRefreshToken?.(r.refreshToken);
    }
    return r;
  }

  function refresh(): Promise<AuthResponse> {
    refreshing ??= (async () => {
      try {
        const body = o.native ? { refreshToken: await o.getRefreshToken?.() } : undefined;
        return await handleAuth(await raw<AuthResponse>('POST', '/auth/refresh', body, false));
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await raw<T>(method, path, body);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      try { await refresh(); } catch {
        accessToken = null;
        if (o.native) await o.setRefreshToken?.(null);
        o.onAuthLost?.();
        throw e;
      }
      return raw<T>(method, path, body);
    }
  }

  return {
    setAccessToken(t: string | null) { accessToken = t; },
    hasAccessToken: () => accessToken !== null,
    refresh,
    signup: (email: string, password: string) => raw<AuthResponse>('POST', '/auth/signup', { email, password }, false).then(handleAuth),
    login: (email: string, password: string) => raw<AuthResponse | MfaRequired>('POST', '/auth/login', { email, password }, false).then(handleAuth),
    loginMfa: (mfaToken: string, code: string) => raw<AuthResponse>('POST', '/auth/login/mfa', { mfaToken, code }, false).then(handleAuth),
    async logout() {
      const body = o.native ? { refreshToken: await o.getRefreshToken?.() } : undefined;
      try { await raw<void>('POST', '/auth/logout', body, false); } finally {
        accessToken = null;
        if (o.native) await o.setRefreshToken?.(null);
      }
    },
    me: () => call<User>('GET', '/auth/me'),
    forgotPassword: (email: string) => raw<void>('POST', '/auth/password/forgot', { email }, false),
    resetPassword: (token: string, password: string) => raw<void>('POST', '/auth/password/reset', { token, password }, false),
    changePassword: (current: string, next: string) => call<void>('POST', '/auth/password/change', { current, next }),
    mfaSetup: () => call<{ secret: string; otpauthUri: string }>('POST', '/auth/mfa/setup'),
    mfaEnable: (code: string) => call<{ recoveryCodes: string[] }>('POST', '/auth/mfa/enable', { code }),
    mfaDisable: (password: string, code: string) => call<void>('POST', '/auth/mfa/disable', { password, code }),
    listEntries: () => call<Entry[]>('GET', '/entries'),
    createEntry: (e: EntryInput) => call<Entry>('POST', '/entries', e),
    updateEntry: (id: string, e: Partial<EntryInput>) => call<Entry>('PATCH', `/entries/${id}`, e),
    deleteEntry: (id: string) => call<void>('DELETE', `/entries/${id}`),
    reorder: (ids: string[]) => call<void>('PUT', '/entries/order', { ids }),
    shareEntry: (id: string, memberIds: string[]) => call<Entry>('PUT', `/entries/${id}/share`, { memberIds }),
    codes: () => call<CodesResponse>('GET', '/codes'),
    listMembers: () => call<Member[]>('GET', '/members'),
    addMember: (email: string) => call<Member>('POST', '/members', { email }),
    removeMember: (id: string) => call<void>('DELETE', `/members/${id}`),
    importEntries: (entries: EntryInput[]) => call<{ imported: number; skipped: number }>('POST', '/vault/import', { entries }),
    exportVault: (password: string, code?: string) => call<ExportFile>('POST', '/vault/export', { password, code }),
  };
}
