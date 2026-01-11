import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { activities } from '../database/schema';

type Activity = typeof activities.$inferSelect;

@Injectable()
export class ActivitiesService {
  constructor(private readonly databaseService: DatabaseService) { }

  private calculateStreakUpdate(args: {
    durationDelta: number;
    currentStreak: number;
    longestStreak: number;
    lastCompletedDate: string | null;
    now: Date;
  }): {
    currentStreak: number;
    longestStreak: number;
    lastCompletedDate: string | null;
  } {
    const today = args.now.toISOString().split('T')[0]; // YYYY-MM-DD

    let currentStreak = args.currentStreak;
    let longestStreak = args.longestStreak;
    let lastCompletedDate = args.lastCompletedDate;

    // Streak rule (simple): count 1 completion per day when any positive time is logged.
    // If already completed today, do nothing.
    if (args.durationDelta > 0 && lastCompletedDate !== today) {
      const yesterday = new Date(args.now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastCompletedDate === yesterdayStr) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }

      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }

      lastCompletedDate = today;
    }

    return {
      currentStreak,
      longestStreak,
      lastCompletedDate,
    };
  }

  async create(
    userId: string,
    name: string,
  ): Promise<Activity> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const [activity] = await this.databaseService.db
      .insert(activities)
      .values({
        id,
        userId,
        name,
        trackedDuration: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDate: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return activity;
  }

  async findAll(
    userId: string,
    includeArchived = false,
  ): Promise<Activity[]> {
    const conditions = [eq(activities.userId, userId)];

    if (!includeArchived) {
      conditions.push(isNull(activities.archivedAt));
    }

    return this.databaseService.db.query.activities.findMany({
      where: and(...conditions),
      orderBy: (activities, { desc }) => [desc(activities.createdAt)],
    });
  }

  async findById(userId: string, id: string): Promise<Activity> {
    const activity = await this.databaseService.db.query.activities.findFirst({
      where: and(eq(activities.id, id), eq(activities.userId, userId)),
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    return activity;
  }

  async update(
    userId: string,
    id: string,
    data: { name?: string },
  ): Promise<Activity> {
    // Verify ownership first
    await this.findById(userId, id);

    const now = new Date().toISOString();

    const [updated] = await this.databaseService.db
      .update(activities)
      .set({
        ...data,
        updatedAt: now,
      })
      .where(and(eq(activities.id, id), eq(activities.userId, userId)))
      .returning();

    return updated;
  }

  async archive(userId: string, id: string): Promise<Activity> {
    // Verify ownership first
    const activity = await this.findById(userId, id);

    if (activity.archivedAt) {
      throw new ConflictException('Activity is already archived');
    }

    const now = new Date().toISOString();

    const [archived] = await this.databaseService.db
      .update(activities)
      .set({
        archivedAt: now,
        updatedAt: now,
      })
      .where(and(eq(activities.id, id), eq(activities.userId, userId)))
      .returning();

    return archived;
  }

  async unarchive(userId: string, id: string): Promise<Activity> {
    const activity = await this.findById(userId, id);

    if (!activity.archivedAt) {
      throw new ConflictException('Activity is not archived');
    }

    const now = new Date().toISOString();

    const [unarchived] = await this.databaseService.db
      .update(activities)
      .set({
        archivedAt: null,
        updatedAt: now,
      })
      .where(and(eq(activities.id, id), eq(activities.userId, userId)))
      .returning();

    return unarchived;
  }

  /**
   * Update progress when a time entry linked to this activity is stopped.
   * Also updates streak once per day when any positive time is logged.
   */
  async updateProgress(
    userId: string,
    activityId: string,
    durationDelta: number,
  ): Promise<Activity> {
    const activity = await this.findById(userId, activityId);

    const newTrackedDuration = activity.trackedDuration + durationDelta;
    const nowDate = new Date();
    const now = nowDate.toISOString();

    const streakUpdate = this.calculateStreakUpdate({
      durationDelta,
      currentStreak: activity.currentStreak,
      longestStreak: activity.longestStreak,
      lastCompletedDate: activity.lastCompletedDate,
      now: nowDate,
    });

    const [updated] = await this.databaseService.db
      .update(activities)
      .set({
        trackedDuration: newTrackedDuration,
        currentStreak: streakUpdate.currentStreak,
        longestStreak: streakUpdate.longestStreak,
        lastCompletedDate: streakUpdate.lastCompletedDate,
        updatedAt: now,
      })
      .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Verify that an activity exists and belongs to the user.
   * Used by TimeEntriesService to validate activityId before linking.
   */
  async verifyOwnership(userId: string, activityId: string): Promise<boolean> {
    const activity = await this.databaseService.db.query.activities.findFirst({
      where: and(
        eq(activities.id, activityId),
        eq(activities.userId, userId),
        isNull(activities.archivedAt),
      ),
    });

    return !!activity;
  }
}
