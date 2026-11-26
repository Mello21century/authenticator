import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { USER, type UserDoc } from './user.schema';

export interface PublicUser { id: string; email: string; role: 'owner' | 'member'; mfaEnabled: boolean }

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectModel(USER) readonly model: Model<UserDoc>) {}

  async onModuleInit() { await this.model.init(); } // unique email index before first signup

  byId(id: string) { return this.model.findById(id).lean<UserDoc>(); }
  byEmail(email: string) { return this.model.findOne({ email: email.trim().toLowerCase() }).lean<UserDoc>(); }

  toPublic(u: UserDoc): PublicUser {
    return { id: String(u._id), email: u.email, role: u.role, mfaEnabled: !!u.mfa?.enabled };
  }
}
