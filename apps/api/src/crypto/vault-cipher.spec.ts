import { randomBytes } from 'node:crypto';
import { VaultCipher } from './vault-cipher';

describe('VaultCipher', () => {
  const c = new VaultCipher(randomBytes(32));
  it('roundtrips', () => {
    expect(c.open(c.seal('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
  });
  it('uses a fresh iv each time', () => {
    expect(c.seal('x').iv).not.toBe(c.seal('x').iv);
  });
  it('detects tampering', () => {
    const s = c.seal('secret');
    const ct = Buffer.from(s.ct, 'base64'); ct[0] ^= 1;
    expect(() => c.open({ ...s, ct: ct.toString('base64') })).toThrow();
  });
  it('rejects other key versions', () => {
    expect(() => c.open({ ...c.seal('x'), kv: 2 })).toThrow();
  });
  it('fingerprint is deterministic and key dependent', () => {
    expect(c.fingerprint('a')).toBe(c.fingerprint('a'));
    expect(new VaultCipher(randomBytes(32)).fingerprint('a')).not.toBe(c.fingerprint('a'));
  });
  it('requires a 32-byte key', () => {
    expect(() => new VaultCipher(randomBytes(16))).toThrow();
  });
});
