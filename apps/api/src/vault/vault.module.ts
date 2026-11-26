import { Module } from '@nestjs/common';
import { EntriesModule } from '../entries/entries.module';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({ imports: [EntriesModule], controllers: [VaultController], providers: [VaultService] })
export class VaultModule {}
