import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { ActivitiesService } from '../activities/activities.service';
import { dailyTimeEntryCounts, timeEntries } from '../database/schema';

type TimeEntry = typeof timeEntries.$inferSelect;

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activitiesService: ActivitiesService,
  ) { }

  private toIsoDate(input: string): string {
    // Accept both full ISO timestamps and YYYY-MM-DD.
    return input.split('T')[0];
  }

  async start(
    userId: string,
    activityId: string,
    description?: string,
  ): Promise<TimeEntry> {
    // Check for active entry
    const activeEntry = await this.findActive(userId);
    if (activeEntry) {
      throw new ConflictException(
        'You already have an active time entry. Please stop it before starting a new one.',
      );
    }

    const isOwner = await this.activitiesService.verifyOwnership(
      userId,
      activityId,
    );
    if (!isOwner) {
      throw new NotFoundException('Activity not found');
    }

    // Create new entry
    const id = uuidv4();
    const now = new Date().toISOString();

    const [entry] = await this.databaseService.db
      .insert(timeEntries)
      .values({
        id,
        userId,
        activityId,
        description: description || null,
        startedAt: now,
        stoppedAt: null,
        createdAt: now,
      })
      .returning();

    return entry;
  }

  async stop(userId: string, id: string): Promise<TimeEntry> {
    // Find the specific entry
    const entry = await this.databaseService.db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)),
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.stoppedAt) {
      throw new ConflictException('This time entry has already been stopped');
    }

    // Stop the entry
    const stoppedAt = new Date().toISOString();
    const [updated] = await this.databaseService.db
      .update(timeEntries)
      .set({ stoppedAt })
      .where(eq(timeEntries.id, id))
      .returning();

    const startTime = new Date(entry.startedAt).getTime();
    const stopTime = new Date(stoppedAt).getTime();
    const durationSeconds = Math.floor((stopTime - startTime) / 1000);

    await this.activitiesService.updateProgress(
      userId,
      entry.activityId,
      durationSeconds,
    );

    const date = stoppedAt.split('T')[0]; // YYYY-MM-DD

    await this.databaseService.db
      .insert(dailyTimeEntryCounts)
      .values({
        userId,
        date,
        count: 1,
        createdAt: stoppedAt,
        updatedAt: stoppedAt,
      })
      .onConflictDoUpdate({
        target: [dailyTimeEntryCounts.userId, dailyTimeEntryCounts.date],
        set: {
          count: sql`${dailyTimeEntryCounts.count} + 1`,
          updatedAt: stoppedAt,
        },
      });

    return updated;
  }

  async findActive(userId: string): Promise<TimeEntry | null> {
    const entry = await this.databaseService.db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.userId, userId), isNull(timeEntries.stoppedAt)),
    });
    return entry ?? null;
  }

  async findAll(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<TimeEntry[]> {
    const conditions = [eq(timeEntries.userId, userId)];

    if (from) {
      conditions.push(gte(timeEntries.startedAt, from));
    }

    if (to) {
      conditions.push(lte(timeEntries.startedAt, to));
    }

    return this.databaseService.db.query.timeEntries.findMany({
      where: and(...conditions),
      orderBy: (timeEntries, { desc }) => [desc(timeEntries.startedAt)],
    });
  }

  async getHeatmap(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<Array<{ date: string; count: number }>> {
    const conditions = [eq(dailyTimeEntryCounts.userId, userId)];

    if (from) {
      conditions.push(gte(dailyTimeEntryCounts.date, this.toIsoDate(from)));
    }

    if (to) {
      conditions.push(lte(dailyTimeEntryCounts.date, this.toIsoDate(to)));
    }

    return this.databaseService.db.query.dailyTimeEntryCounts.findMany({
      where: and(...conditions),
      columns: {
        date: true,
        count: true,
      },
      orderBy: (dailyTimeEntryCounts, { asc }) => [asc(dailyTimeEntryCounts.date)],
    });
  }
}
