CREATE TABLE `query_id_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`operation_name` text NOT NULL,
	`feature_signature` text NOT NULL,
	`query_id` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`use_count` integer NOT NULL,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_query_id_cache_operation_signature` ON `query_id_cache` (`operation_name`,`feature_signature`);
--> statement-breakpoint
CREATE INDEX `idx_query_id_cache_expires` ON `query_id_cache` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_query_id_cache_last_used` ON `query_id_cache` (`last_used_at`);
