import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto, MfaEnableDto, CredentialsDto, EmailDto, LoginDto, MfaDisableDto, MfaLoginDto, RefreshDto, ResetDto } from './dto';
import { CurrentUser, JwtGuard, type ReqUser } from './jwt.guard';
import { MfaService } from './mfa.service';
import { ResetService } from './reset.service';
import { TokensService } from './tokens.service';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly tokens: TokensService, private readonly users: UsersService, private readonly mfa: MfaService, private readonly resets: ResetService) {}

  @Post('signup') @Throttle(AUTH_LIMIT)
  signup(@Body() b: CredentialsDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.signup(b.email, b.password, req, reply);
  }

  @Post('login') @HttpCode(200) @Throttle(AUTH_LIMIT)
  login(@Body() b: LoginDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.login(b.email, b.password, req, reply);
  }

  @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() b: RefreshDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.tokens.rotate(this.tokens.presented(req, b?.refreshToken), req, reply);
  }

  @Post('logout') @HttpCode(204)
  async logout(@Body() b: RefreshDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.tokens.revoke(this.tokens.presented(req, b?.refreshToken));
    this.tokens.clearCookie(reply);
  }

  @Get('me') @UseGuards(JwtGuard)
  async me(@CurrentUser() u: ReqUser) {
    return this.users.toPublic((await this.users.byId(u.id))!);
  }

  @Post('password/change') @HttpCode(200) @UseGuards(JwtGuard) @Throttle(AUTH_LIMIT)
  changePassword(@CurrentUser() u: ReqUser, @Body() b: ChangePasswordDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.changePassword(u.id, b.current, b.next, req, reply);
  }

  @Post('login/mfa') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async loginMfa(@Body() b: MfaLoginDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const u = await this.mfa.userFromMfaToken(b.mfaToken);
    if (!(await this.mfa.check(u, b.code))) throw new UnauthorizedException('Invalid code');
    return this.tokens.issue(u, req, reply);
  }

  @Post('mfa/setup') @HttpCode(200) @UseGuards(JwtGuard)
  mfaSetup(@CurrentUser() u: ReqUser) { return this.mfa.setup(u.id); }

  @Post('mfa/enable') @HttpCode(200) @UseGuards(JwtGuard) @Throttle(AUTH_LIMIT)
  mfaEnable(@CurrentUser() u: ReqUser, @Body() b: MfaEnableDto) { return this.mfa.enable(u.id, b.code, b.password); }

  @Post('mfa/disable') @HttpCode(204) @UseGuards(JwtGuard) @Throttle(AUTH_LIMIT)
  mfaDisable(@CurrentUser() u: ReqUser, @Body() b: MfaDisableDto) { return this.mfa.disable(u.id, b.password, b.code); }

  @Post('password/forgot') @HttpCode(204) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgot(@Body() b: EmailDto) { return this.resets.forgot(b.email); }

  @Post('password/reset') @HttpCode(204) @Throttle(AUTH_LIMIT)
  reset(@Body() b: ResetDto) { return this.resets.reset(b.token, b.password); }
}
