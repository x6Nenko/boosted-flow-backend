import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { tags, timeEntryTags } from '../database/schema';

type Tag = typeof tags.$inferSelect;

@Injectable()
export class TagsService {
  constructor(private readonly databaseService: DatabaseService) { }

  async findAll(userId: string): Promise<Tag[]> {
    return this.databaseService.db.query.tags.findMany({
      where: eq(tags.userId, userId),
      orderBy: (tags, { asc }) => [asc(tags.name)],
    });
  }

  async getOrCreate(userId: string, names: string[]): Promise<Tag[]> {
    if (names.length === 0) {
      return [];
    }

    // Normalize names (lowercase, trim)
    const normalizedNames = [...new Set(names.map((n) => n.toLowerCase().trim()))];

    // Find existing tags
    const existingTags = await this.databaseService.db.query.tags.findMany({
      where: and(
        eq(tags.userId, userId),
        inArray(tags.name, normalizedNames),
      ),
    });

    const existingNamesSet = new Set(existingTags.map((t) => t.name));
    const missingNames = normalizedNames.filter((n) => !existingNamesSet.has(n));

    // Create missing tags
    if (missingNames.length > 0) {
      const now = new Date().toISOString();
      const newTags = missingNames.map((name) => ({
        id: uuidv4(),
        userId,
        name,
        createdAt: now,
      }));

      await this.databaseService.db.insert(tags).values(newTags);

      return [...existingTags, ...newTags.map((t) => t as Tag)];
    }

    return existingTags;
  }

  async delete(userId: string, id: string): Promise<void> {
    const tag = await this.databaseService.db.query.tags.findFirst({
      where: and(eq(tags.id, id), eq(tags.userId, userId)),
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    await this.databaseService.db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)));
  }

  /**
   * Replace all tags on a time entry with new ones.
   * Called by TimeEntriesService when updating tags.
   */
  async setEntryTags(
    userId: string,
    timeEntryId: string,
    tagIds: string[],
  ): Promise<void> {
    // Verify all tags belong to user
    if (tagIds.length > 0) {
      const validTags = await this.databaseService.db.query.tags.findMany({
        where: and(eq(tags.userId, userId), inArray(tags.id, tagIds)),
      });

      if (validTags.length !== tagIds.length) {
        throw new NotFoundException('One or more tags not found');
      }
    }

    // Delete existing tags for entry
    await this.databaseService.db
      .delete(timeEntryTags)
      .where(eq(timeEntryTags.timeEntryId, timeEntryId));

    // Insert new tags
    if (tagIds.length > 0) {
      await this.databaseService.db.insert(timeEntryTags).values(
        tagIds.map((tagId) => ({
          timeEntryId,
          tagId,
        })),
      );
    }
  }
}
