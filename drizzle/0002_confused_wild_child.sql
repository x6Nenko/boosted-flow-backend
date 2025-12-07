PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_refresh_tokens`("id", "user_id", "token_hash", "expires_at", "revoked", "created_at") SELECT "id", "user_id", "token_hash", "expires_at", "revoked", "created_at" FROM `refresh_tokens`;--> statement-breakpoint
DROP TABLE `refresh_tokens`;--> statement-breakpoint
ALTER TABLE `__new_refresh_tokens` RENAME TO `refresh_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;