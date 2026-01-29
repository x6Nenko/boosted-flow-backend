import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './database.health';

@Module({
  imports: [TerminusModule, DatabaseModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule { }
