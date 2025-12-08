import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { timeEntries } from '../database/schema';

type TimeEntry = typeof timeEntries.$inferSelect;

@Injectable()
export class TimeEntriesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async start(userId: string, description?: string): Promise<TimeEntry> {
    // Check for active entry
    const activeEntry = await this.findActive(userId);
    if (activeEntry) {
      throw new ConflictException(
        'You already have an active time entry. Please stop it before starting a new one.',
      );
    }

    // Create new entry
    const id = uuidv4();
    const now = new Date().toISOString();

    const [entry] = await this.databaseService.db
      .insert(timeEntries)
      .values({
        id,
        userId,
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
    const [updated] = await this.databaseService.db
      .update(timeEntries)
      .set({ stoppedAt: new Date().toISOString() })
      .where(eq(timeEntries.id, id))
      .returning();

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
}
