import { makeApp, type TestApp } from './helpers';

describe('app version (mobile force update)', () => {
  let t: TestApp;
  afterEach(() => t?.close());

  it('is public and defaults to no minimum', async () => {
    t = await makeApp();
    const r = await t.app.inject({ method: 'GET', url: '/api/app/version' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ minVersion: '0.0.0', iosUrl: '', androidUrl: '' });
  });

  it('returns the configured minimum and store links', async () => {
    t = await makeApp({ minAppVersion: '1.2.0', iosStoreUrl: 'https://apps.apple.com/app/id1', androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.sz4h.authenticator' });
    expect((await t.app.inject({ method: 'GET', url: '/api/app/version' })).json()).toEqual({
      minVersion: '1.2.0', iosUrl: 'https://apps.apple.com/app/id1', androidUrl: 'https://play.google.com/store/apps/details?id=com.sz4h.authenticator',
    });
  });
});
