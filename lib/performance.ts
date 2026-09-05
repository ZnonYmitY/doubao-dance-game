export type PerformanceRating = "E" | "M+" | "M" | "M-" | "I";

export const PERFORMANCE_BANDS = [
  { rating: "I", scoreMin: 0, scoreMax: 2_999, peakMin: null },
  { rating: "M-", scoreMin: 3_000, scoreMax: 3_999, peakMin: 1 },
  { rating: "M", scoreMin: 4_000, scoreMax: 4_999, peakMin: 1 },
  { rating: "M+", scoreMin: 5_000, scoreMax: 5_999, peakMin: 2 },
  { rating: "E", scoreMin: 6_000, scoreMax: Number.POSITIVE_INFINITY, peakMin: 3 },
] as const satisfies ReadonlyArray<{
  rating: PerformanceRating;
  scoreMin: number;
  scoreMax: number;
  peakMin: number | null;
}>;

export function getPerformanceRating(score: number, peaks = 0): PerformanceRating {
  if (peaks >= 3 || (peaks > 0 && score >= 6_000)) return "E";
  if (peaks >= 2 || (peaks > 0 && score >= 5_000)) return "M+";
  if (peaks === 0 || score < 3_000) return "I";
  if (score >= 4_000) return "M";
  return "M-";
}

export function getPerformanceSummary(score: number, peaks = 0) {
  const rating = getPerformanceRating(score, peaks);
  if (rating === "E") return "年度超额交付，字节范儿拉满";
  if (rating === "M+") return "高效对齐，持续拿结果";
  if (rating === "M") return "关键路径跑通，组织效能稳定";
  if (rating === "M-") return "核心目标基本达成";
  return "年度目标仍在对齐中";
}
