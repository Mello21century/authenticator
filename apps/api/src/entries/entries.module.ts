import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { ENTRY, EntrySchema } from './entry.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ENTRY, schema: EntrySchema }])],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
