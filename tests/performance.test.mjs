import assert from "node:assert/strict";
import test from "node:test";
import { getPerformanceRating } from "../lib/performance.ts";

test("uses the requested score performance bands", () => {
  const cases = [
    [0, "I"],
    [2_999, "I"],
    [3_000, "M-"],
    [3_999, "M-"],
    [4_000, "M"],
    [4_999, "M"],
    [5_000, "M+"],
    [5_999, "M+"],
    [6_000, "E"],
  ];

  for (const [score, rating] of cases) assert.equal(getPerformanceRating(score, 1), rating);
});

test("requires a peak outside the peak-count overrides", () => {
  assert.equal(getPerformanceRating(6_000, 0), "I");
  assert.equal(getPerformanceRating(2_999, 1), "I");
  assert.equal(getPerformanceRating(3_000, 1), "M-");
  assert.equal(getPerformanceRating(4_000, 1), "M");
});

test("uses two and three peaks as minimum performance overrides", () => {
  assert.equal(getPerformanceRating(1_800, 2), "M+");
  assert.equal(getPerformanceRating(0, 3), "E");
  assert.equal(getPerformanceRating(6_000, 2), "E");
});
