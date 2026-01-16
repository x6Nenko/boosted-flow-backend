import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    archivedAt: text('archived_at'), // ISO8601 - soft delete
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Index for listing user's active activities (excluding archived)
    index('idx_activities_user_archived').on(
      table.userId,
      table.archivedAt,
    ),
  ],
);
