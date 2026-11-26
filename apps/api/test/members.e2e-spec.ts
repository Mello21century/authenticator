import { makeApp, signupUser, NATIVE, bearer, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(() => t.close());

type Tok = { accessToken: string };
const req = (u: Tok, method: string, url: string, payload?: unknown) =>
  t.app.inject({ method: method as any, url, payload: payload as any, headers: { ...NATIVE, ...bearer(u.accessToken) } });
const post = (url: string, payload: unknown) => t.app.inject({ method: 'POST', url, payload: payload as any, headers: NATIVE });
const entry = (secret = 'JBSWY3DPEHPK3PXP') => ({ issuer: 'Netflix', label: 'family', secret });

async function ownerWithMember() {
  const owner = await signupUser(t.app);
  const email = `m${Math.random().toString(36).slice(2, 8)}@example.com`;
  const add = await req(owner, 'POST', '/api/members', { email });
  expect(add.statusCode).toBe(201);
  expect(add.json()).toEqual({ id: expect.any(String), email, activated: false, createdAt: expect.any(String) });
  const mail = t.mail.sent.at(-1)!;
  expect(mail.to).toBe(email);
  expect(mail.text).toContain('&invite=1');
  expect((await post('/api/auth/login', { email, password: 'anything123' })).statusCode).toBe(401); // not activated yet
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
  expect((await post('/api/auth/password/reset', { token, password: 'member password' })).statusCode).toBe(204);
  const login = await post('/api/auth/login', { email, password: 'member password' });
  expect(login.statusCode).toBe(200);
  expect(login.json().user.role).toBe('member');
  return { owner, member: { accessToken: login.json().accessToken as string, id: add.json().id as string, email } };
}

describe('members', () => {
  it('shares entries read-only', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await req(owner, 'GET', '/api/members')).json()[0]).toMatchObject({ id: member.id, activated: true });
    const e = (await req(owner, 'POST', '/api/entries', entry())).json();
    const s = await req(owner, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [member.id] });
    expect(s.statusCode).toBe(200);
    expect(s.json().sharedWith).toEqual([member.id]);

    const list = (await req(member, 'GET', '/api/entries')).json();
    expect(list).toEqual([expect.objectContaining({ id: e.id, readOnly: true, sharedWith: [] })]);
    const codes = (await req(member, 'GET', '/api/codes')).json().codes;
    expect(codes.map((c: any) => c.entryId)).toEqual([e.id]);

    expect((await req(member, 'PATCH', `/api/entries/${e.id}`, { label: 'x' })).statusCode).toBe(404);
    expect((await req(member, 'DELETE', `/api/entries/${e.id}`)).statusCode).toBe(404);
    expect((await req(member, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [] })).statusCode).toBe(403);
  });

  it('members cannot manage members', async () => {
    const { member } = await ownerWithMember();
    expect((await req(member, 'GET', '/api/members')).statusCode).toBe(403);
    expect((await req(member, 'POST', '/api/members', { email: 'z@example.com' })).statusCode).toBe(403);
  });

  it('cannot share to someone else\'s member or a stranger', async () => {
    const a = await ownerWithMember(), b = await ownerWithMember();
    const e = (await req(a.owner, 'POST', '/api/entries', entry())).json();
    expect((await req(a.owner, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [b.member.id] })).statusCode).toBe(400);
    expect((await req(a.owner, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [b.owner.userId] })).statusCode).toBe(400);
    expect((await req(b.owner, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [b.member.id] })).statusCode).toBe(404);
    expect((await req(b.owner, 'DELETE', `/api/members/${a.member.id}`)).statusCode).toBe(404);
  });

  it('owner cannot see member private entries', async () => {
    const { owner, member } = await ownerWithMember();
    expect((await req(member, 'POST', '/api/entries', entry('JBSWY3DPEHPK3PXQ'))).statusCode).toBe(201);
    expect((await req(owner, 'GET', '/api/entries')).json()).toEqual([]);
  });

  it('existing email is a conflict', async () => {
    const owner = await signupUser(t.app), other = await signupUser(t.app);
    expect((await req(owner, 'POST', '/api/members', { email: other.email })).statusCode).toBe(409);
  });

  it('deleting a member removes access, account and shares', async () => {
    const { owner, member } = await ownerWithMember();
    const e = (await req(owner, 'POST', '/api/entries', entry())).json();
    await req(owner, 'PUT', `/api/entries/${e.id}/share`, { memberIds: [member.id] });
    expect((await req(owner, 'DELETE', `/api/members/${member.id}`)).statusCode).toBe(204);
    expect((await req(member, 'GET', '/api/entries')).statusCode).toBe(401);
    expect((await post('/api/auth/login', { email: member.email, password: 'member password' })).statusCode).toBe(401);
    expect((await req(owner, 'GET', '/api/entries')).json()[0].sharedWith).toEqual([]);
    expect((await req(owner, 'GET', '/api/members')).json()).toEqual([]);
  });
});
