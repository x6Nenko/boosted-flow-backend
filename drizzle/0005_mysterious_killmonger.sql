PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`habit_id` text,
	`description` text,
	`started_at` text NOT NULL,
	`stopped_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_time_entries`("id", "user_id", "habit_id", "description", "started_at", "stopped_at", "created_at") SELECT "id", "user_id", "habit_id", "description", "started_at", "stopped_at", "created_at" FROM `time_entries`;--> statement-breakpoint
DROP TABLE `time_entries`;--> statement-breakpoint
ALTER TABLE `__new_time_entries` RENAME TO `time_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_date` ON `time_entries` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_habit_date` ON `time_entries` (`habit_id`,`started_at`);