"use server";

import { revalidatePath } from "next/cache";
import { getCurrentMember } from "@/lib/current-member";
import {
  saveHoleScore,
  saveHoleScoresForGroup,
  ScoreAuthorizationError,
} from "@/lib/tournament/scoring/hole-score";
import { submitRoundGroup, GroupSubmissionError } from "@/lib/tournament/scoring/submit-group";
import { setPlayerRoundSkip, RoundSkipError } from "@/lib/tournament/scoring/round-skip";

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

export type SaveHoleScoresForGroupResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server action wrapping `saveHoleScoresForGroup` — batch-saves every
 * group member's gross score for ONE hole in a single call. Used by
 * the score-entry UI's "save on leaving the hole" flow so a whole
 * hole's worth of scores commits as one round-trip instead of one
 * network call per player per stroke. No new authorization logic here
 * — every rule is enforced by saveHoleScoresForGroup itself.
 */
export async function saveHoleScoresForGroupAction(params: {
  championshipRoundId: string;
  holeNumber: number;
  scores: { championshipPlayerId: string; grossScore: number }[];
}): Promise<SaveHoleScoresForGroupResult> {
  const current = await getCurrentMember();
  if (!current) {
    return { ok: false, error: "Not signed in." };
  }

  try {
    await saveHoleScoresForGroup({
      championshipRoundId: params.championshipRoundId,
      holeNumber: params.holeNumber,
      scores: params.scores,
      actingMemberId: current.member.id,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ScoreAuthorizationError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not save this hole. Please try again." };
  }
}

export type SetPlayerRoundSkipResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server action wrapping `setPlayerRoundSkip` — marks (or un-marks) one
 * player as skipping THIS round only (e.g. played Round 1, skips Round
 * 2, returns for Round 3), so their group can submit without a
 * scorecard for them. No new authorization logic here — every rule
 * (same group or admin, group not already submitted) is enforced by
 * setPlayerRoundSkip itself.
 */
export async function setPlayerRoundSkipAction(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
  skipped: boolean;
}): Promise<SetPlayerRoundSkipResult> {
  const current = await getCurrentMember();
  if (!current) {
    return { ok: false, error: "Not signed in." };
  }

  try {
    await setPlayerRoundSkip({
      championshipRoundId: params.championshipRoundId,
      championshipPlayerId: params.championshipPlayerId,
      skipped: params.skipped,
      actingMemberId: current.member.id,
    });
    revalidatePath("/score/enter");
    revalidatePath("/score");
    return { ok: true };
  } catch (err) {
    if (err instanceof RoundSkipError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not update skip status. Please try again." };
  }
}
