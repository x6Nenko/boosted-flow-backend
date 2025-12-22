CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`target_duration` integer NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
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
CREATE INDEX `idx_habits_user_archived` ON `habits` (`user_id`,`archived_at`);--> statement-breakpoint
ALTER TABLE `time_entries` ADD `habit_id` text REFERENCES habits(id);--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_date` ON `time_entries` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_habit_date` ON `time_entries` (`habit_id`,`started_at`);