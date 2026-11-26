import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Model, Types } from 'mongoose';
import type { UserDoc } from '../users/user.schema';
import { UsersService, type PublicUser } from '../users/users.service';
import { REFRESH_TOKEN, type RefreshTokenDoc } from './refresh-token.schema';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
export const COOKIE = 'rt';
const ROTATION_GRACE_MS = 30_000;
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/auth' };

export interface AuthResponse { accessToken: string; refreshToken?: string; user: PublicUser }
export interface AccessClaims { sub: string; typ: 'access' }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const isNative = (req: FastifyRequest) => req.headers['x-client'] === 'native';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    @InjectModel(REFRESH_TOKEN) private readonly tokens: Model<RefreshTokenDoc>,
  ) {}

  async issue(user: UserDoc, req: FastifyRequest, reply: FastifyReply, family = randomBytes(12).toString('hex')): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({ sub: String(user._id), typ: 'access' } satisfies AccessClaims, { expiresIn: '15m' });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.tokens.create({
      userId: user._id, hash: sha256(refreshToken), family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS), device: String(req.headers['user-agent'] ?? '').slice(0, 200),
    });
    const body: AuthResponse = { accessToken, user: this.users.toPublic(user) };
    if (isNative(req)) body.refreshToken = refreshToken;
    else reply.setCookie(COOKIE, refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_TTL_MS / 1000 });
    return body;
  }

  presented(req: FastifyRequest, bodyToken?: string): string | undefined {
    return isNative(req) ? bodyToken : (req.cookies?.[COOKIE] ?? bodyToken);
  }

  async rotate(raw: string | undefined, req: FastifyRequest, reply: FastifyReply): Promise<AuthResponse> {
    if (!raw) throw new UnauthorizedException();
    const doc = await this.tokens.findOne({ hash: sha256(raw) }).lean<RefreshTokenDoc>();
    if (!doc || doc.expiresAt < new Date()) throw new UnauthorizedException();
    if (doc.revokedAt) {
      // reuse of a rotated token: assume theft, kill every session of this user.
      // tokens revoked by logout / password change just fail.
      // a token rotated seconds ago is a racing tab/retry, not theft
      if (doc.rotated && Date.now() - doc.revokedAt.getTime() > ROTATION_GRACE_MS) await this.revokeAll(doc.userId);
      throw new UnauthorizedException();
    }
    const claimed = await this.tokens.updateOne({ _id: doc._id, revokedAt: { $exists: false } }, { revokedAt: new Date(), rotated: true });
    if (claimed.modifiedCount !== 1) throw new UnauthorizedException(); // lost a concurrent rotation race
    const user = await this.users.model.findById(doc.userId).lean<UserDoc>();
    if (!user || !user.passwordHash) throw new UnauthorizedException();
    return this.issue(user, req, reply, doc.family);
  }

  async revoke(raw: string | undefined): Promise<void> {
    if (raw) await this.tokens.updateOne({ hash: sha256(raw) }, { revokedAt: new Date() });
  }

  async revokeAll(userId: Types.ObjectId | string, exceptFamily?: string): Promise<void> {
    await this.tokens.updateMany({ userId, revokedAt: { $exists: false }, ...(exceptFamily ? { family: { $ne: exceptFamily } } : {}) }, { revokedAt: new Date() });
  }

  async deleteAll(userId: Types.ObjectId | string) { await this.tokens.deleteMany({ userId }); }

  clearCookie(reply: FastifyReply) { reply.clearCookie(COOKIE, COOKIE_OPTS); }
}
