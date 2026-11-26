import { base32Encode, normalizeBase32 } from './base32';
import { parseOtpauthUri } from './otpauth';
import type { Algorithm, EntryInput } from './types';

export type ImportFormat = 'auto' | 'aegis' | '2fas' | 'proton' | 'gauth-migration' | 'uri-list';
export interface ImportResult { entries: EntryInput[]; errors: string[] }

const ALGOS: Algorithm[] = ['SHA1', 'SHA256', 'SHA512'];

/** Build + validate an entry; throws on bad data so callers can collect per-item errors. */
function entry(p: { issuer?: string; label?: string; secret?: string; algorithm?: string; digits?: number; period?: number; steam?: boolean }): EntryInput {
  if (!p.secret) throw new Error('missing secret');
  const algorithm = (p.algorithm ?? 'SHA1').toUpperCase() as Algorithm;
  if (!ALGOS.includes(algorithm)) throw new Error(`unsupported algorithm ${algorithm}`);
  const digits = p.steam ? 5 : p.digits ?? 6;
  const period = p.period ?? 30;
  if (!p.steam && ![6, 7, 8].includes(digits)) throw new Error('bad digits');
  if (period < 15 || period > 120) throw new Error('bad period');
  return { issuer: (p.issuer ?? '').trim(), label: (p.label ?? '').trim(), secret: normalizeBase32(p.secret), algorithm, digits, period, type: p.steam ? 'steam' : 'totp' };
}

function collect<T>(items: T[], name: (t: T, i: number) => string, map: (t: T) => EntryInput): ImportResult {
  const res: ImportResult = { entries: [], errors: [] };
  items.forEach((it, i) => {
    try { res.entries.push(map(it)); } catch (e) { res.errors.push(`${name(it, i)}: ${(e as Error).message}`); }
  });
  return res;
}

function aegis(j: any): ImportResult {
  if (typeof j.db === 'string') throw new Error('Encrypted Aegis export not supported; export it unencrypted');
  return collect(j.db?.entries ?? [], (e: any, i) => e?.issuer || e?.name || `#${i + 1}`, (e: any) => {
    if (e.type !== 'totp' && e.type !== 'steam') throw new Error(`unsupported type ${e.type}`);
    return entry({ issuer: e.issuer, label: e.name, secret: e.info?.secret, algorithm: e.info?.algo, digits: e.info?.digits, period: e.info?.period, steam: e.type === 'steam' });
  });
}

function twofas(j: any): ImportResult {
  if (j.servicesEncrypted) throw new Error('Encrypted 2FAS backup not supported; export it without a password');
  return collect(j.services ?? [], (s: any, i) => s?.name || `#${i + 1}`, (s: any) => {
    const t = (s.otp?.tokenType ?? 'TOTP').toUpperCase();
    if (t !== 'TOTP' && t !== 'STEAM') throw new Error(`unsupported type ${t}`);
    return entry({ issuer: s.otp?.issuer || s.name, label: s.otp?.account, secret: s.secret, algorithm: s.otp?.algorithm, digits: s.otp?.digits, period: s.otp?.period, steam: t === 'STEAM' });
  });
}

function proton(j: any): ImportResult {
  return collect(j.entries ?? [], (e: any, i) => e?.content?.name || `#${i + 1}`, (e: any) => parseOtpauthUri(e.content.uri));
}

function uriList(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return collect(lines, (_l, i) => `line ${i + 1}`, l => parseOtpauthUri(l));
}

// --- Google Authenticator export QR (otpauth-migration://offline?data=<base64 protobuf>) ---
function readProto(buf: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const out = new Map<number, (number | Uint8Array)[]>();
  let i = 0;
  const varint = () => {
    let r = 0, shift = 0, b: number;
    do {
      if (i >= buf.length) throw new Error('Truncated protobuf');
      b = buf[i++]; r += (b & 127) * 2 ** shift; shift += 7;
    } while (b & 128);
    return r;
  };
  while (i < buf.length) {
    const key = varint(), no = Math.floor(key / 8), wt = key & 7;
    let v: number | Uint8Array;
    if (wt === 0) v = varint();
    else if (wt === 2) { const len = varint(); if (i + len > buf.length) throw new Error('Truncated protobuf'); v = buf.slice(i, i + len); i += len; }
    else throw new Error(`Unsupported protobuf wire type ${wt}`);
    out.set(no, [...(out.get(no) ?? []), v]);
  }
  return out;
}

function gauth(text: string): ImportResult {
  const data = new URL(text.trim()).searchParams.get('data');
  if (!data) throw new Error('Missing data in migration QR');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)); } catch { throw new Error('Invalid migration QR data'); }
  const dec = new TextDecoder();
  const first = <T>(m: Map<number, (number | Uint8Array)[]>, n: number) => m.get(n)?.[0] as T | undefined;
  const params = (readProto(bytes).get(1) ?? []) as Uint8Array[];
  return collect(params, (_p, i) => `#${i + 1}`, p => {
    const m = readProto(p);
    if ((first<number>(m, 6) ?? 2) !== 2) throw new Error('HOTP not supported');
    const name = dec.decode(first<Uint8Array>(m, 2) ?? new Uint8Array());
    const issuer = dec.decode(first<Uint8Array>(m, 3) ?? new Uint8Array());
    const label = issuer && name.startsWith(issuer + ':') ? name.slice(issuer.length + 1) : name;
    const algo = ({ 2: 'SHA256', 3: 'SHA512' } as Record<number, string>)[first<number>(m, 4) ?? 1] ?? 'SHA1';
    const digits = first<number>(m, 5) === 2 ? 8 : 6;
    return entry({ issuer, label, secret: base32Encode(first<Uint8Array>(m, 1) ?? new Uint8Array()), algorithm: algo, digits });
  });
}

export function importVault(text: string, format: ImportFormat = 'auto'): ImportResult {
  const t = text.trim();
  if (format === 'gauth-migration' || (format === 'auto' && t.startsWith('otpauth-migration://'))) return gauth(t);
  if (format === 'uri-list' || (format === 'auto' && t.startsWith('otpauth://'))) return uriList(t);
  let j: any;
  try { j = JSON.parse(t); } catch { throw new Error('Unrecognized import format'); }
  if (format === 'aegis' || (format === 'auto' && 'db' in j)) return aegis(j);
  if (format === '2fas' || (format === 'auto' && ('services' in j || 'servicesEncrypted' in j))) return twofas(j);
  if (format === 'proton' || (format === 'auto' && j.entries?.[0]?.content)) return proton(j);
  throw new Error('Unrecognized import format');
}
