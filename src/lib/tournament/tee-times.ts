import "server-only";

import { db } from "@/db";
import { members } from "@/db/schema/members";
import { roundGroups } from "@/db/schema/round-groups";
import { championshipRounds } from "@/db/schema/championship-rounds";
import { eq, inArray } from "drizzle-orm";

export class TeeTimeUpdateError extends Error {}

export type TeeTimeUpdate = {
  roundGroupId: string;
  /** ISO datetime string, or null to clear the tee time. */
  teeTime: string | null;
};

/**
 * Updates tee times for one or more ALREADY-EXISTING groups within a
 * single championship round, in ONE database transaction — either all
 * requested groups are updated, or none are.
 *
 * This does NOT create/regenerate groups, does NOT change group
 * membership or player position, and does NOT touch any scorecard
 * data. It only ever updates `round_groups.teeTime` for groups that
 * already belong to the given round.
 *
 * Authorization: re-checks the acting member is an ACTIVE ADMIN
 * independently of whatever the UI/caller already verified (same
 * defense-in-depth pattern as setCompleteRoundSetup).
 */
export async function setRoundGroupTeeTimes(params: {
  championshipRoundId: string;
  actingMemberId: string;
  updates: TeeTimeUpdate[];
}): Promise<void> {
  const { championshipRoundId, actingMemberId, updates } = params;

  if (updates.length === 0) return;

  await db.transaction(async (tx) => {
    const [actingMember] = await tx
      .select({ status: members.status, appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember) {
      throw new TeeTimeUpdateError(`Member ${actingMemberId} does not exist.`);
    }
    if (actingMember.status !== "ACTIVE" || actingMember.appRole !== "ADMIN") {
      throw new TeeTimeUpdateError("Only an ACTIVE ADMIN member may update tee times.");
    }

    const [round] = await tx
      .select({ id: championshipRounds.id })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new TeeTimeUpdateError(`Championship round ${championshipRoundId} does not exist.`);
    }

    const groupIds = updates.map((u) => u.roundGroupId);
    const existingGroups = await tx
      .select({ id: roundGroups.id, championshipRoundId: roundGroups.championshipRoundId })
      .from(roundGroups)
      .where(inArray(roundGroups.id, groupIds));

    const existingGroupIds = new Set(existingGroups.map((g) => g.id));
    for (const groupId of groupIds) {
      if (!existingGroupIds.has(groupId)) {
        throw new TeeTimeUpdateError(`Group ${groupId} does not exist.`);
      }
    }
    for (const group of existingGroups) {
      if (group.championshipRoundId !== championshipRoundId) {
        throw new TeeTimeUpdateError(
          `Group ${group.id} does not belong to championship round ${championshipRoundId}.`
        );
      }
    }

    for (const update of updates) {
      await tx
        .update(roundGroups)
        .set({
          teeTime: update.teeTime ? new Date(update.teeTime) : null,
          updatedAt: new Date(),
        })
        .where(eq(roundGroups.id, update.roundGroupId));
    }
  });
}
