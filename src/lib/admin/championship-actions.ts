"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { championshipPlayers } from "@/db/schema/championship-players";
import { requireAdminMember } from "@/lib/current-member";
import {
  createDraftChampionship,
  updateDraftChampionshipDetails,
} from "@/lib/tournament/create";
import {
  addPlayerToChampionship,
  removePlayerFromChampionship,
} from "@/lib/tournament/enrollment";
import {
  setCompleteRoundSetup,
  type CourseSetupInput,
  type HoleSetupInput,
} from "@/lib/tournament/course-setup";
import { generateAndPersistRound1Pairing } from "@/lib/tournament/round1-pairing-service";
import { startChampionshipWithRound1Pairing } from "@/lib/tournament/start-with-round1-pairing";
import { setRoundGroupTeeTimes, type TeeTimeUpdate } from "@/lib/tournament/tee-times";
import { updateRoundPairings, type PairingAssignment } from "@/lib/tournament/pairing-edit";

export type CreateDraftChampionshipActionResult =
  | { ok: true; championshipId: string }
  | { ok: false; error: string };

/**
 * Admin-only: creates a new DRAFT championship. No creation rules live
 * here — see src/lib/tournament/create.ts (uniqueness per year, exactly
 * 4 empty rounds, etc.).
 */
export async function createDraftChampionshipAction(params: {
  year: number;
  name: string;
  startDate?: string;
  endDate?: string;
}): Promise<CreateDraftChampionshipActionResult> {
  try {
    const current = await requireAdminMember();

    const result = await createDraftChampionship({
      year: params.year,
      name: params.name,
      createdByMemberId: current.member.id,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });

    revalidatePath("/admin/championship");
    return { ok: true, championshipId: result.championshipId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create championship.",
    };
  }
}

export type ParticipantActionResult = { ok: true } | { ok: false; error: string };

export type GenerateRound1PairingActionResult =
  | { ok: true; groupIds: string[] }
  | { ok: false; error: string };

/**
 * Admin-only: generates Round 1 pairings AHEAD of championship start,
 * so players/carts can be lined up before the tournament actually
 * begins. Uses the exact same pairing engine/rules as the
 * start-time path (see src/lib/tournament/round1-pairing-service.ts) —
 * it refuses to regenerate if Round 1 already has groups, and
 * `startChampionshipAction` later simply reuses these same groups
 * instead of generating new ones.
 */
export async function generateRound1PairingAction(params: {
  championshipRoundId: string;
}): Promise<GenerateRound1PairingActionResult> {
  try {
    const current = await requireAdminMember();
    const result = await generateAndPersistRound1Pairing({
      championshipRoundId: params.championshipRoundId,
      generatedByMemberId: current.member.id,
    });
    revalidatePath("/admin/championship");
    revalidatePath("/pairings");
    return { ok: true, groupIds: result.groupIds };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not generate Round 1 pairings.",
    };
  }
}

export type UpdateChampionshipDetailsActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Admin-only: edits a DRAFT championship's name/start/end date. No
 * DRAFT-only/date-order validation lives here — see
 * src/lib/tournament/create.ts's updateDraftChampionshipDetails.
 */
export async function updateChampionshipDetailsAction(params: {
  championshipId: string;
  name: string;
  startDate?: string;
  endDate?: string;
}): Promise<UpdateChampionshipDetailsActionResult> {
  try {
    await requireAdminMember();
    await updateDraftChampionshipDetails({
      championshipId: params.championshipId,
      name: params.name,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
    revalidatePath("/admin/championship");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update championship details.",
    };
  }
}

/**
 * Admin-only: adds an ACTIVE member to a DRAFT championship. No
 * DRAFT-only/ACTIVE-member validation lives here — see
 * src/lib/tournament/enrollment.ts.
 */
export async function addParticipantAction(params: {
  championshipId: string;
  memberId: string;
}): Promise<ParticipantActionResult> {
  try {
    await requireAdminMember();
    await addPlayerToChampionship(params);
    revalidatePath("/admin/championship");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not add participant.",
    };
  }
}

/**
 * Admin-only: removes a participant from a DRAFT championship. No
 * DRAFT-only validation lives here — see src/lib/tournament/enrollment.ts.
 */
export async function removeParticipantAction(params: {
  championshipId: string;
  memberId: string;
}): Promise<ParticipantActionResult> {
  try {
    await requireAdminMember();
    await removePlayerFromChampionship(params);
    revalidatePath("/admin/championship");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not remove participant.",
    };
  }
}

export type SaveRoundSetupActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only: atomically saves a round's course/tee metadata and its
 * 18-hole layout together (one DB transaction — see
 * src/lib/tournament/course-setup.ts's setCompleteRoundSetup). No
 * validation or DRAFT-only rules live here — both are enforced by that
 * service itself.
 */
export async function saveRoundSetupAction(params: {
  championshipRoundId: string;
  courseSetup: CourseSetupInput;
  holes: HoleSetupInput[];
}): Promise<SaveRoundSetupActionResult> {
  try {
    const current = await requireAdminMember();
    await setCompleteRoundSetup({
      championshipRoundId: params.championshipRoundId,
      actingMemberId: current.member.id,
      courseSetup: params.courseSetup,
      holes: params.holes,
    });
    revalidatePath("/admin/championship");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save round setup.",
    };
  }
}

