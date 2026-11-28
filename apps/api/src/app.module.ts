import { Controller, Get, Global, Inject, Module, ServiceUnavailableException, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CONFIG, type AppConfig } from './config';
import { VaultCipher } from './crypto/vault-cipher';
import { MailService } from './mail/mail.service';
import { AuthModule } from './auth/auth.module';
import { EntriesModule } from './entries/entries.module';
import { MembersModule } from './members/members.module';
import { VaultModule } from './vault/vault.module';

@Controller('health')
class HealthController {
  constructor(@InjectConnection() private readonly db: Connection) {}
  // checks MongoDB too, so Docker/Dokploy show the API unhealthy when the database is gone
  @Get() async health() {
    try { await this.db.db!.admin().ping(); } catch { throw new ServiceUnavailableException('Database unavailable'); }
    return { ok: true };
  }
}

/** Public: lets mobile apps block themselves until the user installs a supported version. */
@Controller('app')
class AppVersionController {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}
  @Get('version') version() {
    return { minVersion: this.cfg.minAppVersion, iosUrl: this.cfg.iosStoreUrl, androidUrl: this.cfg.androidStoreUrl };
  }
}

@Global()
@Module({})
class CoreModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: CONFIG, useValue: cfg },
        { provide: VaultCipher, useValue: new VaultCipher(cfg.vaultKey) },
        MailService,
      ],
      exports: [CONFIG, VaultCipher, MailService],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(cfg),
        MongooseModule.forRoot(cfg.mongoUrl, { serverSelectionTimeoutMS: 5000 }), // fail fast instead of hanging 30s when the DB is down
        AuthModule.forRoot(cfg),
        EntriesModule,
        MembersModule,
        VaultModule,
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }], skipIf: () => !!cfg.disableThrottle }),
      ],
      controllers: [HealthController, AppVersionController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
