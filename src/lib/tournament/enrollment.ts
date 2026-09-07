import "server-only";

import { db } from "@/db";
import { championships, championshipPlayers, members } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Adds an ACTIVE SCAR member to a DRAFT championship as a participant.
 *
 * Rejects:
 *  - a championship that is not DRAFT (players can only be
 *    added/removed before the championship starts — see
 *    src/lib/tournament/start.ts for what happens at start time),
 *  - a member whose `members.status` is not ACTIVE,
 *  - a member already enrolled in this championship (also enforced by
 *    the DB's unique index on (championshipId, memberId) as a defense
 *    in depth, but checked explicitly here for a clean error message).
 */
export async function addPlayerToChampionship(params: {
  championshipId: string;
  memberId: string;
}): Promise<{ championshipPlayerId: string }> {
  const { championshipId, memberId } = params;

  return db.transaction(async (tx) => {
    const [championship] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, championshipId))
      .limit(1);

    if (!championship) {
      throw new Error(`Championship ${championshipId} does not exist.`);
    }
    if (championship.status !== "DRAFT") {
      throw new Error(
        `Cannot add a player — championship is ${championship.status}, not DRAFT.`
      );
    }

    const [member] = await tx
      .select({ status: members.status })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);

    if (!member) {
      throw new Error(`Member ${memberId} does not exist.`);
    }
    if (member.status !== "ACTIVE") {
      throw new Error(
        `Cannot enroll member ${memberId} — member status is ${member.status}, not ACTIVE.`
      );
    }

    const existing = await tx
      .select({ id: championshipPlayers.id })
      .from(championshipPlayers)
      .where(
        and(
          eq(championshipPlayers.championshipId, championshipId),
          eq(championshipPlayers.memberId, memberId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error(
        `Member ${memberId} is already enrolled in championship ${championshipId}.`
      );
    }

    const [inserted] = await tx
      .insert(championshipPlayers)
      .values({
        championshipId,
        memberId,
        participantStatus: "ACTIVE",
      })
      .returning({ id: championshipPlayers.id });

    return { championshipPlayerId: inserted.id };
  });
}

/**
 * Removes a participant from a championship while it is still DRAFT.
 * Once a championship is ACTIVE (or beyond), participants can only be
 * marked WITHDRAWN/DISQUALIFIED (a future phase) — never deleted,
 * because their frozen handicap and scores must be preserved.
 */
export async function removePlayerFromChampionship(params: {
  championshipId: string;
  memberId: string;
}): Promise<void> {
  const { championshipId, memberId } = params;

  await db.transaction(async (tx) => {
    const [championship] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, championshipId))
      .limit(1);

    if (!championship) {
      throw new Error(`Championship ${championshipId} does not exist.`);
    }
    if (championship.status !== "DRAFT") {
      throw new Error(
        `Cannot remove a player — championship is ${championship.status}, not DRAFT.`
      );
    }

    await tx
      .delete(championshipPlayers)
      .where(
        and(
          eq(championshipPlayers.championshipId, championshipId),
          eq(championshipPlayers.memberId, memberId)
        )
      );
  });
}
