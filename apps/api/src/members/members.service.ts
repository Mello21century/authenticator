import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { isValidObjectId, type Types } from 'mongoose';
import type { ReqUser } from '../auth/jwt.guard';
import { ResetService } from '../auth/reset.service';
import { TokensService } from '../auth/tokens.service';
import { EntriesService } from '../entries/entries.service';
import type { UserDoc } from '../users/user.schema';
import { UsersService } from '../users/users.service';

export interface MemberView { id: string; email: string; activated: boolean; createdAt: string }

@Injectable()
export class MembersService {
  constructor(
    private readonly users: UsersService,
    private readonly entries: EntriesService,
    private readonly tokens: TokensService,
    private readonly resets: ResetService,
  ) {}

  private view(u: UserDoc): MemberView {
    return { id: String(u._id), email: u.email, activated: !!u.passwordHash, createdAt: u.createdAt.toISOString() };
  }

  async list(me: ReqUser) {
    return (await this.users.model.find({ ownerId: me._id, role: 'member' }).sort({ createdAt: 1 }).lean<UserDoc[]>()).map(u => this.view(u));
  }

  async add(me: ReqUser, email: string) {
    if (await this.users.byEmail(email)) throw new ConflictException('That email already has an account');
    let u: UserDoc;
    try {
      u = (await this.users.model.create({ email, passwordHash: null, role: 'member', ownerId: me._id })).toObject();
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('That email already has an account');
      throw e;
    }
    try {
      await this.resets.invite(u._id, u.email, me.email);
    } catch {
      await this.users.model.deleteOne({ _id: u._id });
      await this.resets.deleteForUser(u._id);
      throw new ServiceUnavailableException('Could not send the invite email, try again');
    }
    return this.view(u);
  }

  async remove(me: ReqUser, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Member not found');
    const m = await this.users.model.findOne({ _id: id, ownerId: me._id, role: 'member' }).lean<UserDoc>();
    if (!m) throw new NotFoundException('Member not found');
    await this.users.model.deleteOne({ _id: m._id });
    await this.entries.model.deleteMany({ ownerId: m._id });
    await this.entries.model.updateMany({ ownerId: me._id }, { $pull: { sharedWith: m._id } });
    await this.tokens.deleteAll(m._id);
    await this.resets.deleteForUser(m._id);
  }

  /** True when every id is an existing member of `me`. */
  async allMine(me: ReqUser, ids: Types.ObjectId[]) {
    if (!ids.length) return true;
    return (await this.users.model.countDocuments({ _id: { $in: ids }, ownerId: me._id, role: 'member' })) === new Set(ids.map(String)).size;
  }
}
