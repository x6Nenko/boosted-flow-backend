import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Pre-aggregated heatmap counts (one row per user per day).
 * `date` is stored as ISO date string: YYYY-MM-DD.
 */
export const dailyTimeEntryCounts = sqliteTable(
  'daily_time_entry_counts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    count: integer('count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.date],
      name: 'pk_daily_time_entry_counts',
    }),
  ],
);
