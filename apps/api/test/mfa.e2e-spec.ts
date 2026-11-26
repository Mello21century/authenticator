import { base32Decode } from '../src/crypto/base32';
import { totp } from '../src/crypto/totp';
import { makeApp, signupUser, NATIVE, bearer, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

const post = (url: string, payload: unknown, headers: Record<string, string> = NATIVE) => t.app.inject({ method: 'POST', url, payload: payload as any, headers });
const codeFor = (secret: string, now = Date.now()) => totp(base32Decode(secret), { algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', now }).code;

async function enrolled() {
  const u = await signupUser(t.app);
  const h = { ...NATIVE, ...bearer(u.accessToken) };
  const setup = await post('/api/auth/mfa/setup', {}, h);
  expect(setup.statusCode).toBe(200);
  const { secret, otpauthUri } = setup.json();
  expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//);
  expect((await post('/api/auth/mfa/enable', { code: '000000' === codeFor(secret) ? '111111' : '000000' }, h)).statusCode).toBe(400);
  const en = await post('/api/auth/mfa/enable', { code: codeFor(secret) }, h);
  expect(en.statusCode).toBe(200);
  return { ...u, h, secret, recoveryCodes: en.json().recoveryCodes as string[] };
}

describe('login mfa', () => {
  it('enables with 10 recovery codes and challenges login', async () => {
    const u = await enrolled();
    expect(u.recoveryCodes).toHaveLength(10);
    expect(u.recoveryCodes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: u.h });
    expect(me.json().mfaEnabled).toBe(true);
    const l = await post('/api/auth/login', { email: u.email, password: u.password });
    expect(l.json()).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(l.json().accessToken).toBeUndefined();
    const ok = await post('/api/auth/login/mfa', { mfaToken: l.json().mfaToken, code: codeFor(u.secret) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toBeTruthy();
  });

  it('setup twice after enabling is a conflict', async () => {
    const u = await enrolled();
    expect((await post('/api/auth/mfa/setup', {}, u.h)).statusCode).toBe(409);
  });

  it('recovery code works once', async () => {
    const u = await enrolled();
    const l = await post('/api/auth/login', { email: u.email, password: u.password });
    const mfaToken = l.json().mfaToken;
    expect((await post('/api/auth/login/mfa', { mfaToken, code: u.recoveryCodes[0].toUpperCase() })).statusCode).toBe(200);
    expect((await post('/api/auth/login/mfa', { mfaToken, code: u.recoveryCodes[0] })).statusCode).toBe(401);
  });

  it('rejects garbage mfa token and access token used as mfa token', async () => {
    const u = await enrolled();
    expect((await post('/api/auth/login/mfa', { mfaToken: 'garbage', code: codeFor(u.secret) })).statusCode).toBe(401);
    expect((await post('/api/auth/login/mfa', { mfaToken: u.accessToken, code: codeFor(u.secret) })).statusCode).toBe(401);
  });

  it('wrong code is rejected', async () => {
    const u = await enrolled();
    const l = await post('/api/auth/login', { email: u.email, password: u.password });
    const wrong = codeFor(u.secret, Date.now() + 10 * 60_000);
    expect((await post('/api/auth/login/mfa', { mfaToken: l.json().mfaToken, code: wrong })).statusCode).toBe(401);
  });

  it('disable needs password and code', async () => {
    const u = await enrolled();
    expect((await post('/api/auth/mfa/disable', { password: 'wrong-password', code: codeFor(u.secret) }, u.h)).statusCode).toBe(401);
    expect((await post('/api/auth/mfa/disable', { password: u.password, code: codeFor(u.secret) }, u.h)).statusCode).toBe(204);
    const l = await post('/api/auth/login', { email: u.email, password: u.password });
    expect(l.json().accessToken).toBeTruthy();
  });
});
