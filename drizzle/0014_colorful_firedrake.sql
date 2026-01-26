DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "idx_activities_user_archived";--> statement-breakpoint
DROP INDEX "idx_tasks_activity_archived";--> statement-breakpoint
DROP INDEX "idx_tags_user_name";--> statement-breakpoint
DROP INDEX "idx_time_entry_tags_tag";--> statement-breakpoint
DROP INDEX "idx_time_entries_user_date";--> statement-breakpoint
DROP INDEX "idx_time_entries_activity_date";--> statement-breakpoint
ALTER TABLE `users` ALTER COLUMN "hashed_password" TO "hashed_password" text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_activities_user_archived` ON `activities` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_activity_archived` ON `tasks` (`activity_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `idx_tags_user_name` ON `tags` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_time_entry_tags_tag` ON `time_entry_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_date` ON `time_entries` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_activity_date` ON `time_entries` (`activity_id`,`started_at`);