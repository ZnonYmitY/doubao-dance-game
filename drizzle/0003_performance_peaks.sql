UPDATE `leaderboard_entries`
SET `performance_rating` = CASE
  WHEN `best_peaks` >= 3 OR (`best_peaks` > 0 AND `best_score` >= 6000) THEN 'E'
  WHEN `best_peaks` >= 2 OR (`best_peaks` > 0 AND `best_score` >= 5000) THEN 'M+'
  WHEN `best_peaks` = 0 OR `best_score` < 3000 THEN 'I'
  WHEN `best_score` >= 4000 THEN 'M'
  ELSE 'M-'
END;--> statement-breakpoint
PRAGMA optimize;
