import { describe, expect, it } from "vitest";
import { evaluateScorecardCompleteness } from "./completeness";

describe("evaluateScorecardCompleteness", () => {
  it("is complete with exactly holes 1-18 present", () => {
    const entries = Array.from({ length: 18 }, (_, i) => ({
      holeNumber: i + 1,
      grossScore: 4,
    }));
    const result = evaluateScorecardCompleteness(entries);
    expect(result.isComplete).toBe(true);
    expect(result.missingHoles).toEqual([]);
    expect(result.grossTotal).toBe(72);
  });

  it("is incomplete when a hole is missing", () => {
    const entries = Array.from({ length: 17 }, (_, i) => ({
      holeNumber: i + 1,
      grossScore: 4,
    }));
    const result = evaluateScorecardCompleteness(entries);
    expect(result.isComplete).toBe(false);
    expect(result.missingHoles).toEqual([18]);
    expect(result.grossTotal).toBeNull();
  });

  it("ignores duplicate/invalid entries", () => {
    const entries = [
      { holeNumber: 1, grossScore: 4 },
      { holeNumber: 1, grossScore: 99 }, // invalid, ignored due to range check
      { holeNumber: 19, grossScore: 4 }, // invalid hole number, ignored
    ];
    const result = evaluateScorecardCompleteness(entries);
    expect(result.isComplete).toBe(false);
  });
});
