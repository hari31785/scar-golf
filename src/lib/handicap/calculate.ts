/**
 * Pure SCAR handicap calculation engine.
 *
 * Deliberately has NO database/framework imports of any kind — it takes
 * plain in-memory round data in and returns a plain result out. This
 * makes it trivially unit-testable and, just as importantly, makes it
 * architecturally impossible for this module to ever persist a padding
 * round as a real played round (see src/db/schema/rounds.ts): there is
 * no `db`/`drizzle-orm` import here to persist anything with. This
 * guarantee is itself enforced by an automated test — see
 * calculate.test.ts.
 *
 * Formula (per SCAR's rules):
 *
 *   differential = (grossScore - courseRating) * 113 / slope
 *
 * For each player:
 *   1. Take the most recent 20 ACTUAL rounds by played date.
 *   2. If fewer than 20 actual rounds exist, pad the calculation (ONLY
 *      the calculation — never storage) by duplicating that player's
 *      single highest-gross historical round, reusing its original
 *      course rating and slope, until there are 20 calculation rounds.
 *   3. Compute a differential for each of the 20 calculation rounds.
 *   4. Select the lowest 8 differentials and average them.
 *   5. Round the average UP to the next whole integer (ties like 12.00
 *      stay 12; anything above an integer, e.g. 11.01, rounds up to 12).
 *   6. Cap at a configurable maximum handicap (default 18).
 *
 * A player with zero historical rounds gets handicap 0 (new associate
 * members), without ever invoking the padding logic.
 */

export type ActualRound = {
  /** Identifies the source round — opaque to this module. */
  id: string;
  playedAt: Date;
  grossScore: number;
  courseRating: number;
  slope: number;
};

/**
 * One of the (always exactly 20, unless zero actual rounds exist) rounds
 * actually used in a calculation — either a real actual round or a
 * calculation-only clone of the player's highest-gross round.
 */
export type CalculationRound = ActualRound & {
  isPadding: boolean;
  /** Set only when `isPadding` is true: the id of the round it clones. */
  paddingSourceRoundId?: string;
};

export type DifferentialEntry = {
  round: CalculationRound;
  differential: number;
};

export type HandicapCalculationResult = {
  /** The (up to 20) most-recent actual rounds selected by played date. */
  actualRoundsUsed: ActualRound[];
  /** Calculation-only clones added to reach 20 total, if any. */
  paddingRoundsAdded: CalculationRound[];
  /** Differential for every one of the (up to 20) calculation rounds. */
  differentials: DifferentialEntry[];
  /** The 8 lowest differentials, ascending, that were averaged. */
  selectedLowest8: DifferentialEntry[];
  /** Unrounded average of the lowest 8 differentials. */
  rawAverageLowest8: number;
  /** `rawAverageLowest8` rounded up to the next whole integer, before cap. */
  roundedHandicap: number;
  /** The configured maximum handicap this calculation was capped at. */
  maxHandicap: number;
  /** The final handicap: `min(roundedHandicap, maxHandicap)`. */
  finalHandicap: number;
};

export const DEFAULT_MAX_HANDICAP = 18;
const ROUNDS_NEEDED = 20;
const LOWEST_COUNT = 8;
const USGA_CONSTANT = 113;

/** `(grossScore - courseRating) * 113 / slope`. */
export function computeDifferential(round: {
  grossScore: number;
  courseRating: number;
  slope: number;
}): number {
  return ((round.grossScore - round.courseRating) * USGA_CONSTANT) / round.slope;
}

/**
 * Rounds UP to the next whole integer, treating floating-point noise
 * (e.g. a division that should land on exactly 12.0 but computes as
 * 11.999999999999998) as if it were the clean value.
 *
 *   11.01 -> 12
 *   11.99 -> 12
 *   12.00 -> 12
 */
export function roundUpToInt(value: number): number {
  const cleaned = Math.round(value * 1e6) / 1e6;
  return Math.ceil(cleaned);
}

function zeroResult(maxHandicap: number): HandicapCalculationResult {
  return {
    actualRoundsUsed: [],
    paddingRoundsAdded: [],
    differentials: [],
    selectedLowest8: [],
    rawAverageLowest8: 0,
    roundedHandicap: 0,
    maxHandicap,
    finalHandicap: 0,
  };
}

export function calculateHandicap(
  actualRoundsInput: readonly ActualRound[],
  options?: { maxHandicap?: number }
): HandicapCalculationResult {
  const maxHandicap = options?.maxHandicap ?? DEFAULT_MAX_HANDICAP;

  // New associate members with no prior SCAR rounds start at handicap 0 —
  // no padding logic ever runs for them.
  if (actualRoundsInput.length === 0) {
    return zeroResult(maxHandicap);
  }

  const sortedByDateDesc = [...actualRoundsInput].sort(
    (a, b) => b.playedAt.getTime() - a.playedAt.getTime()
  );
  const actualRoundsUsed = sortedByDateDesc.slice(0, ROUNDS_NEEDED);

  const paddingNeeded = Math.max(0, ROUNDS_NEEDED - actualRoundsUsed.length);

  let paddingRoundsAdded: CalculationRound[] = [];
  if (paddingNeeded > 0) {
    // Highest-gross round among ALL of this player's actual rounds. With
    // fewer than 20 total rounds this is the same set as
    // `actualRoundsUsed`, but computed explicitly against the full input
    // regardless, per the spec.
    const highestGrossRound = [...actualRoundsInput].sort(
      (a, b) => b.grossScore - a.grossScore
    )[0];

    paddingRoundsAdded = Array.from({ length: paddingNeeded }, () => ({
      ...highestGrossRound,
      isPadding: true,
      paddingSourceRoundId: highestGrossRound.id,
    }));
  }

  const calculationRounds: CalculationRound[] = [
    ...actualRoundsUsed.map((round) => ({ ...round, isPadding: false })),
    ...paddingRoundsAdded,
  ];

  const differentials: DifferentialEntry[] = calculationRounds.map(
    (round) => ({
      round,
      differential: computeDifferential(round),
    })
  );

  const sortedByDifferentialAsc = [...differentials].sort(
    (a, b) => a.differential - b.differential
  );
  const selectedLowest8 = sortedByDifferentialAsc.slice(0, LOWEST_COUNT);

  const rawAverageLowest8 =
    selectedLowest8.reduce((sum, entry) => sum + entry.differential, 0) /
    selectedLowest8.length;

  const roundedHandicap = roundUpToInt(rawAverageLowest8);
  const finalHandicap = Math.min(roundedHandicap, maxHandicap);

  return {
    actualRoundsUsed,
    paddingRoundsAdded,
    differentials,
    selectedLowest8,
    rawAverageLowest8,
    roundedHandicap,
    maxHandicap,
    finalHandicap,
  };
}
