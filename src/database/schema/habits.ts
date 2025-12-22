import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const habits = sqliteTable(
  'habits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetDuration: integer('target_duration').notNull(), // seconds - total mastery goal
    xp: integer('xp').notNull().default(0), // total XP earned for this habit
    trackedDuration: integer('tracked_duration').notNull().default(0), // seconds - total time tracked
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    lastCompletedDate: text('last_completed_date'), // ISO8601
    archivedAt: text('archived_at'), // ISO8601 - soft delete
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Index for listing user's active habits (excluding archived)
    index('idx_habits_user_archived').on(
      table.userId,
      table.archivedAt,
    ),
  ],
);
