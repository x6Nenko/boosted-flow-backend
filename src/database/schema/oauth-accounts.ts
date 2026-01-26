import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(), // 'google', 'github'
    providerUserId: text('provider_user_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerUserId] })],
);
