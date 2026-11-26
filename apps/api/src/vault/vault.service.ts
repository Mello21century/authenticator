import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { ReqUser } from '../auth/jwt.guard';
import { MfaService } from '../auth/mfa.service';
import type { EntryDto } from '../entries/dto';
import { EntriesService } from '../entries/entries.service';
import type { EntryDoc } from '../entries/entry.schema';

export function buildOtpauthUri(e: { issuer: string; label: string; secret: string; algorithm: string; digits: number; period: number; type: string }): string {
  const name = e.issuer ? `${encodeURIComponent(e.issuer)}:${encodeURIComponent(e.label)}` : encodeURIComponent(e.label);
  const p = new URLSearchParams({ secret: e.secret });
  if (e.issuer) p.set('issuer', e.issuer);
  p.set('algorithm', e.algorithm);
  p.set('digits', String(e.digits));
  p.set('period', String(e.period));
  if (e.type === 'steam') p.set('encoder', 'steam');
  return `otpauth://totp/${name}?${p.toString()}`;
}

@Injectable()
export class VaultService {
  constructor(private readonly entries: EntriesService, private readonly auth: AuthService, private readonly mfa: MfaService) {}

  async import(me: ReqUser, items: EntryDto[]) {
    const base = await this.entries.model.countDocuments({ ownerId: me._id });
    const docs = items.map((d, i) => this.entries.toDoc(me._id, d, base + i));
    const existing = new Set((await this.entries.model.find({ ownerId: me._id, fp: { $in: docs.map(d => d.fp) } }, { fp: 1 }).lean()).map(d => d.fp));
    const fresh = docs.filter(d => !existing.has(d.fp) && (existing.add(d.fp), true));
    let imported = 0;
    if (fresh.length) {
      try {
        imported = (await this.entries.model.insertMany(fresh, { ordered: false })).length;
      } catch (e: any) {
        // concurrent import inserted some of these first: duplicates count as skipped
        const errs: any[] = e?.writeErrors ?? [];
        if (!errs.length || errs.some(w => (w.code ?? w.err?.code) !== 11000)) throw e;
        imported = e.insertedDocs?.length ?? e.result?.insertedCount ?? fresh.length - errs.length;
      }
    }
    return { imported, skipped: docs.length - imported };
  }

  async export(me: ReqUser, password: string, code?: string) {
    const user = await this.auth.checkPassword(me.email, password);
    if (!user || !user._id.equals(me._id)) throw new UnauthorizedException('Wrong password');
    if (user.mfa?.enabled && !(code && (await this.mfa.check(user, code)))) throw new UnauthorizedException('Two-factor code required');
    const own = await this.entries.model.find({ ownerId: me._id }).sort({ order: 1, createdAt: 1 }).lean<EntryDoc[]>();
    return {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      entries: own.map(e => {
        const x = { issuer: e.issuer, label: e.label, secret: this.entries.secretOf(e), algorithm: e.algorithm, digits: e.digits, period: e.period, type: e.type };
        return { ...x, uri: buildOtpauthUri(x) };
      }),
    };
  }
}
