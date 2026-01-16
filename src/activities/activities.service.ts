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
}
