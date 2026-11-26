import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importVault } from '../src';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const base = { algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' } as const;

// tiny protobuf encoder for the test payload
function varint(n: number): number[] { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return o; }
function field(no: number, v: number[] | number): number[] {
  return typeof v === 'number' ? [...varint((no << 3) | 0), ...varint(v)] : [...varint((no << 3) | 2), ...varint(v.length), ...v];
}
const str = (s: string) => Array.from(new TextEncoder().encode(s));
function migrationUri(params: number[][]): string {
  const payload = params.flatMap(p => field(1, p));
  return 'otpauth-migration://offline?data=' + encodeURIComponent(Buffer.from(payload).toString('base64'));
}

describe('importVault', () => {
  it('aegis plain', () => {
    const r = importVault(fx('aegis.json'));
    expect(r.entries).toEqual([
      { ...base, issuer: 'GitHub', label: 'john@example.com', secret: 'JBSWY3DPEHPK3PXP' },
      { ...base, issuer: 'Steam', label: 'gamer', secret: 'JBSWY3DPEHPK3PXQ', digits: 5, type: 'steam' },
    ]);
    expect(r.errors).toHaveLength(1);
  });
  it('aegis encrypted throws', () => {
    expect(() => importVault(fx('aegis-encrypted.json'))).toThrow(/Encrypted Aegis/);
  });
  it('2fas', () => {
    expect(importVault(fx('2fas.json'), '2fas').entries).toEqual([
      { ...base, issuer: 'Google', label: 'me@gmail.com', secret: 'JBSWY3DPEHPK3PXP' },
      { ...base, issuer: 'AWS', label: 'root', secret: 'JBSWY3DPEHPK3PXQ', algorithm: 'SHA256', digits: 8, period: 60 },
    ]);
  });
  it('2fas encrypted throws', () => {
    expect(() => importVault('{"schemaVersion":4,"services":[],"servicesEncrypted":"x"}')).toThrow(/Encrypted 2FAS/);
  });
  it('proton', () => {
    expect(importVault(fx('proton.json')).entries).toEqual([{ ...base, issuer: 'Proton', label: 'me@proton.me', secret: 'JBSWY3DPEHPK3PXP' }]);
  });
  it('uri list with a bad line', () => {
    const r = importVault(fx('uris.txt'));
    expect(r.entries.map(e => e.label)).toEqual(['one', 'two']);
    expect(r.errors).toHaveLength(1);
  });
  it('google authenticator migration', () => {
    const secret = [72, 101, 108, 108, 111, 33, 0xde, 0xad, 0xbe, 0xef];
    const totp = [...field(1, secret), ...field(2, str('john')), ...field(3, str('ACME')), ...field(4, 1), ...field(5, 1), ...field(6, 2)];
    const hotp = [...field(1, secret), ...field(2, str('h')), ...field(6, 1)];
    const r = importVault(migrationUri([totp, hotp]));
    expect(r.entries).toEqual([{ ...base, issuer: 'ACME', label: 'john', secret: 'JBSWY3DPEHPK3PXP' }]);
    expect(r.errors).toHaveLength(1);
  });
  it('google migration with junk data throws', () => {
    expect(() => importVault('otpauth-migration://offline?data=%%%')).toThrow();
  });
  it('unknown format throws', () => {
    expect(() => importVault('{"foo":1}')).toThrow('Unrecognized import format');
    expect(() => importVault('hello')).toThrow('Unrecognized import format');
  });
});
