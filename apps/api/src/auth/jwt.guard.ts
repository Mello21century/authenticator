import { createParamDecorator, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import type { AccessClaims } from './tokens.service';

export interface ReqUser { id: string; _id: Types.ObjectId; email: string; role: 'owner' | 'member'; ownerId?: Types.ObjectId }

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly users: UsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const h = String(req.headers.authorization ?? '');
    if (!h.startsWith('Bearer ')) throw new UnauthorizedException();
    let claims: AccessClaims;
    try { claims = await this.jwt.verifyAsync<AccessClaims>(h.slice(7)); } catch { throw new UnauthorizedException(); }
    if (claims.typ !== 'access') throw new UnauthorizedException();
    // fresh lookup so deleted members lose access immediately
    const u = await this.users.byId(claims.sub);
    if (!u || !u.passwordHash) throw new UnauthorizedException();
    req.user = { id: String(u._id), _id: u._id, email: u.email, role: u.role, ownerId: u.ownerId } satisfies ReqUser;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): ReqUser => ctx.switchToHttp().getRequest().user);
