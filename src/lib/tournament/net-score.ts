/**
 * Pure cumulative NET scoring helper for SCAR championships.
 *
 * Formula:
 *   Cumulative Net = Cumulative Gross - (Frozen Handicap × Completed Rounds)
 *
 * Always uses the participant's FROZEN handicap
 * (`championship_players.frozenHandicap`) — never their live/current
 * handicap — since the frozen value is set once at championship start
 * and must remain constant across all 4 rounds (see
 * src/lib/tournament/start.ts).
 *
 * This is the single canonical implementation intended for later use by
 * both the leaderboard and the net-standings-based pairing generator
 * for Rounds 2-4 — no other code should reimplement this formula.
 */

export type CumulativeNetInput = {
  /** Sum of gross scores across all completed rounds so far. */
  cumulativeGross: number;
  /** The participant's frozen tournament handicap. */
  frozenHandicap: number;
  /** Number of rounds completed so far (1-4). */
  completedRounds: number;
};

export function calculateCumulativeNet(input: CumulativeNetInput): number {
  const { cumulativeGross, frozenHandicap, completedRounds } = input;
  return cumulativeGross - frozenHandicap * completedRounds;
}
