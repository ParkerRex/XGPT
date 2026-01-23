ALTER TABLE `scrape_sessions` ADD COLUMN `include_replies` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `include_retweets` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `rate_limit_profile` text;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `cursor` text;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `last_tweet_id` text;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `page_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `scrape_sessions` ADD COLUMN `last_updated_at` integer;
--> statement-breakpoint
ALTER TABLE `search_sessions` ADD COLUMN `page_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `search_sessions` ADD COLUMN `last_updated_at` integer;
--> statement-breakpoint
CREATE TABLE `discover_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`max_profiles` integer NOT NULL,
	`save_results` integer DEFAULT 0,
	`cursor` text,
	`last_profile_id` text,
	`page_count` integer DEFAULT 0,
	`profiles_found` integer DEFAULT 0,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` integer NOT NULL,
	`last_updated_at` integer,
	`completed_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `idx_discover_sessions_status` ON `discover_sessions` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_discover_sessions_started` ON `discover_sessions` (`started_at`);
