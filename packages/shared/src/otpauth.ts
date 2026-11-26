import { normalizeBase32 } from './base32';
import type { Algorithm, EntryInput } from './types';

const ALGOS: Algorithm[] = ['SHA1', 'SHA256', 'SHA512'];

export function parseOtpauthUri(uri: string): EntryInput {
  const m = /^otpauth:\/\/([a-z]+)\/([^?]*)(?:\?(.*))?$/i.exec(uri.trim());
  if (!m) throw new Error('Not an otpauth:// URI');
  const kind = m[1].toLowerCase();
  if (kind !== 'totp' && kind !== 'steam') throw new Error(`Unsupported OTP type: ${kind}`);
  const params = new URLSearchParams(m[3] ?? '');
  const rawSecret = params.get('secret');
  if (!rawSecret) throw new Error('Missing secret');

  const path = decodeURIComponent(m[2]);
  const colon = path.indexOf(':');
  const label = (colon >= 0 ? path.slice(colon + 1) : path).trim();
  const issuer = (params.get('issuer') ?? (colon >= 0 ? path.slice(0, colon) : '')).trim();

  const steam = kind === 'steam' || params.get('encoder')?.toLowerCase() === 'steam';
  const algorithm = (params.get('algorithm')?.toUpperCase() ?? 'SHA1') as Algorithm;
  if (!ALGOS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`);
  const digits = steam ? 5 : Number(params.get('digits') ?? 6);
  const period = Number(params.get('period') ?? 30);
  if (!steam && ![6, 7, 8].includes(digits)) throw new Error('Digits must be 6, 7 or 8');
  if (!Number.isInteger(period) || period < 15 || period > 120) throw new Error('Period must be 15-120');

  return { issuer, label, secret: normalizeBase32(rawSecret), algorithm, digits, period, type: steam ? 'steam' : 'totp' };
}

export function buildOtpauthUri(e: EntryInput): string {
  const name = e.issuer ? `${encodeURIComponent(e.issuer)}:${encodeURIComponent(e.label)}` : encodeURIComponent(e.label);
  const p = new URLSearchParams({ secret: e.secret });
  if (e.issuer) p.set('issuer', e.issuer);
  p.set('algorithm', e.algorithm);
  p.set('digits', String(e.digits));
  p.set('period', String(e.period));
  if (e.type === 'steam') p.set('encoder', 'steam');
  return `otpauth://totp/${name}?${p.toString()}`;
}
