import { Global, Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../config';
import { USER, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { REFRESH_TOKEN, RefreshTokenSchema } from './refresh-token.schema';
import { MfaService } from './mfa.service';
import { TokensService } from './tokens.service';

@Global()
@Module({})
export class AuthModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.register({ secret: cfg.jwtSecret }),
        MongooseModule.forFeature([{ name: USER, schema: UserSchema }, { name: REFRESH_TOKEN, schema: RefreshTokenSchema }]),
      ],
      controllers: [AuthController],
      providers: [UsersService, TokensService, AuthService, JwtGuard, MfaService],
      exports: [UsersService, TokensService, AuthService, JwtGuard, MfaService, JwtModule, MongooseModule],
    };
  }
}
