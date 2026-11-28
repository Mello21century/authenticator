import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
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

describe('health without database', () => {
  it('returns 503 when MongoDB is unreachable', async () => {
    const t = await makeApp();
    await t.app.get<Connection>(getConnectionToken()).close();
    const r = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(503);
    await t.close();
  });
});
