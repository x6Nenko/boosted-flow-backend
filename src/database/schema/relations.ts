import { relations } from 'drizzle-orm';
import { users } from './users';
import { timeEntries } from './time-entries';
import { refreshTokens } from './refresh-tokens';

export const usersRelations = relations(users, ({ many }) => ({
  timeEntries: many(timeEntries),
  refreshTokens: many(refreshTokens),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
