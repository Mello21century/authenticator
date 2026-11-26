import { createHmac, timingSafeEqual } from 'node:crypto';

export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';
export interface TotpOptions { algorithm: Algorithm; digits: number; period: number; type: 'totp' | 'steam'; now?: number }

const STEAM = '23456789BCDFGHJKMNPQRTVWXY';

function hotpInt(secret: Buffer, counter: number, algorithm: Algorithm): number {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algorithm.toLowerCase(), secret).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  return h.readUInt32BE(off) & 0x7fffffff; // RFC 4226 dynamic truncation
}

export function totp(secret: Buffer, o: TotpOptions): { code: string; expiresAt: number } {
  const now = o.now ?? Date.now();
  const step = Math.floor(now / 1000 / o.period);
  const expiresAt = (step + 1) * o.period * 1000;
  let n = hotpInt(secret, step, o.algorithm);
  if (o.type === 'steam') {
    let code = '';
    for (let i = 0; i < 5; i++) { code += STEAM[n % STEAM.length]; n = Math.floor(n / STEAM.length); }
    return { code, expiresAt };
  }
  return { code: String(n % 10 ** o.digits).padStart(o.digits, '0'), expiresAt };
}

/** Login MFA check: SHA1 / 6 digits / 30s, ±1 step window. */
export function verifyTotp(secret: Buffer, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (const d of [-1, 0, 1]) {
    const c = totp(secret, { algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', now: now + d * 30_000 }).code;
    if (timingSafeEqual(Buffer.from(c), Buffer.from(code))) ok = true;
  }
  return ok;
}
