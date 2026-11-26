import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { base32Decode, base32Encode } from '../crypto/base32';
import { verifyTotp } from '../crypto/totp';
import { VaultCipher } from '../crypto/vault-cipher';
import type { UserDoc } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { sha256 } from './tokens.service';

const normRecovery = (c: string) => c.trim().toLowerCase();

@Injectable()
export class MfaService {
  constructor(private readonly users: UsersService, private readonly cipher: VaultCipher, private readonly jwt: JwtService) {}

  async setup(userId: string) {
    const u = await this.users.byId(userId);
    if (!u) throw new UnauthorizedException();
    if (u.mfa?.enabled) throw new ConflictException('Two-factor login is already enabled');
    const secret = base32Encode(randomBytes(20));
    await this.users.model.updateOne({ _id: u._id }, { mfa: { secret: this.cipher.seal(secret), enabled: false, recoveryHashes: [] } });
    const otpauthUri = `otpauth://totp/Authenticator:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Authenticator`;
    return { secret, otpauthUri };
  }

  async enable(userId: string, code: string, password: string) {
    const u = await this.users.byId(userId);
    // step-up: a stolen access token alone must not be able to bind the account to an attacker's authenticator
    if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, password))) throw new UnauthorizedException('Wrong password');
    if (!u?.mfa || u.mfa.enabled) throw new BadRequestException('Start two-factor setup first');
    if (!verifyTotp(this.secretOf(u), code)) throw new BadRequestException('Invalid code');
    const recoveryCodes = Array.from({ length: 10 }, () => {
      const s = base32Encode(randomBytes(5)).toLowerCase(); // 8 chars
      return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
    });
    await this.users.model.updateOne({ _id: u._id }, { 'mfa.enabled': true, 'mfa.recoveryHashes': recoveryCodes.map(c => sha256(c)) });
    return { recoveryCodes };
  }

  /** TOTP or one-time recovery code. Recovery codes are consumed. */
  async check(u: UserDoc, code: string): Promise<boolean> {
    if (!u.mfa?.enabled) return false;
    if (/^\d{6}$/.test(code.trim())) return verifyTotp(this.secretOf(u), code.trim());
    // ponytail: no TOTP replay guard within the 90s window; add lastUsedStep when needed
    const h = sha256(normRecovery(code));
    const r = await this.users.model.updateOne({ _id: u._id, 'mfa.recoveryHashes': h }, { $pull: { 'mfa.recoveryHashes': h } });
    return r.modifiedCount === 1;
  }

  async userFromMfaToken(token: string): Promise<UserDoc> {
    let claims: { sub: string; typ: string };
    try { claims = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('Login expired, sign in again'); }
    if (claims.typ !== 'mfa') throw new UnauthorizedException('Login expired, sign in again');
    const u = await this.users.byId(claims.sub);
    if (!u) throw new UnauthorizedException();
    return u;
  }

  async disable(userId: string, password: string, code: string) {
    const u = await this.users.byId(userId);
    if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, password))) throw new UnauthorizedException('Wrong password');
    if (!(await this.check(u, code))) throw new UnauthorizedException('Invalid code');
    await this.users.model.updateOne({ _id: u._id }, { $unset: { mfa: 1 } });
  }

  private secretOf(u: UserDoc): Buffer {
    return base32Decode(this.cipher.open(u.mfa!.secret));
  }
}
