"use server";

import { revalidatePath } from "next/cache";
import { requireAdminMember } from "@/lib/current-member";
import { createDraftChampionship } from "@/lib/tournament/create";
import {
  addPlayerToChampionship,
  removePlayerFromChampionship,
} from "@/lib/tournament/enrollment";
import {
  setCompleteRoundSetup,
  type CourseSetupInput,
  type HoleSetupInput,
} from "@/lib/tournament/course-setup";
import { startChampionshipWithRound1Pairing } from "@/lib/tournament/start-with-round1-pairing";
import { setRoundGroupTeeTimes, type TeeTimeUpdate } from "@/lib/tournament/tee-times";

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
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save tee times.",
    };
  }
}
