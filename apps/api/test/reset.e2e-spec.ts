import { makeApp, signupUser, NATIVE, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

const post = (url: string, payload: unknown) => t.app.inject({ method: 'POST', url, payload: payload as any, headers: NATIVE });
const tokenFrom = (text: string) => /[?&]token=([A-Za-z0-9_-]+)/.exec(text)![1];

describe('password reset', () => {
  it('unknown email: 204 and no mail', async () => {
    const before = t.mail.sent.length;
    expect((await post('/api/auth/password/forgot', { email: 'ghost@example.com' })).statusCode).toBe(204);
    expect(t.mail.sent.length).toBe(before);
  });

  it('full reset flow, single use, revokes sessions', async () => {
    const u = await signupUser(t.app);
    expect((await post('/api/auth/password/forgot', { email: u.email.toUpperCase() })).statusCode).toBe(204);
    const m = t.mail.sent.at(-1)!;
    expect(m.to).toBe(u.email);
    expect(m.text).toContain('https://app.test/reset?token=');
    const token = tokenFrom(m.text);
    expect((await post('/api/auth/password/reset', { token, password: 'my new password' })).statusCode).toBe(204);
    expect((await post('/api/auth/login', { email: u.email, password: 'my new password' })).statusCode).toBe(200);
    expect((await post('/api/auth/login', { email: u.email, password: u.password })).statusCode).toBe(401);
    expect((await post('/api/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
    const again = await post('/api/auth/password/reset', { token, password: 'other password 2' });
    expect(again.statusCode).toBe(400);
    expect(again.json().message).toBe('Invalid or expired link');
  });

  it('garbage token', async () => {
    expect((await post('/api/auth/password/reset', { token: 'x'.repeat(43), password: 'my new password' })).statusCode).toBe(400);
  });
});
