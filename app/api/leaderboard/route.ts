import { getD1 } from "@/db";
import { getPerformanceRating } from "@/lib/performance";

type ScorePayload = {
  playerId?: unknown;
  username?: unknown;
  score?: unknown;
  adjustments?: unknown;
  peaks?: unknown;
  dances?: unknown;
};

type LeaderboardRow = {
  username: string;
  score: number;
  peaks: number;
  adjustments: number;
  dances: number;
  rating: string;
  updatedAt: string;
};

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (!/^[\p{Script=Han}]{2,3}$/u.test(username)) return null;
  return username;
}

function readPlayerId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(value) ? value : null;
}

function readInteger(value: unknown, max: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

async function readTopEntries(db: D1Database) {
  const result = await db.prepare(`
    SELECT
      username,
      best_score AS score,
      best_peaks AS peaks,
      best_adjustments AS adjustments,
      best_dances AS dances,
      performance_rating AS rating,
      updated_at AS updatedAt
    FROM leaderboard_entries
    WHERE best_score > 0
    ORDER BY best_score DESC, best_peaks DESC, best_dances DESC, updated_at ASC
    LIMIT 50
  `).all<LeaderboardRow>();

  return (result.results ?? []).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("UNIQUE constraint failed") && message.includes("username")) {
    return json({ error: "这个花名已经有人使用，请换一个。" }, 409);
  }
  if (message.includes("no such table") || message.includes("leaderboard_entries")) {
    return json({ error: "排行榜正在初始化，请稍后再试。" }, 503);
  }
  return json({ error: "排行榜暂时不可用，请稍后再试。" }, 500);
}

export async function GET() {
  try {
    return json({ entries: await readTopEntries(getD1()) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as ScorePayload;
    const playerId = readPlayerId(payload.playerId);
    const username = normalizeUsername(payload.username);
    if (!playerId || !username) {
      return json({ error: "花名需为 2–3 个汉字。" }, 400);
    }

    await getD1().prepare(`
      INSERT INTO leaderboard_entries (player_id, username, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player_id) DO UPDATE SET username = excluded.username
    `).bind(playerId, username).run();

    return json({ username }, 201);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ScorePayload;
    const playerId = readPlayerId(payload.playerId);
    const username = normalizeUsername(payload.username);
    const score = readInteger(payload.score, 1_000_000);
    const adjustments = readInteger(payload.adjustments, 10_000);
    const peaks = readInteger(payload.peaks, 1_000);
    const dances = readInteger(payload.dances, 2_000);

    if (!playerId || !username || score === null || adjustments === null || peaks === null || dances === null) {
      return json({ error: "成绩数据无效。" }, 400);
    }

    const rating = getPerformanceRating(score);
    const db = getD1();
    await db.prepare(`
      INSERT INTO leaderboard_entries (
        player_id, username, best_score, best_peaks, best_adjustments,
        best_dances, performance_rating, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player_id) DO UPDATE SET
        username = excluded.username,
        best_score = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN excluded.best_score ELSE leaderboard_entries.best_score END,
        best_peaks = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN excluded.best_peaks ELSE leaderboard_entries.best_peaks END,
        best_adjustments = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN excluded.best_adjustments ELSE leaderboard_entries.best_adjustments END,
        best_dances = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN excluded.best_dances ELSE leaderboard_entries.best_dances END,
        performance_rating = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN excluded.performance_rating ELSE leaderboard_entries.performance_rating END,
        updated_at = CASE WHEN
          excluded.best_score > leaderboard_entries.best_score OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks > leaderboard_entries.best_peaks) OR
          (excluded.best_score = leaderboard_entries.best_score AND excluded.best_peaks = leaderboard_entries.best_peaks AND excluded.best_dances > leaderboard_entries.best_dances)
        THEN CURRENT_TIMESTAMP ELSE leaderboard_entries.updated_at END
    `).bind(playerId, username, score, peaks, adjustments, dances, rating).run();

    const current = await db.prepare(`
      SELECT best_score AS score, best_peaks AS peaks, best_dances AS dances
      FROM leaderboard_entries WHERE player_id = ? LIMIT 1
    `).bind(playerId).first<{ score: number; peaks: number; dances: number }>();

    const rankRow = current
      ? await db.prepare(`
          SELECT COUNT(*) + 1 AS rank
          FROM leaderboard_entries
          WHERE best_score > 0 AND (
                best_score > ?
             OR (best_score = ? AND best_peaks > ?)
             OR (best_score = ? AND best_peaks = ? AND best_dances > ?)
          )
        `).bind(current.score, current.score, current.peaks, current.score, current.peaks, current.dances).first<{ rank: number }>()
      : null;

    return json({ entries: await readTopEntries(db), rank: rankRow?.rank ?? null }, 201);
  } catch (error) {
    return routeError(error);
  }
}
