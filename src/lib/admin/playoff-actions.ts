"use server";

import { revalidatePath } from "next/cache";
import { requireAdminMember } from "@/lib/current-member";
import {
  createPlayoffSession,
  recordPlayoffHole,
  getPlayoffSessionState,
  PlayoffError,
  type PlayoffSessionState,
  type PlayoffHoleScoreRow,
} from "@/lib/tournament/playoff";

export type CreatePlayoffSessionActionResult =
  | { ok: true; session: PlayoffSessionState }
  | { ok: false; error: string };

/**
 * ADMIN-only: creates the playoff session for a championship with the
 * admin-selected tied players. All eligibility/validation happens
 * inside `createPlayoffSession` — this action never bypasses it.
 */
export async function createPlayoffSessionAction(params: {
  championshipId: string;
  championshipPlayerIds: string[];
}): Promise<CreatePlayoffSessionActionResult> {
  try {
    const current = await requireAdminMember();

    await createPlayoffSession({
      championshipId: params.championshipId,
      championshipPlayerIds: params.championshipPlayerIds,
      createdByMemberId: current.member.id,
    });

    const session = await getPlayoffSessionState(params.championshipId);
    revalidatePath("/admin/championship");
    return { ok: true, session };
  } catch (err) {
    const message =
      err instanceof PlayoffError
        ? err.message
        : "Couldn't create the playoff session.";
    return { ok: false, error: message };
  }
}

export type RecordPlayoffHoleActionResult =
  | { ok: true; session: PlayoffSessionState }
  | { ok: false; error: string };

/**
 * ADMIN-only: records one playoff hole's scores via the existing
 * `recordPlayoffHole` service (which atomically resolves the
 * championship if a unique winner emerges). Never writes to the
 * database directly.
 */
export async function recordPlayoffHoleAction(params: {
  championshipId: string;
  playoffSessionId: string;
  scores: PlayoffHoleScoreRow[];
}): Promise<RecordPlayoffHoleActionResult> {
  try {
    await requireAdminMember();

    await recordPlayoffHole({
      playoffSessionId: params.playoffSessionId,
      scores: params.scores,
    });

    const session = await getPlayoffSessionState(params.championshipId);
    revalidatePath("/admin/championship");
    return { ok: true, session };
  } catch (err) {
    const message =
      err instanceof PlayoffError
        ? err.message
        : "Couldn't record this playoff hole.";
    return { ok: false, error: message };
  }
}
