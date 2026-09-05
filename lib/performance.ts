export type PerformanceRating = "E" | "M+" | "M" | "M-" | "I";

export const PERFORMANCE_BANDS = [
  { rating: "I", scoreMin: 0, scoreMax: 1_799, peakMin: 0 },
  { rating: "M-", scoreMin: 1_800, scoreMax: 3_499, peakMin: null },
  { rating: "M", scoreMin: 3_500, scoreMax: 4_999, peakMin: 1 },
  { rating: "M+", scoreMin: 5_000, scoreMax: 6_499, peakMin: 2 },
  { rating: "E", scoreMin: 6_500, scoreMax: Number.POSITIVE_INFINITY, peakMin: 3 },
] as const satisfies ReadonlyArray<{
  rating: PerformanceRating;
  scoreMin: number;
  scoreMax: number;
  peakMin: number | null;
}>;

export function getPerformanceRating(score: number, peaks = 0): PerformanceRating {
  if (score >= 6_500 || peaks >= 3) return "E";
  if (score >= 5_000 || peaks >= 2) return "M+";
  if (score >= 3_500 || peaks >= 1) return "M";
  if (score >= 1_800) return "M-";
  return "I";
}

export function getPerformanceSummary(score: number, peaks = 0) {
  const rating = getPerformanceRating(score, peaks);
  if (rating === "E") return "年度超额交付，节子范儿拉满";
  if (rating === "M+") return "高效对齐，持续拿结果";
  if (rating === "M") return "关键路径跑通，组织效能稳定";
  if (rating === "M-") return "核心目标基本达成";
  return "年度目标仍在对齐中";
}
