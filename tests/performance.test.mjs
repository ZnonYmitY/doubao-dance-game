import assert from "node:assert/strict";
import test from "node:test";
import { getPerformanceRating } from "../lib/performance.ts";

test("uses the requested score performance bands", () => {
  const cases = [
    [0, "I"],
    [1_799, "I"],
    [1_800, "M-"],
    [3_499, "M-"],
    [3_500, "M"],
    [4_999, "M"],
    [5_000, "M+"],
    [6_499, "M+"],
    [6_500, "E"],
  ];

  for (const [score, rating] of cases) assert.equal(getPerformanceRating(score, 0), rating);
});

test("uses one, two, and three peaks as minimum performance overrides", () => {
  assert.equal(getPerformanceRating(0, 1), "M");
  assert.equal(getPerformanceRating(3_499, 1), "M");
  assert.equal(getPerformanceRating(0, 2), "M+");
  assert.equal(getPerformanceRating(4_999, 2), "M+");
  assert.equal(getPerformanceRating(0, 3), "E");
  assert.equal(getPerformanceRating(6_499, 3), "E");
});
