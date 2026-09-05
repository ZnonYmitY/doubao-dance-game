import { getPerformanceRating } from "../lib/performance";

interface Env {
  DB: D1Database;
}

type ScorePayload = {
  playerId?: unknown;
  username?: unknown;
  score?: unknown;
  adjustments?: unknown;
  peaks?: unknown;
  dances?: unknown;
};

type AnalyticsPayload = {
  eventId?: unknown;
  eventType?: unknown;
  playerId?: unknown;
  sessionId?: unknown;
  channel?: unknown;
  sourceChannel?: unknown;
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

const ALLOWED_ORIGINS = new Set([
  "https://doubao-dance-game.lucky-plum-7420.chatgpt.site",
  "https://znonymity.github.io",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) || origin.startsWith("http://localhost:") ? origin : "https://znonymity.github.io",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function jsonp(request: Request, data: unknown, callback: string) {
  return new Response(`${callback}(${JSON.stringify(data)});`, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return /^[\p{Script=Han}]{2,3}$/u.test(username) ? username : null;
}

function readId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(value) ? value : null;
}

function readInteger(value: unknown, max: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

function readLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(normalized) ? normalized : fallback;
}

async function readTopEntries(db: D1Database) {
  const result = await db.prepare(`
    SELECT username, best_score AS score, best_peaks AS peaks,
      best_adjustments AS adjustments, best_dances AS dances,
      performance_rating AS rating, updated_at AS updatedAt
    FROM leaderboard_entries
    WHERE best_score > 0
    ORDER BY best_score DESC, best_peaks DESC, best_dances DESC, updated_at ASC
    LIMIT 50
  `).all<LeaderboardRow>();
  return (result.results ?? []).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function routeError(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("UNIQUE constraint failed") && message.includes("username")) {
    return json(request, { error: "这个花名已经有人使用，请换一个。" }, 409);
  }
  return json(request, { error: "服务暂时不可用，请稍后再试。" }, 500);
}

async function leaderboard(request: Request, db: D1Database) {
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const data = { entries: await readTopEntries(db) };
      const callback = new URL(request.url).searchParams.get("callback");
      if (callback && !/^[a-zA-Z_$][a-zA-Z0-9_$]{0,80}$/.test(callback)) {
        return json(request, { error: "Invalid callback" }, 400);
      }
      return callback ? jsonp(request, data, callback) : json(request, data);
    }
    const payload = (await request.json()) as ScorePayload;
    const playerId = readId(payload.playerId);
    const username = normalizeUsername(payload.username);
    if (!playerId || !username) return json(request, { error: "花名需为 2–3 个汉字。" }, 400);

    if (request.method === "PUT") {
      await db.prepare(`
        INSERT INTO leaderboard_entries (player_id, username, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(player_id) DO UPDATE SET username = excluded.username
      `).bind(playerId, username).run();
      return json(request, { username }, 201);
    }

    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    const score = readInteger(payload.score, 1_000_000);
    const adjustments = readInteger(payload.adjustments, 10_000);
    const peaks = readInteger(payload.peaks, 1_000);
    const dances = readInteger(payload.dances, 2_000);
    if (score === null || adjustments === null || peaks === null || dances === null) {
      return json(request, { error: "成绩数据无效。" }, 400);
    }
    const rating = getPerformanceRating(score, peaks);
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
    const rankRow = current ? await db.prepare(`
      SELECT COUNT(*) + 1 AS rank FROM leaderboard_entries
      WHERE best_score > 0 AND (
        best_score > ? OR (best_score = ? AND best_peaks > ?) OR
        (best_score = ? AND best_peaks = ? AND best_dances > ?)
      )
    `).bind(current.score, current.score, current.peaks, current.score, current.peaks, current.dances).first<{ rank: number }>() : null;
    return json(request, { entries: await readTopEntries(db), rank: rankRow?.rank ?? null }, 201);
  } catch (error) {
    return routeError(request, error);
  }
}

async function analytics(request: Request, db: D1Database) {
  try {
    if (request.method === "GET") {
      const [players, sessions, shares, channels, daily] = await Promise.all([
        db.prepare("SELECT COUNT(DISTINCT player_id) AS total FROM game_sessions").first<{ total: number }>(),
        db.prepare("SELECT COUNT(*) AS total FROM game_sessions").first<{ total: number }>(),
        db.prepare("SELECT COUNT(*) AS total FROM share_events").first<{ total: number }>(),
        db.prepare("SELECT channel, COUNT(*) AS count FROM share_events GROUP BY channel ORDER BY count DESC, channel ASC").all<{ channel: string; count: number }>(),
        db.prepare(`
          WITH days AS (
            SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS sessions, 0 AS shares
            FROM game_sessions WHERE started_at >= datetime('now', '-13 days') GROUP BY day
            UNION ALL
            SELECT substr(created_at, 1, 10) AS day, 0 AS sessions, COUNT(*) AS shares
            FROM share_events WHERE created_at >= datetime('now', '-13 days') GROUP BY day
          ) SELECT day, SUM(sessions) AS sessions, SUM(shares) AS shares
          FROM days GROUP BY day ORDER BY day ASC
        `).all<{ day: string; sessions: number; shares: number }>(),
      ]);
      return json(request, {
        totalPlayers: Number(players?.total ?? 0),
        totalSessions: Number(sessions?.total ?? 0),
        totalShares: Number(shares?.total ?? 0),
        channels: channels.results ?? [],
        daily: daily.results ?? [],
        updatedAt: new Date().toISOString(),
      });
    }

    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    const payload = (await request.json()) as AnalyticsPayload;
    const playerId = readId(payload.playerId);
    if (!playerId) return json(request, { error: "埋点数据无效。" }, 400);
    if (payload.eventType === "game_start") {
      const sessionId = readId(payload.sessionId);
      if (!sessionId) return json(request, { error: "场次数据无效。" }, 400);
      await db.prepare("INSERT OR IGNORE INTO game_sessions (session_id, player_id, source_channel) VALUES (?, ?, ?)")
        .bind(sessionId, playerId, readLabel(payload.sourceChannel, "direct")).run();
      return json(request, { ok: true }, 201);
    }
    if (payload.eventType === "share") {
      const eventId = readId(payload.eventId);
      if (!eventId) return json(request, { error: "转发数据无效。" }, 400);
      await db.prepare("INSERT OR IGNORE INTO share_events (event_id, player_id, channel) VALUES (?, ?, ?)")
        .bind(eventId, playerId, readLabel(payload.channel, "other")).run();
      return json(request, { ok: true }, 201);
    }
    return json(request, { error: "不支持的埋点类型。" }, 400);
  } catch (error) {
    return routeError(request, error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/health") return json(request, { ok: true, service: "doubao-dance-api" });
    if (url.pathname === "/api/leaderboard") return leaderboard(request, env.DB);
    if (url.pathname === "/api/analytics") return analytics(request, env.DB);
    return json(request, { error: "Not found" }, 404);
  },
};
