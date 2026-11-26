import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export interface Sealed { iv: string; ct: string; tag: string; kv: number }

export class VaultCipher {
  constructor(private readonly key: Buffer, private readonly keyVersion = 1) {
    if (key.length !== 32) throw new Error('Vault key must be 32 bytes');
  }

  seal(plain: string): Sealed {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64'), kv: this.keyVersion };
  }

  open(s: Sealed): string {
    // ponytail: single key version; add a VAULT_OLD_KEYS map here when rotating keys
    if (s.kv !== this.keyVersion) throw new Error(`Unknown vault key version ${s.kv}`);
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(s.iv, 'base64'));
    d.setAuthTag(Buffer.from(s.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(s.ct, 'base64')), d.final()]).toString('utf8');
  }

  /** Keyed hash for duplicate detection without decrypting. */
  fingerprint(plain: string): string {
    return createHmac('sha256', this.key).update('fp:' + plain).digest('hex');
  }
}
