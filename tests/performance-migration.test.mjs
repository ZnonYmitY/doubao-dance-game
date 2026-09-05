import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("historical leaderboard migration uses the latest score and peak rules", async () => {
  const sql = await readFile(new URL("../drizzle/0004_latest_performance_rules.sql", import.meta.url), "utf8");
  const conditions = [
    "WHEN `best_score` >= 6500 OR `best_peaks` >= 3 THEN 'E'",
    "WHEN `best_score` >= 5000 OR `best_peaks` >= 2 THEN 'M+'",
    "WHEN `best_score` >= 3500 OR `best_peaks` >= 1 THEN 'M'",
    "WHEN `best_score` >= 1800 THEN 'M-'",
    "ELSE 'I'",
  ];

  let previous = -1;
  for (const condition of conditions) {
    const index = sql.indexOf(condition);
    assert.ok(index > previous, `missing or misordered migration condition: ${condition}`);
    previous = index;
  }
  assert.match(sql, /PRAGMA optimize;/);
});
