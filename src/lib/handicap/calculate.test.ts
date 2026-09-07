import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  calculateHandicap,
  computeDifferential,
  roundUpToInt,
  DEFAULT_MAX_HANDICAP,
  type ActualRound,
} from "@/lib/handicap/calculate";

/** Builds a round with sane defaults, overridable per-test. */
function round(overrides: Partial<ActualRound> & { id: string }): ActualRound {
  return {
    playedAt: new Date("2024-01-01"),
    grossScore: 90,
    courseRating: 71.4,
    slope: 113,
    ...overrides,
  };
}

/** N rounds, with higher index = more recently played (index 0 is oldest). */
function makeRounds(
  count: number,
  factory: (i: number) => Partial<ActualRound> = () => ({})
): ActualRound[] {
  return Array.from({ length: count }, (_, i) => {
    const playedAt = new Date(2024, 0, i + 1); // day 1, 2, 3, ... => ascending recency
    return round({
      id: `r${i}`,
      playedAt,
      ...factory(i),
    });
  });
}

describe("computeDifferential", () => {
  it("applies (gross - rating) * 113 / slope", () => {
    expect(computeDifferential({ grossScore: 90, courseRating: 71.4, slope: 113 })).toBeCloseTo(
      18.6,
      5
    );
    expect(computeDifferential({ grossScore: 100, courseRating: 72, slope: 130 })).toBeCloseTo(
      ((100 - 72) * 113) / 130,
      10
    );
  });
});

describe("roundUpToInt", () => {
  it("11.01 -> 12", () => {
    expect(roundUpToInt(11.01)).toBe(12);
  });
  it("11.99 -> 12", () => {
    expect(roundUpToInt(11.99)).toBe(12);
  });
  it("12.00 -> 12", () => {
    expect(roundUpToInt(12.0)).toBe(12);
  });
  it("handles floating-point noise landing just under a whole number", () => {
    // 36 / 3 in floating point can produce 11.999999999999998
    expect(roundUpToInt(11.999999999999998)).toBe(12);
  });
  it("does not bump a clean integer up further", () => {
    expect(roundUpToInt(10.0)).toBe(10);
  });
});

