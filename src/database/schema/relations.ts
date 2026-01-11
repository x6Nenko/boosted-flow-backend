import { relations } from 'drizzle-orm';
import { users } from './users';
import { activities } from './activities';
import { timeEntries } from './time-entries';
import { dailyTimeEntryCounts } from './daily-time-entry-counts';
import { refreshTokens } from './refresh-tokens';

export const usersRelations = relations(users, ({ many }) => ({
  activities: many(activities),
  timeEntries: many(timeEntries),
  dailyTimeEntryCounts: many(dailyTimeEntryCounts),
  refreshTokens: many(refreshTokens),
}));

export const dailyTimeEntryCountsRelations = relations(
  dailyTimeEntryCounts,
  ({ one }) => ({
    user: one(users, {
      fields: [dailyTimeEntryCounts.userId],
      references: [users.id],
    }),
  }),
);

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [timeEntries.activityId],
    references: [activities.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
