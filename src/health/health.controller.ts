import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { DatabaseHealthIndicator } from './database.health';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: DatabaseHealthIndicator,
  ) { }

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
    ]);
  }
}
