CREATE INDEX `idx_origins_session` ON `tweet_search_origins` (`search_session_id`);--> statement-breakpoint
CREATE INDEX `idx_origins_variant` ON `tweet_search_origins` (`matched_variant`);