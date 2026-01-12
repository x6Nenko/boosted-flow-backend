import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { ActivitiesService } from '../activities/activities.service';
import { tasks } from '../database/schema';

type Task = typeof tasks.$inferSelect;

@Injectable()
export class ActivityTasksService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activitiesService: ActivitiesService,
  ) { }

  async create(
    userId: string,
    activityId: string,
    name: string,
  ): Promise<Task> {
    // Verify activity ownership
    await this.activitiesService.findById(userId, activityId);

    const id = uuidv4();
    const now = new Date().toISOString();

    const [task] = await this.databaseService.db
      .insert(tasks)
      .values({
        id,
        userId,
        activityId,
        name,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return task;
  }

  async findAllForActivity(
    userId: string,
    activityId: string,
    includeArchived = false,
  ): Promise<Task[]> {
    // Verify activity ownership
    await this.activitiesService.findById(userId, activityId);

    const conditions = [
      eq(tasks.activityId, activityId),
      eq(tasks.userId, userId),
    ];

    if (!includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }

    return this.databaseService.db.query.tasks.findMany({
      where: and(...conditions),
      orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
    });
  }

  async findById(userId: string, id: string): Promise<Task> {
    const task = await this.databaseService.db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(
    userId: string,
    id: string,
    data: { name?: string },
  ): Promise<Task> {
    await this.findById(userId, id);

    const now = new Date().toISOString();

    const [updated] = await this.databaseService.db
      .update(tasks)
      .set({
        ...data,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    return updated;
  }

  async archive(userId: string, id: string): Promise<Task> {
    const task = await this.findById(userId, id);

    if (task.archivedAt) {
      throw new ConflictException('Task is already archived');
    }

    const now = new Date().toISOString();

    const [archived] = await this.databaseService.db
      .update(tasks)
      .set({
        archivedAt: now,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    return archived;
  }

  async unarchive(userId: string, id: string): Promise<Task> {
    const task = await this.findById(userId, id);

    if (!task.archivedAt) {
      throw new ConflictException('Task is not archived');
    }

    const now = new Date().toISOString();

    const [unarchived] = await this.databaseService.db
      .update(tasks)
      .set({
        archivedAt: null,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    return unarchived;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findById(userId, id);

    await this.databaseService.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  /**
   * Verify that a task exists, belongs to the user, and matches the activity.
   * Used by TimeEntriesService to validate taskId before linking.
   */
  async verifyOwnership(
    userId: string,
    taskId: string,
    activityId: string,
  ): Promise<boolean> {
    const task = await this.databaseService.db.query.tasks.findFirst({
      where: and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId),
        eq(tasks.activityId, activityId),
        isNull(tasks.archivedAt),
      ),
    });

    return !!task;
  }
}
