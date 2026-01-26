import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password'), // nullable for OAuth users
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
