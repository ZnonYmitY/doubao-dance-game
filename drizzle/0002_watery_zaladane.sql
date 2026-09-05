CREATE TABLE `game_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`source_channel` text DEFAULT 'direct' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_sessions_player` ON `game_sessions` (`player_id`);--> statement-breakpoint
CREATE INDEX `idx_game_sessions_started` ON `game_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `share_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`channel` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_share_events_channel` ON `share_events` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_share_events_created` ON `share_events` (`created_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `game_sessions` (`session_id`, `player_id`, `source_channel`, `started_at`)
SELECT 'legacy-' || `player_id`, `player_id`, 'legacy', `updated_at`
FROM `leaderboard_entries`;--> statement-breakpoint
UPDATE `leaderboard_entries`
SET `performance_rating` = CASE
  WHEN `best_peaks` >= 3 OR (`best_peaks` > 0 AND `best_score` >= 6000) THEN 'E'
  WHEN `best_peaks` >= 2 OR (`best_peaks` > 0 AND `best_score` >= 5000) THEN 'M+'
  WHEN `best_peaks` = 0 OR `best_score` < 3000 THEN 'I'
  WHEN `best_score` >= 4000 THEN 'M'
  ELSE 'M-'
END;--> statement-breakpoint
PRAGMA optimize;
