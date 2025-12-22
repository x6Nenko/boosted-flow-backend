import { relations } from 'drizzle-orm';
import { users } from './users';
import { habits } from './habits';
import { timeEntries } from './time-entries';
import { refreshTokens } from './refresh-tokens';

export const usersRelations = relations(users, ({ many }) => ({
  habits: many(habits),
  timeEntries: many(timeEntries),
  refreshTokens: many(refreshTokens),
}));

export const habitsRelations = relations(habits, ({ one, many }) => ({
  user: one(users, {
    fields: [habits.userId],
    references: [users.id],
  }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  habit: one(habits, {
    fields: [timeEntries.habitId],
    references: [habits.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
