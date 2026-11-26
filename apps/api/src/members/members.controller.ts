import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Param, Post, Put, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Types } from 'mongoose';
import { EmailDto } from '../auth/dto';
import { CurrentUser, JwtGuard, type ReqUser } from '../auth/jwt.guard';
import { ShareDto } from '../entries/dto';
import { EntriesService } from '../entries/entries.service';
import { MembersService } from './members.service';

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (ctx.switchToHttp().getRequest().user?.role !== 'owner') throw new ForbiddenException('Only the account owner can do this');
    return true;
  }
}

@Controller()
@UseGuards(JwtGuard, OwnerGuard)
export class MembersController {
  constructor(private readonly members: MembersService, private readonly entries: EntriesService) {}

  @Get('members') list(@CurrentUser() u: ReqUser) { return this.members.list(u); }
  @Post('members') add(@CurrentUser() u: ReqUser, @Body() b: EmailDto) { return this.members.add(u, b.email); }
  @Delete('members/:id') @HttpCode(204) remove(@CurrentUser() u: ReqUser, @Param('id') id: string) { return this.members.remove(u, id); }

  @Put('entries/:id/share')
  async share(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() b: ShareDto) {
    const e = await this.entries.own(u, id);
    const ids = [...new Set(b.memberIds)].map(x => new Types.ObjectId(x));
    if (!(await this.members.allMine(u, ids))) throw new BadRequestException('You can only share with your own members');
    const updated = await this.entries.model.findOneAndUpdate({ _id: e._id }, { sharedWith: ids }, { new: true }).lean();
    return this.entries.view(updated!, u);
  }
}
