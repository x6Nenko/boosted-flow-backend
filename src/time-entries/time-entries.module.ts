import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ActivitiesModule } from '../activities/activities.module';
import { ActivityTasksModule } from '../activity-tasks/activity-tasks.module';
import { TagsModule } from '../tags/tags.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

@Module({
  imports: [DatabaseModule, ActivitiesModule, ActivityTasksModule, TagsModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
})
export class TimeEntriesModule { }
