PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tweets` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`user_id` integer,
	`username` text NOT NULL,
	`created_at` integer,
	`scraped_at` integer NOT NULL,
	`is_retweet` integer DEFAULT false,
	`is_reply` integer DEFAULT false,
	`likes` integer DEFAULT 0,
	`retweets` integer DEFAULT 0,
	`replies` integer DEFAULT 0,
	`metadata` text,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tweets`("id", "text", "user_id", "username", "created_at", "scraped_at", "is_retweet", "is_reply", "likes", "retweets", "replies", "metadata", "deleted_at") SELECT "id", "text", "user_id", "username", "created_at", "scraped_at", "is_retweet", "is_reply", "likes", "retweets", "replies", "metadata", "deleted_at" FROM `tweets`;--> statement-breakpoint
DROP TABLE `tweets`;--> statement-breakpoint
ALTER TABLE `__new_tweets` RENAME TO `tweets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tweets_user` ON `tweets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_tweets_username` ON `tweets` (`username`);--> statement-breakpoint
CREATE INDEX `idx_tweets_created` ON `tweets` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tweets_deleted` ON `tweets` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `idx_users_bio` ON `users` (`bio`);--> statement-breakpoint
CREATE INDEX `idx_users_location` ON `users` (`location`);--> statement-breakpoint
CREATE INDEX `idx_users_verified` ON `users` (`is_verified`);--> statement-breakpoint
CREATE INDEX `idx_users_deleted` ON `users` (`deleted_at`);