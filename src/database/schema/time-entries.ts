import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { activities } from './activities';

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').references(() => activities.id, {
      onDelete: 'cascade',
    }),
    description: text('description'),
    startedAt: text('started_at').notNull(),
    stoppedAt: text('stopped_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    // Index for listing user's time entries chronologically
    index('idx_time_entries_user_date').on(
      table.userId,
      table.startedAt,
    ),
    // Index for activity-specific time tracking
    index('idx_time_entries_activity_date').on(
      table.activityId,
      table.startedAt,
    ),
  ],
);
