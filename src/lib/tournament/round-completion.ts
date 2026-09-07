/**
 * Pure round-completion logic for a championship round.
 *
 * Rule: a round is COMPLETE only when every ACTIVE championship
 * participant has a complete, submitted scorecard for that round.
 * WITHDRAWN and DISQUALIFIED participants must never block completion.
 *
 * We have not built hole-by-hole scoring yet, so this is deliberately
 * designed around a small abstraction (`ScorecardCompletionLookup`)
 * rather than querying any real scores table. A future scoring phase
 * only needs to provide a real implementation of that lookup — this
 * pure decision function itself never needs to change.
 */

export type ParticipantStatus = "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";

export type RoundParticipant = {
  championshipPlayerId: string;
  participantStatus: ParticipantStatus;
};

/**
 * Answers "does this championship player have a complete, submitted
 * 18-hole scorecard for this round?". Implemented for real once
 * hole-by-hole scoring exists; for now this is just an interface a
 * caller must satisfy (e.g. a simple in-memory Set/Map in tests).
 */
export type ScorecardCompletionLookup = (
  championshipPlayerId: string
) => boolean;

export type RoundCompletionResult = {
  isComplete: boolean;
  /** Active participants who still lack a complete scorecard. */
  outstandingParticipantIds: string[];
};

/**
 * Determines whether a round is complete per the rule above.
 * Pure function — no DB/framework imports.
 */
export function evaluateRoundCompletion(
  participants: RoundParticipant[],
  hasCompleteScorecard: ScorecardCompletionLookup
): RoundCompletionResult {
  const activeParticipants = participants.filter(
    (p) => p.participantStatus === "ACTIVE"
  );

  const outstandingParticipantIds = activeParticipants
    .filter((p) => !hasCompleteScorecard(p.championshipPlayerId))
    .map((p) => p.championshipPlayerId);

  return {
    isComplete: outstandingParticipantIds.length === 0,
    outstandingParticipantIds,
  };
}
