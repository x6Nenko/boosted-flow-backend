import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});
