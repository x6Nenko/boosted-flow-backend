CREATE TABLE IF NOT EXISTS `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`target_duration` integer NOT NULL,
	`tracked_duration` integer DEFAULT 0 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_completed_date` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activities_user_archived` ON `activities` (`user_id`,`archived_at`);
--> statement-breakpoint

-- SQLite cannot DROP a column that participates in a FK without rebuilding the table.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_time_entries_habit_date`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_time_entries_activity_date`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_time_entries_user_date`;
--> statement-breakpoint
CREATE TABLE `__new_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text,
	`description` text,
	`started_at` text NOT NULL,
	`stopped_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_time_entries`(
	"id",
	"user_id",
	"activity_id",
	"description",
	"started_at",
	"stopped_at",
	"created_at"
)
SELECT
	"id",
	"user_id",
	"activity_id",
	"description",
	"started_at",
	"stopped_at",
	"created_at"
FROM `time_entries`
WHERE EXISTS (SELECT 1 FROM pragma_table_info('time_entries') WHERE name = 'activity_id');
--> statement-breakpoint
INSERT INTO `__new_time_entries`(
	"id",
	"user_id",
	"activity_id",
	"description",
	"started_at",
	"stopped_at",
	"created_at"
)
SELECT
	"id",
	"user_id",
	NULL,
	"description",
	"started_at",
	"stopped_at",
	"created_at"
FROM `time_entries`
WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('time_entries') WHERE name = 'activity_id');
--> statement-breakpoint
DROP TABLE IF EXISTS `time_entries`;
--> statement-breakpoint
ALTER TABLE `__new_time_entries` RENAME TO `time_entries`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_time_entries_user_date` ON `time_entries` (`user_id`,`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_time_entries_activity_date` ON `time_entries` (`activity_id`,`started_at`);
--> statement-breakpoint
DROP TABLE IF EXISTS `habits`;