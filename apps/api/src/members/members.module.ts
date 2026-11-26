import { Module } from '@nestjs/common';
import { EntriesModule } from '../entries/entries.module';
import { MembersController, OwnerGuard } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [EntriesModule],
  controllers: [MembersController],
  providers: [MembersService, OwnerGuard],
})
export class MembersModule {}
