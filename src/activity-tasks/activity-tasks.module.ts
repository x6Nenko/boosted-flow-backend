import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ActivitiesModule } from '../activities/activities.module';
import { ActivityTasksController } from './activity-tasks.controller';
import { ActivityTasksService } from './activity-tasks.service';

@Module({
  imports: [DatabaseModule, ActivitiesModule],
  controllers: [ActivityTasksController],
  providers: [ActivityTasksService],
  exports: [ActivityTasksService],
})
export class ActivityTasksModule { }
