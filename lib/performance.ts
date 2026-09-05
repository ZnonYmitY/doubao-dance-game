export type PerformanceRating = "E" | "M+" | "M" | "M-" | "I";

export const PERFORMANCE_BANDS = [
  { rating: "I", min: 0, max: 1_799 },
  { rating: "M-", min: 1_800, max: 3_799 },
  { rating: "M", min: 3_800, max: 5_999 },
  { rating: "M+", min: 6_000, max: 8_999 },
  { rating: "E", min: 9_000, max: Number.POSITIVE_INFINITY },
] as const satisfies ReadonlyArray<{ rating: PerformanceRating; min: number; max: number }>;

export function getPerformanceRating(score: number): PerformanceRating {
  if (score >= 9_000) return "E";
  if (score >= 6_000) return "M+";
  if (score >= 3_800) return "M";
  if (score >= 1_800) return "M-";
  return "I";
}

export function getPerformanceSummary(score: number) {
  const rating = getPerformanceRating(score);
  if (rating === "E") return "年度超额交付，字节范儿拉满";
  if (rating === "M+") return "高效对齐，持续拿结果";
  if (rating === "M") return "关键路径跑通，组织效能稳定";
  if (rating === "M-") return "核心目标基本达成";
  return "年度目标仍在对齐中";
}
