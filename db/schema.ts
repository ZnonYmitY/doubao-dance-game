import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leaderboardEntries = sqliteTable(
  "leaderboard_entries",
  {
    playerId: text("player_id").primaryKey(),
    username: text("username").notNull(),
    bestScore: integer("best_score").notNull().default(0),
    bestPeaks: integer("best_peaks").notNull().default(0),
    bestAdjustments: integer("best_adjustments").notNull().default(0),
    bestDances: integer("best_dances").notNull().default(0),
    performanceRating: text("performance_rating").notNull().default("I"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_leaderboard_ranking").on(
      table.bestScore,
      table.bestPeaks,
      table.bestDances,
      table.updatedAt,
    ),
  ],
);
