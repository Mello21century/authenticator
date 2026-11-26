import { randomBytes } from 'node:crypto';
import { loadConfig } from './config';

const good = {
  MONGO_URL: 'mongodb://x/y', JWT_SECRET: 'x'.repeat(32), VAULT_MASTER_KEY: randomBytes(32).toString('base64'),
  RESEND_API_KEY: 're_1', MAIL_FROM: 'a@b.c', APP_URL: 'https://a.b',
};

describe('loadConfig', () => {
  it('lists every missing key', () => {
    expect(() => loadConfig({})).toThrow(/MONGO_URL[\s\S]*JWT_SECRET[\s\S]*VAULT_MASTER_KEY/);
  });
  it('rejects a short vault key', () => {
    expect(() => loadConfig({ ...good, VAULT_MASTER_KEY: randomBytes(16).toString('base64') })).toThrow(/VAULT_MASTER_KEY/);
  });
  it('parses defaults', () => {
    const c = loadConfig(good);
    expect(c.port).toBe(3000);
    expect(c.signupEnabled).toBe(true);
    expect(c.vaultKey.length).toBe(32);
    expect(c.corsOrigins).toEqual([]);
  });
  it('SIGNUP_ENABLED=false and CORS list', () => {
    const c = loadConfig({ ...good, SIGNUP_ENABLED: 'false', CORS_ORIGINS: 'app://authenticator, http://localhost:5173' });
    expect(c.signupEnabled).toBe(false);
    expect(c.corsOrigins).toEqual(['app://authenticator', 'http://localhost:5173']);
  });
});
