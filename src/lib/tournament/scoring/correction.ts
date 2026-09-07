import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  holeScores,
  scoreAuditLog,
  scorecardSubmissions,
  championshipPlayers,
  members,
} from "@/db/schema";
import { isValidGrossScore } from "./completeness";
import { upsertChampionshipPlayedRound } from "./championship-played-rounds";

export class CorrectionAuthorizationError extends Error {}

/**
 * ADMIN-only correction of an already-recorded (possibly already
 * submitted) hole score.
 *
 * Requirements enforced here:
 *  - actingMemberId must have appRole === "ADMIN",
 *  - the existing `hole_scores` row must exist and be validated,
 *  - the ORIGINAL score is captured before the change,
 *  - `hole_scores` is updated in place (authoritative — no second table),
 *  - exactly one new `score_audit_log` row is appended in the SAME
 *    transaction (append-only — this codebase has no update/delete API
 *    for that table, by design),
 *  - if the player already has a `scorecard_submissions` row for this
 *    round, its `grossTotal` snapshot is recomputed and updated so it
 *    stays consistent with the corrected authoritative scores, WITHOUT
 *    touching `submittedAt`/`submittedByMemberId` (no re-submission
 *    required) — this also naturally means a round that was already
 *    COMPLETE remains COMPLETE, since this function never touches
 *    `championship_rounds.status`,
 *  - the corresponding CHAMPIONSHIP `played_rounds` row (if the
 *    scorecard was submitted) is idempotently reconciled to the new
 *    total in the same transaction, so future handicap calculations
 *    immediately reflect the corrected score.
 */
export async function correctSubmittedHoleScore(params: {
  holeScoreId: string;
  newGrossScore: number;
  actingMemberId: string;
  reason?: string;
}): Promise<void> {
  const { holeScoreId, newGrossScore, actingMemberId, reason } = params;

  if (!isValidGrossScore(newGrossScore)) {
    throw new CorrectionAuthorizationError(
      `Invalid gross score ${newGrossScore}.`
    );
  }

  await db.transaction(async (tx) => {
    const [actingMember] = await tx
      .select({ appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember || actingMember.appRole !== "ADMIN") {
      throw new CorrectionAuthorizationError(
        "Only an ADMIN may correct a submitted hole score."
      );
    }

    const [existing] = await tx
      .select({
        id: holeScores.id,
        championshipRoundId: holeScores.championshipRoundId,
        championshipPlayerId: holeScores.championshipPlayerId,
        holeNumber: holeScores.holeNumber,
        grossScore: holeScores.grossScore,
      })
      .from(holeScores)
      .where(eq(holeScores.id, holeScoreId))
      .limit(1);
    if (!existing) {
      throw new Error(`Hole score ${holeScoreId} does not exist.`);
    }

    const originalGrossScore = existing.grossScore;

    await tx
      .update(holeScores)
      .set({ grossScore: newGrossScore, updatedAt: new Date() })
      .where(eq(holeScores.id, holeScoreId));

    // Append-only audit row — never update/delete an existing one.
    await tx.insert(scoreAuditLog).values({
      championshipRoundId: existing.championshipRoundId,
      championshipPlayerId: existing.championshipPlayerId,
      holeNumber: existing.holeNumber,
      holeScoreId: existing.id,
      originalGrossScore,
      newGrossScore,
      changedByMemberId: actingMemberId,
      reason: reason ?? null,
    });

    const [submission] = await tx
      .select({ id: scorecardSubmissions.id })
      .from(scorecardSubmissions)
      .where(
        and(
          eq(
            scorecardSubmissions.championshipRoundId,
            existing.championshipRoundId
          ),
          eq(
            scorecardSubmissions.championshipPlayerId,
            existing.championshipPlayerId
          )
        )
      )
      .limit(1);

    if (submission) {
      const allScores = await tx
        .select({ grossScore: holeScores.grossScore })
        .from(holeScores)
        .where(
          and(
            eq(holeScores.championshipRoundId, existing.championshipRoundId),
            eq(
              holeScores.championshipPlayerId,
              existing.championshipPlayerId
            )
          )
        );
      const newGrossTotal = allScores.reduce((sum, s) => sum + s.grossScore, 0);

      await tx
        .update(scorecardSubmissions)
        .set({ grossTotal: newGrossTotal })
        .where(eq(scorecardSubmissions.id, submission.id));

      const [player] = await tx
        .select({ memberId: championshipPlayers.memberId })
        .from(championshipPlayers)
        .where(eq(championshipPlayers.id, existing.championshipPlayerId))
        .limit(1);
      if (player) {
        await upsertChampionshipPlayedRound(tx, {
          memberId: player.memberId,
          championshipRoundId: existing.championshipRoundId,
          championshipPlayerId: existing.championshipPlayerId,
          grossTotal: newGrossTotal,
        });
      }
    }
  });
}
