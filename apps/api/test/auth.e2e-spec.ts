import { makeApp, signupUser, NATIVE, bearer, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

const post = (url: string, payload: unknown, headers: Record<string, string> = NATIVE) => t.app.inject({ method: 'POST', url, payload: payload as any, headers });

describe('auth', () => {
  it('signup returns tokens and rejects duplicates', async () => {
    const r = await post('/api/auth/signup', { email: 'Dup@Example.com', password: 'longenough1' });
    expect(r.statusCode).toBe(201);
    expect(r.json().accessToken).toBeTruthy();
    expect(r.json().user).toEqual({ id: expect.any(String), email: 'dup@example.com', role: 'owner', mfaEnabled: false });
    expect((await post('/api/auth/signup', { email: 'dup@example.com', password: 'longenough1' })).statusCode).toBe(409);
  });

  it('rejects short password and bad email', async () => {
    expect((await post('/api/auth/signup', { email: 'a@b.co', password: '123456789' })).statusCode).toBe(400);
    expect((await post('/api/auth/signup', { email: 'nope', password: 'longenough1' })).statusCode).toBe(400);
  });

  it('signup disabled', async () => {
    const t2 = await makeApp({ signupEnabled: false });
    const r = await t2.app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'x@y.zz', password: 'longenough1' } });
    expect(r.statusCode).toBe(403);
    await t2.close();
  });

  it('unknown email and wrong password look identical', async () => {
    const u = await signupUser(t.app);
    const a = await post('/api/auth/login', { email: 'ghost@example.com', password: 'whatever123' });
    const b = await post('/api/auth/login', { email: u.email, password: 'wrongpassword' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });

  it('web login sets httpOnly strict cookie and no body refresh token', async () => {
    const u = await signupUser(t.app);
    const r = await post('/api/auth/login', { email: u.email, password: u.password }, {});
    expect(r.statusCode).toBe(200);
    expect(r.json().refreshToken).toBeUndefined();
    const c = String(r.headers['set-cookie']);
    expect(c).toMatch(/^rt=/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/api\/auth/);
    const rt = c.split(';')[0].slice(3);
    const r2 = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies: { rt } });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().accessToken).toBeTruthy();
  });

  it('native refresh rotates; reuse revokes the whole session', async () => {
    const u = await signupUser(t.app);
    const r1 = await post('/api/auth/refresh', { refreshToken: u.refreshToken });
    expect(r1.statusCode).toBe(200);
    const next = r1.json().refreshToken;
    expect(next).toBeTruthy();
    expect(next).not.toBe(u.refreshToken);
    expect((await post('/api/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401); // reuse
    expect((await post('/api/auth/refresh', { refreshToken: next })).statusCode).toBe(401); // whole family dead
  });

  it('me requires auth', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    const u = await signupUser(t.app);
    const r = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(u.accessToken) });
    expect(r.json().email).toBe(u.email);
  });

  it('logout revokes refresh token', async () => {
    const u = await signupUser(t.app);
    expect((await post('/api/auth/logout', { refreshToken: u.refreshToken })).statusCode).toBe(204);
    expect((await post('/api/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
  });

  it('change password', async () => {
    const u = await signupUser(t.app);
    const h = { ...NATIVE, ...bearer(u.accessToken) };
    expect((await post('/api/auth/password/change', { current: 'wrong-pass-1', next: 'brand new password' }, h)).statusCode).toBe(401);
    const ch = await post('/api/auth/password/change', { current: u.password, next: 'brand new password' }, h);
    expect(ch.statusCode).toBe(200);
    expect(ch.json().refreshToken).toBeTruthy();
    expect((await post('/api/auth/refresh', { refreshToken: ch.json().refreshToken })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { email: u.email, password: u.password })).statusCode).toBe(401);
    expect((await post('/api/auth/login', { email: u.email, password: 'brand new password' })).statusCode).toBe(200);
    expect((await post('/api/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
  });

  it('a stale token from before a password change does not kill the new session', async () => {
    const u = await signupUser(t.app);
    const ch = await post('/api/auth/password/change', { current: u.password, next: 'another password!' }, { ...NATIVE, ...bearer(u.accessToken) });
    expect((await post('/api/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
    expect((await post('/api/auth/refresh', { refreshToken: ch.json().refreshToken })).statusCode).toBe(200);
  });
});
