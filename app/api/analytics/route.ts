import { getD1 } from "@/db";

type AnalyticsPayload = {
  eventId?: unknown;
  eventType?: unknown;
  playerId?: unknown;
  sessionId?: unknown;
  channel?: unknown;
  sourceChannel?: unknown;
};

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function readId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(value) ? value : null;
}

function readLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(normalized) ? normalized : fallback;
}

async function readSummary(db: D1Database) {
  const [players, sessions, shares, channels, daily] = await Promise.all([
    db.prepare("SELECT COUNT(DISTINCT player_id) AS total FROM game_sessions").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM game_sessions").first<{ total: number }>(),
    db.prepare("SELECT COUNT(*) AS total FROM share_events").first<{ total: number }>(),
    db.prepare(`
      SELECT channel, COUNT(*) AS count
      FROM share_events
      GROUP BY channel
      ORDER BY count DESC, channel ASC
    `).all<{ channel: string; count: number }>(),
    db.prepare(`
      WITH days AS (
        SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS sessions, 0 AS shares
        FROM game_sessions
        WHERE started_at >= datetime('now', '-13 days')
        GROUP BY day
        UNION ALL
        SELECT substr(created_at, 1, 10) AS day, 0 AS sessions, COUNT(*) AS shares
        FROM share_events
        WHERE created_at >= datetime('now', '-13 days')
        GROUP BY day
      )
      SELECT day, SUM(sessions) AS sessions, SUM(shares) AS shares
      FROM days
      GROUP BY day
      ORDER BY day ASC
    `).all<{ day: string; sessions: number; shares: number }>(),
  ]);

  return {
    totalPlayers: Number(players?.total ?? 0),
    totalSessions: Number(sessions?.total ?? 0),
    totalShares: Number(shares?.total ?? 0),
    channels: (channels.results ?? []).map((row) => ({ channel: row.channel, count: Number(row.count) })),
    daily: (daily.results ?? []).map((row) => ({ day: row.day, sessions: Number(row.sessions), shares: Number(row.shares) })),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    return json(await readSummary(getD1()));
  } catch {
    return json({ error: "数据看板暂时不可用，请稍后再试。" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AnalyticsPayload;
    const playerId = readId(payload.playerId);
    if (!playerId) return json({ error: "埋点数据无效。" }, 400);
    const db = getD1();

    if (payload.eventType === "game_start") {
      const sessionId = readId(payload.sessionId);
      if (!sessionId) return json({ error: "场次数据无效。" }, 400);
      await db.prepare(`
        INSERT OR IGNORE INTO game_sessions (session_id, player_id, source_channel)
        VALUES (?, ?, ?)
      `).bind(sessionId, playerId, readLabel(payload.sourceChannel, "direct")).run();
      return json({ ok: true }, 201);
    }

    if (payload.eventType === "share") {
      const eventId = readId(payload.eventId);
      if (!eventId) return json({ error: "转发数据无效。" }, 400);
      await db.prepare(`
        INSERT OR IGNORE INTO share_events (event_id, player_id, channel)
        VALUES (?, ?, ?)
      `).bind(eventId, playerId, readLabel(payload.channel, "other")).run();
      return json({ ok: true }, 201);
    }

    return json({ error: "不支持的埋点类型。" }, 400);
  } catch {
    return json({ error: "埋点暂时不可用，请稍后再试。" }, 500);
  }
}
