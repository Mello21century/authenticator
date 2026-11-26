import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { makeApp, signupUser, NATIVE, bearer } from './helpers';

describe('hardening', () => {
  it('rate limit keys on the proxy-added client ip, not a spoofed leftmost X-Forwarded-For', async () => {
    const t = await makeApp({ disableThrottle: false, trustProxyHops: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await t.app.inject({
        method: 'POST', url: '/api/auth/login/mfa', payload: { mfaToken: 'x', code: '123456' },
        headers: { 'x-forwarded-for': `10.9.9.${i}, 203.0.113.5` },
      });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 5).every(c => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    await t.close();
  });

  it('reusing a just-rotated token (multi-tab race) does not sign out other sessions', async () => {
    const t = await makeApp();
    const u = await signupUser(t.app);
    const post = (p: unknown) => t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: NATIVE, payload: p as any });
    const next = (await post({ refreshToken: u.refreshToken })).json().refreshToken;
    expect((await post({ refreshToken: u.refreshToken })).statusCode).toBe(401); // racing tab
    expect((await post({ refreshToken: next })).statusCode).toBe(200); // still alive
    await t.close();
  });

  it('one undecryptable entry does not break /codes', async () => {
    const t = await makeApp();
    const u = await signupUser(t.app);
    const h = { ...NATIVE, ...bearer(u.accessToken) };
    await t.app.inject({ method: 'POST', url: '/api/entries', headers: h, payload: { issuer: 'A', secret: 'JBSWY3DPEHPK3PXP' } });
    await t.app.inject({ method: 'POST', url: '/api/entries', headers: h, payload: { issuer: 'B', secret: 'JBSWY3DPEHPK3PXQ' } });
    const conn = t.app.get<Connection>(getConnectionToken());
    await conn.collection('entries').updateOne({ issuer: 'B' }, { $set: { 'enc.tag': Buffer.alloc(16).toString('base64') } });
    const r = await t.app.inject({ method: 'GET', url: '/api/codes', headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json().codes).toHaveLength(1);
    await t.close();
  });

  it('concurrent duplicate imports never 500', async () => {
    const t = await makeApp();
    const u = await signupUser(t.app);
    const h = { ...NATIVE, ...bearer(u.accessToken) };
    const entries = Array.from({ length: 20 }, (_, i) => ({ issuer: `I${i}`, secret: `JBSWY3DPEHPK3P${'ABCDEFGHIJKLMNOPQRST'[i]}A` }));
    const rs = await Promise.all([1, 2, 3].map(() => t.app.inject({ method: 'POST', url: '/api/vault/import', headers: h, payload: { entries } })));
    expect(rs.map(r => r.statusCode)).toEqual([200, 200, 200]);
    expect(rs.reduce((n, r) => n + r.json().imported, 0)).toBe(20);
    await t.close();
  });
});