describe("calculateHandicap", () => {
  it("H: no historical rounds -> handicap 0, no padding", () => {
    const result = calculateHandicap([]);
    expect(result.finalHandicap).toBe(0);
    expect(result.actualRoundsUsed).toHaveLength(0);
    expect(result.paddingRoundsAdded).toHaveLength(0);
  });

  it("A: exactly 20 rounds uses all 20, no padding", () => {
    const rounds = makeRounds(20, (i) => ({ grossScore: 80 + i }));
    const result = calculateHandicap(rounds);
    expect(result.actualRoundsUsed).toHaveLength(20);
    expect(result.paddingRoundsAdded).toHaveLength(0);
    expect(result.differentials).toHaveLength(20);
  });

  it("B: more than 20 rounds uses the newest 20 by played date", () => {
    // 25 rounds, ids r0..r24, with r24 the most recent (see makeRounds).
    const rounds = makeRounds(25);
    const result = calculateHandicap(rounds);
    expect(result.actualRoundsUsed).toHaveLength(20);
    expect(result.paddingRoundsAdded).toHaveLength(0);

    // The 5 oldest (r0..r4) must be excluded; the 20 newest (r5..r24) used.
    const usedIds = new Set(result.actualRoundsUsed.map((r) => r.id));
    expect(usedIds.has("r0")).toBe(false);
    expect(usedIds.has("r4")).toBe(false);
    expect(usedIds.has("r24")).toBe(true);
    expect(usedIds.has("r5")).toBe(true);
    expect(usedIds.size).toBe(20);
  });

  it("C: fewer than 20 rounds pads with the highest-gross round", () => {
    const rounds = [
      round({ id: "low", grossScore: 80, playedAt: new Date("2024-01-01") }),
      round({ id: "high", grossScore: 110, playedAt: new Date("2024-01-02") }),
      round({ id: "mid", grossScore: 95, playedAt: new Date("2024-01-03") }),
    ];
    const result = calculateHandicap(rounds);

    expect(result.actualRoundsUsed).toHaveLength(3);
    expect(result.paddingRoundsAdded).toHaveLength(17);
    expect(result.differentials).toHaveLength(20);

    for (const padded of result.paddingRoundsAdded) {
      expect(padded.isPadding).toBe(true);
      expect(padded.paddingSourceRoundId).toBe("high");
      expect(padded.grossScore).toBe(110);
    }
  });

  it("D: padding copies the source round's course rating and slope", () => {
    const rounds = [
      round({
        id: "high",
        grossScore: 120,
        courseRating: 74.2,
        slope: 135,
        playedAt: new Date("2024-01-01"),
      }),
      round({
        id: "low",
        grossScore: 85,
        courseRating: 69.0,
        slope: 110,
        playedAt: new Date("2024-01-02"),
      }),
    ];
    const result = calculateHandicap(rounds);

    expect(result.paddingRoundsAdded).toHaveLength(18);
    for (const padded of result.paddingRoundsAdded) {
      expect(padded.courseRating).toBe(74.2);
      expect(padded.slope).toBe(135);
    }
  });

  it("E: selects the lowest 8 differentials and averages them", () => {
    // 20 rounds with clearly increasing gross scores -> increasing
    // differentials. The lowest 8 differentials must be the 8 lowest
    // gross-score rounds.
    const rounds = makeRounds(20, (i) => ({ grossScore: 80 + i }));
    const result = calculateHandicap(rounds);

    const sortedDiffs = [...result.differentials].sort(
      (a, b) => a.differential - b.differential
    );
    const expectedLowest8 = sortedDiffs.slice(0, 8);

    expect(result.selectedLowest8.map((e) => e.round.id).sort()).toEqual(
      expectedLowest8.map((e) => e.round.id).sort()
    );

    const expectedAvg =
      expectedLowest8.reduce((sum, e) => sum + e.differential, 0) / 8;
    expect(result.rawAverageLowest8).toBeCloseTo(expectedAvg, 10);
  });

  it("F: rounds the final average up (11.01 / 11.99 / 12.00 all -> 12)", () => {
    // Construct 20 identical rounds whose differential is exactly some
    // target value, so the average of the lowest 8 equals that value
    // exactly, then confirm the rounding-up behavior end-to-end.
    function resultForDifferential(targetDifferential: number) {
      // differential = (gross - rating) * 113 / slope
      // Fix rating=0, slope=113 => differential = gross exactly.
      const rounds = makeRounds(20, () => ({
        grossScore: targetDifferential,
        courseRating: 0,
        slope: 113,
      }));
      return calculateHandicap(rounds, { maxHandicap: 999 });
    }

    expect(resultForDifferential(11.01).finalHandicap).toBe(12);
    expect(resultForDifferential(11.99).finalHandicap).toBe(12);
    expect(resultForDifferential(12.0).finalHandicap).toBe(12);
  });

  it("G: caps the handicap at the configured maximum (default 18)", () => {
    // Very high gross scores -> a raw handicap far above 18.
    const rounds = makeRounds(20, () => ({
      grossScore: 150,
      courseRating: 71.4,
      slope: 113,
    }));
    const result = calculateHandicap(rounds);
    expect(result.maxHandicap).toBe(DEFAULT_MAX_HANDICAP);
    expect(result.roundedHandicap).toBeGreaterThan(18);
    expect(result.finalHandicap).toBe(18);
  });

  it("G: respects a custom configured maximum", () => {
    const rounds = makeRounds(20, () => ({
      grossScore: 150,
      courseRating: 71.4,
      slope: 113,
    }));
    const result = calculateHandicap(rounds, { maxHandicap: 10 });
    expect(result.finalHandicap).toBe(10);
  });

  it("I: never returns padding rounds as part of actualRoundsUsed", () => {
    const rounds = [round({ id: "only", grossScore: 100 })];
    const result = calculateHandicap(rounds);
    expect(result.actualRoundsUsed).toHaveLength(1);
    expect(result.actualRoundsUsed[0].id).toBe("only");
    expect(result.paddingRoundsAdded.every((r) => r.isPadding)).toBe(true);
    // Structural guarantee: this module has no ability to write to the
    // database at all (see next test), so padding can never leak into
    // `played_rounds` regardless of what the caller does with the result.
  });

  it("I: the calculation engine has no database imports (padding can never be persisted)", () => {
    const sourcePath = fileURLToPath(
      new URL("./calculate.ts", import.meta.url)
    );
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toMatch(/from\s+["']@\/db|from\s+["']drizzle-orm/);
  });
});
