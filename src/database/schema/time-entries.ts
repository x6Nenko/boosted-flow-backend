import { sqliteTable, text, index, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { activities } from './activities';
import { tasks } from './tasks';

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    description: text('description'),
    startedAt: text('started_at').notNull(),
    stoppedAt: text('stopped_at'),
    rating: integer('rating'),
    comment: text('comment'),
    distractionCount: integer('distraction_count').default(0).notNull(),
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
