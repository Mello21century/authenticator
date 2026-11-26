import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model } from 'mongoose';
import type { ReqUser } from '../auth/jwt.guard';
import { base32Decode } from '../crypto/base32';
import { totp } from '../crypto/totp';
import { VaultCipher } from '../crypto/vault-cipher';
import type { EntryDto, UpdateEntryDto } from './dto';
import { ENTRY, type EntryDoc } from './entry.schema';

export interface EntryView {
  id: string; issuer: string; label: string; algorithm: string; digits: number; period: number; type: string;
  order: number; readOnly: boolean; sharedWith: string[];
}

/** Steam always 5 chars; TOTP must be 6-8 digits. */
export function normalizeShape<T extends { type?: string; digits?: number }>(e: T): T {
  if (e.type === 'steam') return { ...e, digits: 5 };
  if (e.digits !== undefined && (e.digits < 6 || e.digits > 8)) throw new BadRequestException('digits must be 6, 7 or 8');
  return e;
}

@Injectable()
export class EntriesService {
  constructor(@InjectModel(ENTRY) readonly model: Model<EntryDoc>, private readonly cipher: VaultCipher) {}

  view(e: EntryDoc, me: ReqUser): EntryView {
    const mine = e.ownerId.equals(me._id);
    return {
      id: String(e._id), issuer: e.issuer, label: e.label, algorithm: e.algorithm, digits: e.digits, period: e.period, type: e.type,
      order: e.order, readOnly: !mine, sharedWith: mine ? e.sharedWith.map(String) : [],
    };
  }

  visible(me: ReqUser) {
    return this.model.find({ $or: [{ ownerId: me._id }, { sharedWith: me._id }] }).sort({ order: 1, createdAt: 1 }).lean<EntryDoc[]>();
  }

  async list(me: ReqUser) { return (await this.visible(me)).map(e => this.view(e, me)); }

  async own(me: ReqUser, id: string): Promise<EntryDoc> {
    if (!isValidObjectId(id)) throw new NotFoundException('Entry not found');
    const e = await this.model.findOne({ _id: id, ownerId: me._id }).lean<EntryDoc>();
    if (!e) throw new NotFoundException('Entry not found');
    return e;
  }

  toDoc(ownerId: Types.ObjectId, d: EntryDto, order: number) {
    const s = normalizeShape(d);
    return {
      ownerId, issuer: s.issuer ?? '', label: s.label ?? '', enc: this.cipher.seal(s.secret), fp: this.cipher.fingerprint(s.secret),
      algorithm: s.algorithm, digits: s.digits, period: s.period, type: s.type, order,
    };
  }

  async create(me: ReqUser, d: EntryDto) {
    const order = await this.model.countDocuments({ ownerId: me._id });
    try {
      const doc = await this.model.create(this.toDoc(me._id, d, order));
      return this.view(doc.toObject(), me);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('This account is already in your vault');
      throw e;
    }
  }

  async update(me: ReqUser, id: string, d: UpdateEntryDto) {
    const cur = await this.own(me, id);
    const merged = normalizeShape({ type: d.type ?? cur.type, digits: d.digits ?? (d.type === 'totp' && cur.type === 'steam' ? 6 : cur.digits) });
    const set: Partial<EntryDoc> = { ...merged };
    for (const k of ['issuer', 'label', 'algorithm', 'period'] as const) if (d[k] !== undefined) (set as any)[k] = d[k];
    if (d.secret) { set.enc = this.cipher.seal(d.secret); set.fp = this.cipher.fingerprint(d.secret); }
    try {
      const e = await this.model.findOneAndUpdate({ _id: cur._id }, set, { new: true }).lean<EntryDoc>();
      return this.view(e!, me);
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('This account is already in your vault');
      throw e;
    }
  }

  async remove(me: ReqUser, id: string) {
    const e = await this.own(me, id);
    await this.model.deleteOne({ _id: e._id });
  }

  async reorder(me: ReqUser, ids: string[]) {
    await this.model.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: new Types.ObjectId(id), ownerId: me._id }, update: { order: i } } })));
  }

  secretOf(e: EntryDoc): string { return this.cipher.open(e.enc); }

  async codes(me: ReqUser) {
    const now = Date.now();
    const codes = (await this.visible(me)).map(e => {
      const { code, expiresAt } = totp(base32Decode(this.secretOf(e)), { algorithm: e.algorithm, digits: e.digits, period: e.period, type: e.type, now });
      return { entryId: String(e._id), code, period: e.period, expiresAt };
    });
    return { serverTime: now, codes };
  }
}
