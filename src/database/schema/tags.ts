import { sqliteTable, text, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { timeEntries } from './time-entries';

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    // Index for listing user's tags and name lookup
    index('idx_tags_user_name').on(table.userId, table.name),
  ],
);

// Junction table for many-to-many relationship between time entries and tags
export const timeEntryTags = sqliteTable(
  'time_entry_tags',
  {
    timeEntryId: text('time_entry_id')
      .notNull()
      .references(() => timeEntries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.timeEntryId, table.tagId] }),
    index('idx_time_entry_tags_tag').on(table.tagId),
  ],
);
