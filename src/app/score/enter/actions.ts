"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/current-member";
import { saveHoleScore, ScoreAuthorizationError } from "@/lib/tournament/scoring/hole-score";
import { submitRoundGroup, GroupSubmissionError } from "@/lib/tournament/scoring/submit-group";

export type SaveHoleScoreResult =
  | { ok: true }
  | { ok: false; error: string };

export type SubmitRoundGroupResult =
  | { ok: true; roundComplete: boolean }
  | { ok: false; error: string };

/**
 * Server action wrapping the existing authorized `saveHoleScore`
 * service with the signed-in member's identity. No new authorization
 * logic lives here — every rule (same group, ACTIVE participant, group
 * not SUBMITTED, etc.) is enforced by saveHoleScore itself.
 */
export async function saveHoleScoreAction(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
  holeNumber: number;
  grossScore: number;
}): Promise<SaveHoleScoreResult> {
  const current = await getCurrentMember();
  if (!current) {
    return { ok: false, error: "Not signed in." };
  }

  try {
    await saveHoleScore({
      championshipRoundId: params.championshipRoundId,
      championshipPlayerId: params.championshipPlayerId,
      holeNumber: params.holeNumber,
      grossScore: params.grossScore,
      actingMemberId: current.member.id,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ScoreAuthorizationError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not save score. Please try again." };
  }
}

/**
 * Server action wrapping the existing authorized `submitRoundGroup`
 * service with the signed-in member's identity. No authorization or
 * completeness logic lives here — every rule (group membership,
 * championship ACTIVE, round not COMPLETE, group not already
 * SUBMITTED, every ACTIVE player's scorecard complete) is enforced by
 * submitRoundGroup itself.
 */
export async function submitRoundGroupAction(params: {
  roundGroupId: string;
}): Promise<SubmitRoundGroupResult> {
  const current = await getCurrentMember();
  if (!current) {
    return { ok: false, error: "Not signed in." };
  }

  try {
    const result = await submitRoundGroup({
      roundGroupId: params.roundGroupId,
      actingMemberId: current.member.id,
    });
    revalidatePath("/score/enter");
    revalidatePath("/score");
    return { ok: true, roundComplete: result.roundComplete };
  } catch (err) {
    if (err instanceof GroupSubmissionError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not submit round. Please try again." };
  }
}
