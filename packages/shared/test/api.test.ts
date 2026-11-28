import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApi, ApiError, isSessionRejected } from '../src';

type Call = { url: string; init: RequestInit };
let calls: Call[];
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: any, init: any = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); }) as any;
}
const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const user = { id: 'u1', email: 'a@b.c', role: 'owner', mfaEnabled: false };

describe('api client', () => {
  beforeEach(() => { calls = []; });

  it('sends bearer token', async () => {
    mockFetch(() => json(200, []));
    const api = createApi({ baseUrl: 'http://x/api', native: false });
    api.setAccessToken('tok');
    await api.listEntries();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(calls[0].init.credentials).toBe('include');
  });

  it('refreshes once for concurrent 401s then retries', async () => {
    let fresh = false;
    mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) { fresh = true; return json(200, { accessToken: 'new', user }); }
      const auth = (init.headers as Record<string, string>).Authorization;
      return fresh && auth === 'Bearer new' ? json(200, []) : json(401, { message: 'no' });
    });
    const api = createApi({ baseUrl: 'http://x/api', native: false });
    api.setAccessToken('old');
    await Promise.all([api.listEntries(), api.codes(), api.listMembers()]);
    expect(calls.filter(c => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('calls onAuthLost when refresh fails', async () => {
    mockFetch(() => json(401, { message: 'no' }));
    const onAuthLost = vi.fn();
    const api = createApi({ baseUrl: 'http://x/api', native: false, onAuthLost });
    api.setAccessToken('old');
    await expect(api.listEntries()).rejects.toBeInstanceOf(ApiError);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('keeps the stored session when refresh fails because the server is down', async () => {
    let stored: string | null = 'r1';
    mockFetch(url => url.endsWith('/auth/refresh') ? json(500, { message: 'Internal server error' }) : json(401, { message: 'no' }));
    const onAuthLost = vi.fn();
    const api = createApi({ baseUrl: 'http://x/api', native: true, onAuthLost, getRefreshToken: async () => stored, setRefreshToken: async t => { stored = t; } });
    api.setAccessToken('old');
    await expect(api.listEntries()).rejects.toMatchObject({ status: 500 });
    expect(stored).toBe('r1');
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it('native refresh with no saved token is rejected without calling the server', async () => {
    mockFetch(() => json(500, {}));
    const api = createApi({ baseUrl: 'http://x/api', native: true, getRefreshToken: async () => null, setRefreshToken: async () => {} });
    await expect(api.refresh()).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });

  it('isSessionRejected is true only for 401', () => {
    expect(isSessionRejected(new ApiError(401, null, 'x'))).toBe(true);
    expect(isSessionRejected(new ApiError(500, null, 'x'))).toBe(false);
    expect(isSessionRejected(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('turns a non-JSON error page into an ApiError', async () => {
    mockFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const api = createApi({ baseUrl: 'http://x/api', native: false });
    await expect(api.appVersion()).rejects.toMatchObject({ status: 502 });
  });

  it('native mode sends refresh token in body and stores rotated one', async () => {
    let stored: string | null = 'r1';
    mockFetch(() => json(200, { accessToken: 'a2', refreshToken: 'r2', user }));
    const api = createApi({ baseUrl: 'http://x/api', native: true, getRefreshToken: async () => stored, setRefreshToken: async t => { stored = t; } });
    await api.refresh();
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ refreshToken: 'r1' });
    expect((calls[0].init.headers as Record<string, string>)['X-Client']).toBe('native');
    expect(stored).toBe('r2');
  });

  it('login stores native refresh token and returns mfa challenge untouched', async () => {
    let stored: string | null = null;
    mockFetch(() => json(200, { mfaRequired: true, mfaToken: 'm' }));
    const api = createApi({ baseUrl: 'http://x/api', native: true, getRefreshToken: async () => stored, setRefreshToken: async t => { stored = t; } });
    expect(await api.login('a@b.c', 'pw')).toEqual({ mfaRequired: true, mfaToken: 'm' });
    expect(stored).toBeNull();
  });

  it('throws ApiError with server message', async () => {
    mockFetch(() => json(409, { message: 'Duplicate entry' }));
    const api = createApi({ baseUrl: 'http://x/api', native: false });
    await expect(api.createEntry({} as any)).rejects.toMatchObject({ status: 409, message: 'Duplicate entry' });
  });
});
