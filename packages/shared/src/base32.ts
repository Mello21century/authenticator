const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeBase32(s: string): string {
  const out = s.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]+$/.test(out)) throw new Error('Invalid base32');
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = normalizeBase32(s);
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Uint8Array.from(bytes);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = '', bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
