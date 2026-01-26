import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const authCodes = sqliteTable('auth_codes', {
  code: text('code').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});
