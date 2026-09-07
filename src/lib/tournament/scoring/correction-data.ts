import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championshipRoundHoles,
  holeScores,
  scorecardSubmissions,
  scoreAuditLog,
  members,
} from "@/db/schema";

export type CorrectionHoleRow = {
  holeNumber: number;
  par: number | null;
  holeScoreId: string;
  grossScore: number;
};

export type CorrectionScorecardResult =
  | { state: "not-submitted" }
  | {
      state: "found";
      holes: CorrectionHoleRow[];
      grossTotal: number;
    };

/**
 * Read-only lookup of one player's SUBMITTED 18-hole scorecard for one
 * round, for the admin corrections UI. Never creates missing
 * `hole_scores`/`scorecard_submissions` rows — if the player has not
 * submitted for this round, returns `not-submitted`.
 */
export async function getSubmittedScorecardForCorrection(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
}): Promise<CorrectionScorecardResult> {
  const { championshipRoundId, championshipPlayerId } = params;

  const [submission] = await db
    .select({ grossTotal: scorecardSubmissions.grossTotal })
    .from(scorecardSubmissions)
    .where(
      and(
        eq(scorecardSubmissions.championshipRoundId, championshipRoundId),
        eq(scorecardSubmissions.championshipPlayerId, championshipPlayerId)
      )
    )
    .limit(1);

  if (!submission) {
    return { state: "not-submitted" };
  }

  const [scores, holeParRows] = await Promise.all([
    db
      .select({
        id: holeScores.id,
        holeNumber: holeScores.holeNumber,
        grossScore: holeScores.grossScore,
      })
      .from(holeScores)
      .where(
        and(
          eq(holeScores.championshipRoundId, championshipRoundId),
          eq(holeScores.championshipPlayerId, championshipPlayerId)
        )
      )
      .orderBy(asc(holeScores.holeNumber)),
    db
      .select({
        holeNumber: championshipRoundHoles.holeNumber,
        par: championshipRoundHoles.par,
      })
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId)),
  ]);

  const parByHole = new Map(holeParRows.map((h) => [h.holeNumber, h.par]));

  return {
    state: "found",
    holes: scores.map((s) => ({
      holeNumber: s.holeNumber,
      par: parByHole.get(s.holeNumber) ?? null,
      holeScoreId: s.id,
      grossScore: s.grossScore,
    })),
    grossTotal: submission.grossTotal,
  };
}

export type CorrectionAuditRow = {
  id: string;
  holeNumber: number;
  originalGrossScore: number;
  newGrossScore: number;
  reason: string | null;
  changedByDisplayName: string;
  changedAt: string;
};

/**
 * Read-only, most-recent-first correction history for one player/round,
 * from the existing append-only `score_audit_log`. Not a global
 * audit-reporting view — scoped to a single player/round for display
 * directly under that player's corrections scorecard.
 */
export async function listRecentCorrections(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
  limit?: number;
}): Promise<CorrectionAuditRow[]> {
  const { championshipRoundId, championshipPlayerId, limit = 20 } = params;

  const rows = await db
    .select({
      id: scoreAuditLog.id,
      holeNumber: scoreAuditLog.holeNumber,
      originalGrossScore: scoreAuditLog.originalGrossScore,
      newGrossScore: scoreAuditLog.newGrossScore,
      reason: scoreAuditLog.reason,
      changedByDisplayName: members.displayName,
      changedAt: scoreAuditLog.changedAt,
    })
    .from(scoreAuditLog)
    .innerJoin(members, eq(members.id, scoreAuditLog.changedByMemberId))
    .where(
      and(
        eq(scoreAuditLog.championshipRoundId, championshipRoundId),
        eq(scoreAuditLog.championshipPlayerId, championshipPlayerId)
      )
    )
    .orderBy(desc(scoreAuditLog.changedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    changedAt: r.changedAt.toISOString(),
  }));
}
