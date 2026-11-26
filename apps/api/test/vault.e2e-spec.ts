import { base32Decode } from '../src/crypto/base32';
import { totp } from '../src/crypto/totp';
import { makeApp, signupUser, NATIVE, bearer, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

type Tok = { accessToken: string };
const req = (u: Tok, method: string, url: string, payload?: unknown) =>
  t.app.inject({ method: method as any, url, payload: payload as any, headers: { ...NATIVE, ...bearer(u.accessToken) } });
const e = (secret: string, over: Record<string, unknown> = {}) => ({ issuer: 'X', label: secret.slice(-4), secret, algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', ...over });

describe('vault', () => {
  it('imports with duplicate skipping', async () => {
    const u = await signupUser(t.app);
    await req(u, 'POST', '/api/entries', e('JBSWY3DPEHPK3PXP'));
    const r = await req(u, 'POST', '/api/vault/import', { entries: [e('JBSWY3DPEHPK3PXP'), e('JBSWY3DPEHPK3PXQ'), e('JBSWY3DPEHPK3PXR'), e('jbswy3dpehpk3pxr')] });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ imported: 2, skipped: 2 });
    expect((await req(u, 'GET', '/api/entries')).json()).toHaveLength(3);
  });

  it('all or nothing on invalid items', async () => {
    const u = await signupUser(t.app);
    const r = await req(u, 'POST', '/api/vault/import', { entries: [e('JBSWY3DPEHPK3PXQ'), e('NOT-BASE32-!!')] });
    expect(r.statusCode).toBe(400);
    expect((await req(u, 'GET', '/api/entries')).json()).toHaveLength(0);
  });

  it('export needs password (and code when mfa on), roundtrips into a fresh account', async () => {
    const u = await signupUser(t.app);
    await req(u, 'POST', '/api/vault/import', { entries: [e('JBSWY3DPEHPK3PXQ', { algorithm: 'SHA512', digits: 8, period: 60 }), e('JBSWY3DPEHPK3PXR', { type: 'steam' })] });
    expect((await req(u, 'POST', '/api/vault/export', { password: 'wrong password' })).statusCode).toBe(401);
    const x = await req(u, 'POST', '/api/vault/export', { password: u.password });
    expect(x.statusCode).toBe(200);
    const file = x.json();
    expect(file.version).toBe(1);
    expect(file.entries).toHaveLength(2);
    expect(file.entries[0]).toMatchObject({ secret: 'JBSWY3DPEHPK3PXQ', algorithm: 'SHA512', digits: 8, period: 60 });
    expect(file.entries[0].uri).toMatch(/^otpauth:\/\/totp\/X:3PXQ\?secret=JBSWY3DPEHPK3PXQ&issuer=X&algorithm=SHA512&digits=8&period=60$/);
    expect(file.entries[1].uri).toContain('encoder=steam');

    const fresh = await signupUser(t.app);
    const imp = await req(fresh, 'POST', '/api/vault/import', { entries: file.entries.map(({ uri, ...rest }: any) => rest) });
    expect(imp.json()).toEqual({ imported: 2, skipped: 0 });
    const a = (await req(u, 'GET', '/api/codes')).json().codes.map((c: any) => c.code).sort();
    const b = (await req(fresh, 'GET', '/api/codes')).json().codes.map((c: any) => c.code).sort();
    if (Math.floor(Date.now() / 30000) === Math.floor((Date.now() - 50) / 30000)) expect(a).toEqual(b);

    // enable mfa → code required
    const setup = (await req(u, 'POST', '/api/auth/mfa/setup')).json();
    const code = () => totp(base32Decode(setup.secret), { algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' }).code;
    await req(u, 'POST', '/api/auth/mfa/enable', { code: code() });
    expect((await req(u, 'POST', '/api/vault/export', { password: u.password })).statusCode).toBe(401);
    expect((await req(u, 'POST', '/api/vault/export', { password: u.password, code: code() })).statusCode).toBe(200);
  });

  it('member export excludes shared entries', async () => {
    const owner = await signupUser(t.app);
    const email = `m${Math.random().toString(36).slice(2, 8)}@example.com`;
    const m = (await req(owner, 'POST', '/api/members', { email })).json();
    const token = /token=([A-Za-z0-9_-]+)/.exec(t.mail.sent.at(-1)!.text)![1];
    await t.app.inject({ method: 'POST', url: '/api/auth/password/reset', payload: { token, password: 'member password' } });
    const member = (await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: NATIVE, payload: { email, password: 'member password' } })).json();
    const shared = (await req(owner, 'POST', '/api/entries', e('JBSWY3DPEHPK3PXQ'))).json();
    await req(owner, 'PUT', `/api/entries/${shared.id}/share`, { memberIds: [m.id] });
    await req(member, 'POST', '/api/entries', e('JBSWY3DPEHPK3PXR'));
    const x = (await req(member, 'POST', '/api/vault/export', { password: 'member password' })).json();
    expect(x.entries.map((y: any) => y.secret)).toEqual(['JBSWY3DPEHPK3PXR']);
  });
});
