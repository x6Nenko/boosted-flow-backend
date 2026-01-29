import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseService: DatabaseService,
  ) { }

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.databaseService.db.run(sql`SELECT 1`);
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
