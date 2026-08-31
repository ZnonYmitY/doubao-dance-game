CREATE UNIQUE INDEX `idx_leaderboard_username_unique` ON `leaderboard_entries` (`username`);
--> statement-breakpoint
PRAGMA optimize;
