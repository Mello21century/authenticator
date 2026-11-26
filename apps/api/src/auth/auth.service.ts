import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CONFIG, type AppConfig } from '../config';
import type { UserDoc } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { TokensService, type AuthResponse } from './tokens.service';

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id });

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    readonly users: UsersService,
    readonly tokens: TokensService,
    private readonly jwt: JwtService,
  ) {}

  async signup(email: string, password: string, req: FastifyRequest, reply: FastifyReply): Promise<AuthResponse> {
    if (!this.cfg.signupEnabled) throw new ForbiddenException('Signup disabled');
    if (await this.users.byEmail(email)) throw new ConflictException('Email already registered');
    let user: UserDoc;
    try {
      user = (await this.users.model.create({ email, passwordHash: await hashPassword(password), role: 'owner' })).toObject();
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('Email already registered');
      throw e;
    }
    return this.tokens.issue(user, req, reply);
  }

  /** Verifies credentials with constant work for unknown emails. Returns null when invalid. */
  async checkPassword(email: string, password: string): Promise<UserDoc | null> {
    const user = await this.users.byEmail(email);
    if (!user?.passwordHash) {
      this.dummyHash ??= hashPassword('dummy-password-for-timing');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return null;
    }
    return (await argon2.verify(user.passwordHash, password)) ? user : null;
  }

  async login(email: string, password: string, req: FastifyRequest, reply: FastifyReply) {
    const user = await this.checkPassword(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.mfa?.enabled) {
      const mfaToken = await this.jwt.signAsync({ sub: String(user._id), typ: 'mfa' }, { expiresIn: '5m' });
      return { mfaRequired: true as const, mfaToken };
    }
    return this.tokens.issue(user, req, reply);
  }

  /** Changes password, signs out every other session and returns a fresh session for the caller. */
  async changePassword(userId: string, current: string, next: string, req: FastifyRequest, reply: FastifyReply): Promise<AuthResponse> {
    const user = await this.users.byId(userId);
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, current))) throw new UnauthorizedException('Wrong password');
    await this.users.model.updateOne({ _id: user._id }, { passwordHash: await hashPassword(next) });
    await this.tokens.revokeAll(user._id);
    return this.tokens.issue(user, req, reply);
  }
}
