CREATE TABLE `search_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer,
	`scrape_session_id` integer,
	`query` text NOT NULL,
	`variants` text NOT NULL,
	`search_mode` text DEFAULT 'Latest' NOT NULL,
	`max_tweets` integer NOT NULL,
	`date_start` integer,
	`date_end` integer,
	`cursor` text,
	`last_tweet_id` text,
	`tweets_collected` integer DEFAULT 0,
	`total_processed` integer DEFAULT 0,
	`date_filtered` integer DEFAULT 0,
	`duplicates_skipped` integer DEFAULT 0,
	`users_created` integer DEFAULT 0,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`error_message` text,
	`embeddings_generated` integer DEFAULT false,
	FOREIGN KEY (`topic_id`) REFERENCES `search_topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scrape_session_id`) REFERENCES `scrape_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `search_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`variants` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_searched` integer,
	`total_tweets_found` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_topics_name_unique` ON `search_topics` (`name`);--> statement-breakpoint
CREATE TABLE `tweet_search_origins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tweet_id` text NOT NULL,
	`search_session_id` integer NOT NULL,
	`matched_variant` text NOT NULL,
	`found_at` integer NOT NULL,
	FOREIGN KEY (`tweet_id`) REFERENCES `tweets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_session_id`) REFERENCES `search_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tweet_search_origins_tweet_id_unique` ON `tweet_search_origins` (`tweet_id`);