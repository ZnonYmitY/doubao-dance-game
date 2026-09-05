export const PUBLIC_API_BASE = "https://doubao-dance-api.znonymity-piasnews.workers.dev";
export const PUBLIC_GAME_URL = "https://znonymity.github.io/doubao-dance-game/";

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  peaks: number;
  adjustments: number;
  dances: number;
  rating: string;
};

export type AnalyticsSummary = {
  totalPlayers: number;
  totalSessions: number;
  totalShares: number;
  channels: Array<{ channel: string; count: number }>;
  daily: Array<{ day: string; sessions: number; shares: number }>;
  updatedAt: string;
};

export function apiUrl(path: string) {
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return path;
  return `${PUBLIC_API_BASE}${path}`;
}
