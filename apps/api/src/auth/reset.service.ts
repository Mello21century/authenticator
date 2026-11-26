import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Schema, type Model, type Types } from 'mongoose';
import { CONFIG, type AppConfig } from '../config';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { hashPassword } from './auth.service';
import { sha256, TokensService } from './tokens.service';

export type ResetPurpose = 'reset' | 'invite';
export interface ResetTokenDoc { _id: Types.ObjectId; userId: Types.ObjectId; hash: string; purpose: ResetPurpose; expiresAt: Date; usedAt?: Date }

export const RESET_TOKEN = 'ResetToken';
export const ResetTokenSchema = new Schema<ResetTokenDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  hash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['reset', 'invite'], required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  usedAt: Date,
});

const TTL: Record<ResetPurpose, number> = { reset: 30 * 60_000, invite: 72 * 3600_000 };

@Injectable()
export class ResetService {
  private readonly log = new Logger('Reset');

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    @InjectModel(RESET_TOKEN) private readonly model: Model<ResetTokenDoc>,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  async createToken(userId: Types.ObjectId, purpose: ResetPurpose): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.model.create({ userId, hash: sha256(raw), purpose, expiresAt: new Date(Date.now() + TTL[purpose]) });
    return raw;
  }

  link(token: string, purpose: ResetPurpose) {
    return `${this.cfg.appUrl}/reset?token=${token}${purpose === 'invite' ? '&invite=1' : ''}`;
  }

  async forgot(email: string): Promise<void> {
    const u = await this.users.byEmail(email);
    if (!u) return;
    const link = this.link(await this.createToken(u._id, 'reset'), 'reset');
    // not awaited: response time must not reveal whether the account exists
    this.mail.send(u.email, 'Reset your Authenticator password',
      `Someone asked to reset the password for ${u.email}.\n\nOpen this link within 30 minutes to choose a new password:\n${link}\n\nIf this wasn't you, ignore this email.`,
    ).catch(e => this.log.error(e));
  }

  async invite(userId: Types.ObjectId, email: string, ownerEmail: string): Promise<void> {
    const link = this.link(await this.createToken(userId, 'invite'), 'invite');
    await this.mail.send(email, `${ownerEmail} invited you to Authenticator`,
      `${ownerEmail} added you to their Authenticator account.\n\nSet your password within 72 hours to get started:\n${link}`);
  }

  async reset(token: string, password: string): Promise<void> {
    const doc = await this.model.findOneAndUpdate(
      { hash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    ).lean<ResetTokenDoc>();
    if (!doc) throw new BadRequestException('Invalid or expired link');
    const r = await this.users.model.updateOne({ _id: doc.userId }, { passwordHash: await hashPassword(password) });
    if (r.matchedCount !== 1) throw new BadRequestException('Invalid or expired link');
    await this.tokens.revokeAll(doc.userId);
  }

  async deleteForUser(userId: Types.ObjectId | string) { await this.model.deleteMany({ userId }); }
}
