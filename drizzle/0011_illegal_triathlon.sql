DROP TABLE `daily_time_entry_counts`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `tracked_duration`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `current_streak`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `longest_streak`;--> statement-breakpoint
ALTER TABLE `activities` DROP COLUMN `last_completed_date`;