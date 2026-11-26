import { totp, verifyTotp } from './totp';

const k = (s: string) => Buffer.from(s, 'ascii');
const opts = (algorithm: 'SHA1' | 'SHA256' | 'SHA512', now: number) => ({ algorithm, digits: 8, period: 30, type: 'totp' as const, now });

describe('totp (RFC 6238)', () => {
  it('SHA1 vectors', () => {
    expect(totp(k('12345678901234567890'), opts('SHA1', 59_000)).code).toBe('94287082');
    expect(totp(k('12345678901234567890'), opts('SHA1', 1111111109_000)).code).toBe('07081804');
  });
  it('SHA256 vector', () => {
    expect(totp(k('12345678901234567890123456789012'), opts('SHA256', 59_000)).code).toBe('46119246');
  });
  it('SHA512 vector', () => {
    expect(totp(k('1234567890'.repeat(6) + '1234'), opts('SHA512', 59_000)).code).toBe('90693936');
  });
  it('expiresAt is the next period boundary', () => {
    expect(totp(k('12345678901234567890'), opts('SHA1', 59_000)).expiresAt).toBe(60_000);
  });
  it('steam codes use the steam alphabet', () => {
    const { code } = totp(k('12345678901234567890'), { algorithm: 'SHA1', digits: 5, period: 30, type: 'steam', now: 59_000 });
    expect(code).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
  });
  it('verifyTotp accepts current and adjacent step only', () => {
    const s = k('12345678901234567890');
    const now = 1_700_000_000_000;
    const code = totp(s, { algorithm: 'SHA1', digits: 6, period: 30, type: 'totp', now }).code;
    expect(verifyTotp(s, code, now)).toBe(true);
    expect(verifyTotp(s, code, now + 30_000)).toBe(true);
    expect(verifyTotp(s, code, now + 90_000)).toBe(false);
    expect(verifyTotp(s, '12345', now)).toBe(false);
  });
});
