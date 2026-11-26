import { makeApp } from './helpers';

describe('health', () => {
  it('GET /api/health', async () => {
    const t = await makeApp();
    const r = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await t.close();
  });
});
