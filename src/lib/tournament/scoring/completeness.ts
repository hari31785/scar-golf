/**
 * Pure scorecard-completeness logic. No DB/framework imports.
 *
 * A championship player's scorecard for a round is "complete" when they
 * have exactly one valid gross score recorded for each of holes 1-18.
 */

export type HoleScoreEntry = {
  holeNumber: number;
  grossScore: number;
};

const MIN_HOLE = 1;
const MAX_HOLE = 18;
const MIN_GROSS_SCORE = 1;
const MAX_GROSS_SCORE = 20;

export function isValidHoleNumber(holeNumber: number): boolean {
  return (
    Number.isInteger(holeNumber) &&
    holeNumber >= MIN_HOLE &&
    holeNumber <= MAX_HOLE
  );
}

export function isValidGrossScore(grossScore: number): boolean {
  return (
    Number.isInteger(grossScore) &&
    grossScore >= MIN_GROSS_SCORE &&
    grossScore <= MAX_GROSS_SCORE
  );
}

export type ScorecardCompletenessResult = {
  isComplete: boolean;
  /** Holes 1-18 that are missing a recorded score. */
  missingHoles: number[];
  /** Sum of all 18 gross scores — only meaningful when isComplete is true. */
  grossTotal: number | null;
};

/**
 * Given the set of hole scores currently recorded for one championship
 * player/round, determines whether the scorecard is complete: exactly
 * holes 1-18 present, each with a valid gross score.
 */
export function evaluateScorecardCompleteness(
  entries: HoleScoreEntry[]
): ScorecardCompletenessResult {
  const byHole = new Map<number, number>();
  for (const entry of entries) {
    if (isValidHoleNumber(entry.holeNumber) && isValidGrossScore(entry.grossScore)) {
      byHole.set(entry.holeNumber, entry.grossScore);
    }
  }

  const missingHoles: number[] = [];
  let grossTotal = 0;
  for (let hole = MIN_HOLE; hole <= MAX_HOLE; hole++) {
    const score = byHole.get(hole);
    if (score === undefined) {
      missingHoles.push(hole);
    } else {
      grossTotal += score;
    }
  }

  const isComplete = missingHoles.length === 0;
  return {
    isComplete,
    missingHoles,
    grossTotal: isComplete ? grossTotal : null,
  };
}