export type StartChampionshipActionResult =
  | { ok: true; groupIds: string[] }
  | { ok: false; error: string };

/**
 * Admin-only: starts a DRAFT championship AND generates its Round 1
 * pairings atomically (one DB transaction — see
 * src/lib/tournament/start-with-round1-pairing.ts). No start
 * validation, handicap-freezing, or pairing logic lives here — all of
 * it is enforced by the composed services themselves.
 */
export async function startChampionshipAction(params: {
  championshipId: string;
}): Promise<StartChampionshipActionResult> {
  try {
    const current = await requireAdminMember();
    const result = await startChampionshipWithRound1Pairing({
      championshipId: params.championshipId,
      generatedByMemberId: current.member.id,
    });
    revalidatePath("/admin/championship");
    return { ok: true, groupIds: result.groupIds };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start championship.",
    };
  }
}

export type SaveTeeTimesActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only: sets a participant's status (ACTIVE / WITHDRAWN /
 * DISQUALIFIED) for an in-progress or completed championship.
 *
 * This is a status flip ONLY — it never touches historical scores,
 * `frozenHandicap`, or round-group assignments. The existing rules that
 * WITHDRAWN/DISQUALIFIED players never block round completion and are
 * excluded from future pairing generation already live in the
 * scoring/pairing services themselves (see
 * src/lib/tournament/scoring/submit-group.ts and
 * src/lib/tournament/round2to4-pairing-service.ts) — nothing new is
 * introduced here.
 */
export async function setParticipantStatusAction(params: {
  championshipPlayerId: string;
  status: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";
}): Promise<ParticipantActionResult> {
  try {
    await requireAdminMember();
    await db
      .update(championshipPlayers)
      .set({ participantStatus: params.status })
      .where(eq(championshipPlayers.id, params.championshipPlayerId));
    revalidatePath("/admin/championship");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update participant status.",
    };
  }
}

/**
 * Admin-only: manually overrides one participant's already-frozen
 * starting handicap for this championship (`championship_players.frozenHandicap`).
 *
 * This exists ONLY for rare special-case corrections (e.g. a data-entry
 * mistake at start time) — it does NOT recompute anything from live
 * historical rounds, and it does NOT retroactively touch any
 * already-submitted scorecards. Existing cumulativeNet/leaderboard/
 * standings reads already compute `cumulativeNet` from whatever
 * `frozenHandicap` currently holds (see round2to4-pairing-service.ts,
 * leaderboard.ts, finalize.ts), so this correction takes effect the
 * next time those are read — no separate rescoring step is needed.
 */
export async function updateFrozenHandicapAction(params: {
  championshipPlayerId: string;
  frozenHandicap: number;
}): Promise<ParticipantActionResult> {
  try {
    await requireAdminMember();

    if (!Number.isInteger(params.frozenHandicap) || params.frozenHandicap < 0 || params.frozenHandicap > 54) {
      return { ok: false, error: "Enter a whole number between 0 and 54." };
    }

    await db
      .update(championshipPlayers)
      .set({ frozenHandicap: params.frozenHandicap })
      .where(eq(championshipPlayers.id, params.championshipPlayerId));
    revalidatePath("/admin/championship");
    revalidatePath("/leaderboard");
    revalidatePath("/pairings");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update starting handicap.",
    };
  }
}

/**
 * Admin-only: batch-saves tee times for already-existing groups within
 * one championship round, atomically. No group-membership/position
 * changes, no regeneration, no scorecard changes — all enforced by
 * setRoundGroupTeeTimes itself (see src/lib/tournament/tee-times.ts).
 */
export async function saveTeeTimesAction(params: {
  championshipRoundId: string;
  updates: TeeTimeUpdate[];
}): Promise<SaveTeeTimesActionResult> {
  try {
    const current = await requireAdminMember();
    await setRoundGroupTeeTimes({
      championshipRoundId: params.championshipRoundId,
      actingMemberId: current.member.id,
      updates: params.updates,
    });
    revalidatePath("/admin/championship");
    revalidatePath("/pairings");
    // Home ("/") and "/score" also render this same group's tee time
    // (via getCurrentGroupForMember) — must be revalidated too, or
    // they'll keep showing the stale cached tee time until a hard
    // reload even though Pairings already shows the fresh value.
    revalidatePath("/");
    revalidatePath("/score");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save tee times.",
    };
  }
}

export type UpdateRoundPairingsActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only: manually reassigns which group/cart/position each
 * player in a round is in. No pairing-generation logic lives here —
 * see updateRoundPairings for all validation/safety rules (refuses to
 * edit once any group in the round has SUBMITTED, requires every
 * player in the round to be included in one atomic replace).
 */
export async function updateRoundPairingsAction(params: {
  championshipRoundId: string;
  assignments: PairingAssignment[];
}): Promise<UpdateRoundPairingsActionResult> {
  try {
    const current = await requireAdminMember();
    await updateRoundPairings({
      championshipRoundId: params.championshipRoundId,
      actingMemberId: current.member.id,
      assignments: params.assignments,
    });
    revalidatePath("/admin/championship");
    revalidatePath("/pairings");
    // Home ("/") and "/score" also render the current group's pairing
    // (via getCurrentGroupForMember) — same reasoning as saveTeeTimesAction.
    revalidatePath("/");
    revalidatePath("/score");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save pairings.",
    };
  }
}
