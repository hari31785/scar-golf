"use server";

import { revalidatePath } from "next/cache";
import { requireAdminMember } from "@/lib/current-member";
import {
  getSubmittedScorecardForCorrection,
  listRecentCorrections,
  type CorrectionScorecardResult,
  type CorrectionAuditRow,
} from "@/lib/tournament/scoring/correction-data";
import { correctSubmittedHoleScore } from "@/lib/tournament/scoring/correction";

export type LoadPlayerCorrectionDataResult =
  | {
      ok: true;
      scorecard: CorrectionScorecardResult;
      history: CorrectionAuditRow[];
    }
  | { ok: false; error: string };

/**
 * Admin-only: loads a player's submitted scorecard for one round plus
 * their recent correction history. Read-only — does not create any
 * missing scores.
 */
export async function loadPlayerCorrectionDataAction(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
}): Promise<LoadPlayerCorrectionDataResult> {
  try {
    await requireAdminMember();

    const [scorecard, history] = await Promise.all([
      getSubmittedScorecardForCorrection(params),
      listRecentCorrections(params),
    ]);

    return { ok: true, scorecard, history };
  } catch {
    return { ok: false, error: "Couldn't load this player's scorecard." };
  }
}

export type CorrectHoleScoreActionResult =
  | {
      ok: true;
      scorecard: CorrectionScorecardResult;
      history: CorrectionAuditRow[];
    }
  | { ok: false; error: string };

/**
 * Admin-only: corrects one already-submitted hole score using the
 * existing correction service (which validates the score, records the
 * audit row, and keeps the scorecard submission total / played-round
 * total consistent). This action never touches the database directly —
 * all writes happen inside `correctSubmittedHoleScore`.
 *
 * After applying the correction, re-loads the scorecard + history so
 * the admin UI can refresh from the authoritative persisted state.
 */
export async function correctHoleScoreAction(params: {
  holeScoreId: string;
  newGrossScore: number;
  reason: string;
  championshipRoundId: string;
  championshipPlayerId: string;
}): Promise<CorrectHoleScoreActionResult> {
  const { holeScoreId, newGrossScore, reason, championshipRoundId, championshipPlayerId } =
    params;

  if (!reason.trim()) {
    return { ok: false, error: "A correction reason is required." };
  }

  try {
    const current = await requireAdminMember();

    await correctSubmittedHoleScore({
      holeScoreId,
      newGrossScore,
      actingMemberId: current.member.id,
      reason: reason.trim(),
    });

    const [scorecard, history] = await Promise.all([
      getSubmittedScorecardForCorrection({ championshipRoundId, championshipPlayerId }),
      listRecentCorrections({ championshipRoundId, championshipPlayerId }),
    ]);

    revalidatePath("/admin/championship");

    return { ok: true, scorecard, history };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't apply the correction.";
    return { ok: false, error: message };
  }
}
