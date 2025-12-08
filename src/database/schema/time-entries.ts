import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const timeEntries = sqliteTable('time_entries', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  description: text('description'),
  startedAt: text('started_at').notNull(),
  stoppedAt: text('stopped_at'),
  createdAt: text('created_at').notNull(),
});
