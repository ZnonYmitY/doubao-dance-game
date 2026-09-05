import assert from "node:assert/strict";
import test from "node:test";
import { getPerformanceRating } from "../lib/performance.ts";

test("uses strict score-only performance bands", () => {
  const cases = [
    [0, "I"],
    [1_799, "I"],
    [1_800, "M-"],
    [3_799, "M-"],
    [3_800, "M"],
    [5_999, "M"],
    [6_000, "M+"],
    [8_999, "M+"],
    [9_000, "E"],
  ];

  for (const [score, rating] of cases) assert.equal(getPerformanceRating(score), rating);
});
