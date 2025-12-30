CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`progress_current` integer DEFAULT 0,
	`progress_total` integer DEFAULT 0,
	`progress_message` text,
	`metadata` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_started` ON `jobs` (`started_at`);