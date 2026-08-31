CREATE TABLE `leaderboard_entries` (
	`player_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`best_peaks` integer DEFAULT 0 NOT NULL,
	`best_adjustments` integer DEFAULT 0 NOT NULL,
	`best_dances` integer DEFAULT 0 NOT NULL,
	`performance_rating` text DEFAULT 'I' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_ranking` ON `leaderboard_entries` (`best_score`,`best_peaks`,`best_dances`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
