import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { activities } from './activities';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    archivedAt: text('archived_at'), // ISO8601 - soft delete
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Index for listing activity's tasks (excluding archived)
    index('idx_tasks_activity_archived').on(table.activityId, table.archivedAt),
  ],
);
