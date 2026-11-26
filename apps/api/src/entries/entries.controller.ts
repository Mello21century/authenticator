import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtGuard, type ReqUser } from '../auth/jwt.guard';
import { EntryDto, OrderDto, UpdateEntryDto } from './dto';
import { EntriesService } from './entries.service';

@Controller()
@UseGuards(JwtGuard)
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get('entries') list(@CurrentUser() u: ReqUser) { return this.entries.list(u); }
  @Post('entries') create(@CurrentUser() u: ReqUser, @Body() b: EntryDto) { return this.entries.create(u, b); }
  @Put('entries/order') @HttpCode(204) reorder(@CurrentUser() u: ReqUser, @Body() b: OrderDto) { return this.entries.reorder(u, b.ids); }
  @Patch('entries/:id') update(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() b: UpdateEntryDto) { return this.entries.update(u, id, b); }
  @Delete('entries/:id') @HttpCode(204) remove(@CurrentUser() u: ReqUser, @Param('id') id: string) { return this.entries.remove(u, id); }
  @Get('codes') codes(@CurrentUser() u: ReqUser) { return this.entries.codes(u); }
}
