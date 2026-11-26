import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser, JwtGuard, type ReqUser } from '../auth/jwt.guard';
import { ImportDto } from '../entries/dto';
import { VaultService } from './vault.service';

class ExportDto {
  @IsString() @Length(1, 256) password: string;
  @IsOptional() @IsString() @Length(6, 20) code?: string;
}

@Controller('vault')
@UseGuards(JwtGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Post('import') @HttpCode(200)
  import(@CurrentUser() u: ReqUser, @Body() b: ImportDto) { return this.vault.import(u, b.entries); }

  @Post('export') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  export(@CurrentUser() u: ReqUser, @Body() b: ExportDto) { return this.vault.export(u, b.password, b.code); }
}
