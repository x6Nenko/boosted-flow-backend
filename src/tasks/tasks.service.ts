import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, or, lt } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { refreshTokens } from '../database/schema';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  // Clean up expired/revoked tokens daily at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'cleanup-expired-tokens',
  })
  async cleanupExpiredTokens() {
    this.logger.log('Starting expired/revoked token cleanup...');

    const result = await this.databaseService.db
      .delete(refreshTokens)
      .where(
        or(
          eq(refreshTokens.revoked, true),
          lt(refreshTokens.expiresAt, new Date().toISOString()),
        ),
      );

    this.logger.log(
      `Token cleanup completed: ${result.rowsAffected ?? 0} tokens removed`,
    );
  }
}
