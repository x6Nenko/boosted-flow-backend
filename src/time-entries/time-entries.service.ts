import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityTasksService } from '../activity-tasks/activity-tasks.service';
import { TagsService } from '../tags/tags.service';
import { timeEntries, tags } from '../database/schema';

type TimeEntry = typeof timeEntries.$inferSelect;
type Tag = typeof tags.$inferSelect;

type TimeEntryWithRelations = TimeEntry & {
  task: { id: string; name: string; archivedAt: string | null } | null;
  tags: Tag[];
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activitiesService: ActivitiesService,
    private readonly activityTasksService: ActivityTasksService,
    private readonly tagsService: TagsService,
  ) { }

  async start(
    userId: string,
    activityId: string,
    description?: string,
    taskId?: string,
  ): Promise<TimeEntry> {
    // Check for active entry
    const activeEntry = await this.findActive(userId);
    if (activeEntry) {
      throw new ConflictException(
        'You already have an active time entry. Please stop it before starting a new one.',
      );
    }

    // Verify activity ownership and that it's not archived
    await this.activitiesService.findById(userId, activityId);

    // If taskId provided, verify it belongs to user and matches activity
    if (taskId) {
      const isTaskOwner = await this.activityTasksService.verifyOwnership(
        userId,
        taskId,
        activityId,
      );
      if (!isTaskOwner) {
        throw new NotFoundException('Task not found');
      }
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
        taskId: taskId || null,
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

    return updated;
  }

  async update(
    userId: string,
    id: string,
    data: { rating?: number; comment?: string; tagIds?: string[] },
  ): Promise<TimeEntry> {
    const entry = await this.databaseService.db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)),
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (!entry.stoppedAt) {
      throw new ConflictException('Cannot update an active time entry');
    }

    const stoppedTime = new Date(entry.stoppedAt).getTime();
    const now = Date.now();
    if (now - stoppedTime > ONE_WEEK_MS) {
      throw new ForbiddenException('Cannot edit time entry after 1 week');
    }

    // Update tags if provided
    if (data.tagIds !== undefined) {
      await this.tagsService.setEntryTags(userId, id, data.tagIds);
    }

    const [updated] = await this.databaseService.db
      .update(timeEntries)
      .set({
        rating: data.rating !== undefined ? data.rating : entry.rating,
        comment: data.comment !== undefined ? data.comment : entry.comment,
      })
      .where(eq(timeEntries.id, id))
      .returning();

    return updated;
  }

  async findActive(userId: string): Promise<TimeEntryWithRelations | null> {
    const entry = await this.databaseService.db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.userId, userId), isNull(timeEntries.stoppedAt)),
      with: {
        task: {
          columns: { id: true, name: true, archivedAt: true },
        },
        timeEntryTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    if (!entry) {
      return null;
    }

    // Transform timeEntryTags to tags array
    return {
      ...entry,
      task: entry.task,
      tags: entry.timeEntryTags.map((tet) => tet.tag),
    };
  }

  async findAll(
    userId: string,
    from?: string,
    to?: string,
    activityId?: string,
  ): Promise<TimeEntryWithRelations[]> {
    const conditions = [eq(timeEntries.userId, userId)];

    if (from) {
      conditions.push(gte(timeEntries.startedAt, from));
    }

    if (to) {
      conditions.push(lte(timeEntries.startedAt, to));
    }

    if (activityId) {
      conditions.push(eq(timeEntries.activityId, activityId));
    }

    const entries = await this.databaseService.db.query.timeEntries.findMany({
      where: and(...conditions),
      orderBy: (timeEntries, { desc }) => [desc(timeEntries.startedAt)],
      with: {
        task: {
          columns: { id: true, name: true, archivedAt: true },
        },
        timeEntryTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    // Transform timeEntryTags to tags array
    return entries.map((entry) => ({
      ...entry,
      task: entry.task,
      tags: entry.timeEntryTags.map((tet) => tet.tag),
    }));
  }

  async delete(userId: string, id: string): Promise<void> {
    const entry = await this.databaseService.db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)),
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    await this.databaseService.db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
  }
}
