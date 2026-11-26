export interface AppConfig {
  port: number;
  mongoUrl: string;
  jwtSecret: string;
  vaultKey: Buffer;
  resendApiKey: string;
  mailFrom: string;
  appUrl: string;
  signupEnabled: boolean;
  corsOrigins: string[];
  /** number of reverse proxies in front of the api (Traefik + nginx = 2) */
  trustProxyHops: number;
  /** test-only: never read from env */
  disableThrottle?: boolean;
}

export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const errors: string[] = [];
  const req = (k: string) => {
    const v = env[k]?.trim();
    if (!v) errors.push(`${k} is required`);
    return v ?? '';
  };
  const mongoUrl = req('MONGO_URL');
  const jwtSecret = req('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
  const rawKey = req('VAULT_MASTER_KEY');
  const vaultKey = Buffer.from(rawKey, 'base64');
  if (rawKey && vaultKey.length !== 32) errors.push('VAULT_MASTER_KEY must be base64 of exactly 32 bytes (openssl rand -base64 32)');
  const resendApiKey = req('RESEND_API_KEY');
  const mailFrom = req('MAIL_FROM');
  const appUrl = req('APP_URL').replace(/\/+$/, '');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) errors.push('PORT must be a positive integer');
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 2);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) errors.push('TRUST_PROXY_HOPS must be a non-negative integer');
  if (errors.length) throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  return {
    port, mongoUrl, jwtSecret, vaultKey, resendApiKey, mailFrom, appUrl,
    signupEnabled: (env.SIGNUP_ENABLED ?? 'true').toLowerCase() !== 'false',
    trustProxyHops,
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
