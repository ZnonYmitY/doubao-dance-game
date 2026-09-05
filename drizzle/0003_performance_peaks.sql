UPDATE `leaderboard_entries`
SET `performance_rating` = CASE
  WHEN `best_score` >= 6500 OR `best_peaks` >= 3 THEN 'E'
  WHEN `best_score` >= 5000 OR `best_peaks` >= 2 THEN 'M+'
  WHEN `best_score` >= 3500 OR `best_peaks` >= 1 THEN 'M'
  WHEN `best_score` >= 1800 THEN 'M-'
  ELSE 'I'
END;--> statement-breakpoint
PRAGMA optimize;
