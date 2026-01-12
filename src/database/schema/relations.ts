import { relations } from 'drizzle-orm';
import { users } from './users';
import { activities } from './activities';
import { tasks } from './tasks';
import { tags, timeEntryTags } from './tags';
import { timeEntries } from './time-entries';
import { dailyTimeEntryCounts } from './daily-time-entry-counts';
import { refreshTokens } from './refresh-tokens';

export const usersRelations = relations(users, ({ many }) => ({
  activities: many(activities),
  tasks: many(tasks),
  tags: many(tags),
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
  tasks: many(tasks),
  timeEntries: many(timeEntries),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [tasks.activityId],
    references: [activities.id],
  }),
  timeEntries: many(timeEntries),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  timeEntryTags: many(timeEntryTags),
}));

export const timeEntryTagsRelations = relations(timeEntryTags, ({ one }) => ({
  timeEntry: one(timeEntries, {
    fields: [timeEntryTags.timeEntryId],
    references: [timeEntries.id],
  }),
  tag: one(tags, {
    fields: [timeEntryTags.tagId],
    references: [tags.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one, many }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [timeEntries.activityId],
    references: [activities.id],
  }),
  task: one(tasks, {
    fields: [timeEntries.taskId],
    references: [tasks.id],
  }),
  timeEntryTags: many(timeEntryTags),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
