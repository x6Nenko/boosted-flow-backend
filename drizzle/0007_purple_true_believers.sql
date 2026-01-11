PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Delete time entries without activity_id before enforcing NOT NULL constraint
DELETE FROM `time_entries` WHERE `activity_id` IS NULL;--> statement-breakpoint
CREATE TABLE `__new_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`description` text,
	`started_at` text NOT NULL,
	`stopped_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_time_entries`("id", "user_id", "activity_id", "description", "started_at", "stopped_at", "created_at") SELECT "id", "user_id", "activity_id", "description", "started_at", "stopped_at", "created_at" FROM `time_entries`;--> statement-breakpoint
DROP TABLE `time_entries`;--> statement-breakpoint
ALTER TABLE `__new_time_entries` RENAME TO `time_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_date` ON `time_entries` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_activity_date` ON `time_entries` (`activity_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `target_duration`;