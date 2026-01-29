import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TasksModule } from './tasks/tasks.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ActivitiesModule } from './activities/activities.module';
import { ActivityTasksModule } from './activity-tasks/activity-tasks.module';
import { TagsModule } from './tags/tags.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // Default limit for all routes
      },
    ]),
    DatabaseModule,
    UsersModule,
    AuthModule,
    TasksModule,
    TimeEntriesModule,
    ActivitiesModule,
    ActivityTasksModule,
    TagsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Conditionally register ThrottlerGuard - disabled in test environment
    ...(process.env.NODE_ENV !== 'test'
      ? [
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ]
      : []),
  ],
})
export class AppModule { }
