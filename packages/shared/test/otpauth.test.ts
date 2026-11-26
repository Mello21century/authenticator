import { describe, it, expect } from 'vitest';
import { normalizeBase32, base32Encode, base32Decode, parseOtpauthUri, buildOtpauthUri, type EntryInput } from '../src';

describe('base32', () => {
  it('normalizes spaces, dashes, case and padding', () => {
    expect(normalizeBase32('jbsw y3dp-ehpk 3pxp==')).toBe('JBSWY3DPEHPK3PXP');
  });
  it('rejects invalid chars', () => {
    expect(() => normalizeBase32('JBSW1')).toThrow('Invalid base32');
  });
  it('roundtrips', () => {
    expect(base32Encode(base32Decode('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
    expect(Array.from(base32Decode('JBSWY3DPEHPK3PXP'))).toEqual([72, 101, 108, 108, 111, 33, 0xde, 0xad, 0xbe, 0xef]);
  });
});

describe('otpauth', () => {
  const sample: EntryInput = { issuer: 'ACME Co', label: 'john@example.com', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA256', digits: 8, period: 60, type: 'totp' };
  it('parses a full uri', () => {
    expect(parseOtpauthUri('otpauth://totp/ACME%20Co:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60')).toEqual(sample);
  });
  it('defaults and lowercase secret', () => {
    const e = parseOtpauthUri('otpauth://totp/x?secret=jbswy3dpehpk3pxp');
    expect(e).toEqual({ issuer: '', label: 'x', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' });
  });
  it('takes issuer from label prefix', () => {
    expect(parseOtpauthUri('otpauth://totp/GitHub:me?secret=JBSWY3DPEHPK3PXP').issuer).toBe('GitHub');
  });
  it('steam', () => {
    const e = parseOtpauthUri('otpauth://totp/Steam:me?secret=JBSWY3DPEHPK3PXP&encoder=steam');
    expect(e.type).toBe('steam');
    expect(e.digits).toBe(5);
  });
  it('rejects hotp, non-otpauth and missing secret', () => {
    expect(() => parseOtpauthUri('otpauth://hotp/x?secret=AAAA')).toThrow();
    expect(() => parseOtpauthUri('https://x')).toThrow();
    expect(() => parseOtpauthUri('otpauth://totp/x')).toThrow();
  });
  it('roundtrips build/parse', () => {
    expect(parseOtpauthUri(buildOtpauthUri(sample))).toEqual(sample);
  });
});
