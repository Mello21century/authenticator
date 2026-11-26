import mongoose from 'mongoose';
import { base32Decode } from '../src/crypto/base32';
import { totp } from '../src/crypto/totp';
import { makeApp, signupUser, NATIVE, bearer, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

type U = Awaited<ReturnType<typeof signupUser>>;
const req = (u: U, method: string, url: string, payload?: unknown) =>
  t.app.inject({ method: method as any, url, payload: payload as any, headers: { ...NATIVE, ...bearer(u.accessToken) } });
const input = (over: Record<string, unknown> = {}) => ({ issuer: 'GitHub', label: 'me', secret: 'jbsw y3dp ehpk 3pxp', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', ...over });

describe('entries', () => {
  it('creates, normalizes secret and never returns it', async () => {
    const u = await signupUser(t.app);
    const r = await req(u, 'POST', '/api/entries', input());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: expect.any(String), issuer: 'GitHub', label: 'me', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', order: 0, readOnly: false, sharedWith: [] });
    const list = await req(u, 'GET', '/api/entries');
    expect(list.body).not.toMatch(/JBSWY3DPEHPK3PXP|secret|"enc"/i);
  });

  it('stores ciphertext only', async () => {
    const u = await signupUser(t.app);
    await req(u, 'POST', '/api/entries', input({ secret: 'JBSWY3DPEHPK3PXQ' }));
    const conn = t.app.get<mongoose.Connection>((await import('@nestjs/mongoose')).getConnectionToken());
    const docs = await conn.collection('entries').find({ ownerId: new mongoose.Types.ObjectId(u.userId) }).toArray();
    expect(docs).toHaveLength(1);
    expect(JSON.stringify(docs)).not.toContain('JBSWY3DPEHPK3PXQ');
    expect(docs[0].enc.ct).toBeTruthy();
  });

  it('validation', async () => {
    const u = await signupUser(t.app);
    expect((await req(u, 'POST', '/api/entries', input({ secret: 'JBSW1!' }))).statusCode).toBe(400);
    expect((await req(u, 'POST', '/api/entries', input({ secret: 'AAAA' }))).statusCode).toBe(400); // too short (<10 bytes)
    expect((await req(u, 'POST', '/api/entries', input({ digits: 9 }))).statusCode).toBe(400);
    expect((await req(u, 'POST', '/api/entries', input({ period: 5 }))).statusCode).toBe(400);
    expect((await req(u, 'POST', '/api/entries', input({ algorithm: 'MD5' }))).statusCode).toBe(400);
  });

  it('duplicate secret is a conflict', async () => {
    const u = await signupUser(t.app);
    expect((await req(u, 'POST', '/api/entries', input())).statusCode).toBe(201);
    expect((await req(u, 'POST', '/api/entries', input({ issuer: 'Other', secret: 'JBSWY3DPEHPK3PXP' }))).statusCode).toBe(409);
  });

  it('codes match RFC computation', async () => {
    const u = await signupUser(t.app);
    const e = (await req(u, 'POST', '/api/entries', input({ algorithm: 'SHA256', digits: 8, period: 60 }))).json();
    const s = (await req(u, 'POST', '/api/entries', input({ secret: 'JBSWY3DPEHPK3PXQ', type: 'steam', digits: 6 }))).json();
    expect(s.digits).toBe(5);
    const r = (await req(u, 'GET', '/api/codes')).json();
    const c = r.codes.find((x: any) => x.entryId === e.id);
    const expected = totp(base32Decode('JBSWY3DPEHPK3PXP'), { algorithm: 'SHA256', digits: 8, period: 60, type: 'totp', now: r.serverTime });
    expect(c).toEqual({ entryId: e.id, code: expected.code, period: 60, expiresAt: expected.expiresAt });
    expect(r.codes.find((x: any) => x.entryId === s.id).code).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
  });

  it('other users cannot touch my entries', async () => {
    const a = await signupUser(t.app), b = await signupUser(t.app);
    const e = (await req(a, 'POST', '/api/entries', input())).json();
    expect((await req(b, 'PATCH', `/api/entries/${e.id}`, { label: 'pwned' })).statusCode).toBe(404);
    expect((await req(b, 'DELETE', `/api/entries/${e.id}`)).statusCode).toBe(404);
    expect((await req(b, 'GET', '/api/entries')).json()).toEqual([]);
    expect((await req(b, 'GET', '/api/codes')).json().codes).toEqual([]);
    expect((await req(b, 'PATCH', '/api/entries/not-an-id', { label: 'x' })).statusCode).toBe(404);
  });

  it('update, reorder and delete', async () => {
    const u = await signupUser(t.app);
    const a = (await req(u, 'POST', '/api/entries', input())).json();
    const b = (await req(u, 'POST', '/api/entries', input({ secret: 'JBSWY3DPEHPK3PXQ', issuer: 'B' }))).json();
    const p = await req(u, 'PATCH', `/api/entries/${a.id}`, { label: 'renamed' });
    expect(p.json().label).toBe('renamed');
    expect((await req(u, 'PUT', '/api/entries/order', { ids: [b.id, a.id] })).statusCode).toBe(204);
    expect((await req(u, 'GET', '/api/entries')).json().map((e: any) => e.id)).toEqual([b.id, a.id]);
    expect((await req(u, 'DELETE', `/api/entries/${a.id}`)).statusCode).toBe(204);
    expect((await req(u, 'GET', '/api/entries')).json()).toHaveLength(1);
  });
});
