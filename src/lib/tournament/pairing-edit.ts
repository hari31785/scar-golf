import "server-only";

import { db } from "@/db";
import { members } from "@/db/schema/members";
import { roundGroups } from "@/db/schema/round-groups";
import { roundGroupPlayers } from "@/db/schema/round-group-players";
import { championshipRounds } from "@/db/schema/championship-rounds";
import { holeScores } from "@/db/schema/hole-scores";
import { and, eq } from "drizzle-orm";

export class PairingEditError extends Error {}

export type PairingAssignment = {
  championshipPlayerId: string;
  roundGroupId: string;
  cartNumber: number | null;
  position: number;
};

/**
 * Admin-only manual override of an already-generated round's group
 * assignments (which group each player is in, their cart number, and
 * their tee-off position within the group).
 *
 * This does NOT regenerate pairings and does NOT change the pairing
 * ALGORITHM used for Round 1 (membership-based) or Rounds 2-4
 * (net-standings-based) — it purely lets an admin manually reassign
 * players across the groups that already exist for a round, for
 * logistics reasons (e.g. a late withdrawal, a requested cart change,
 * balancing group sizes).
 *
 * SAFETY RULE: refuses to edit a round once ANY group within it has
 * reached SUBMITTED status — reassigning a player after their group
 * has already locked in scores would silently disconnect their
 * `hole_scores`/`scorecard_submissions` rows (which reference the
 * group only for display/authorization, not the player's actual
 * scoring) from the group they actually played with. Editing an
 * IN_PROGRESS (but not yet submitted) round's pairings is allowed —
 * any hole_scores already recorded for a reassigned player are moved
 * along with them (their denormalized `roundGroupId` is updated in the
 * same transaction) so nothing is orphaned.
 *
 * Every assignment for the round must be supplied together (the full
 * set of players + their group/cart/position) — this is intentionally
 * an atomic "replace the whole round's assignments" operation, not a
 * partial patch, so it's impossible to end up with a player counted in
 * two groups or dropped from all of them.
 */
export async function updateRoundPairings(params: {
  championshipRoundId: string;
  actingMemberId: string;
  assignments: PairingAssignment[];
}): Promise<void> {
  const { championshipRoundId, actingMemberId, assignments } = params;

  if (assignments.length === 0) {
    throw new PairingEditError("No player assignments were provided.");
  }

  // Every player must be assigned to exactly one group — guards against
  // a client bug silently dropping or duplicating a player.
  const seenPlayerIds = new Set<string>();
  for (const a of assignments) {
    if (seenPlayerIds.has(a.championshipPlayerId)) {
      throw new PairingEditError(
        "A player was assigned to more than one group in the same request."
      );
    }
    seenPlayerIds.add(a.championshipPlayerId);
  }

  await db.transaction(async (tx) => {
    const [actingMember] = await tx
      .select({ status: members.status, appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember) {
      throw new PairingEditError(`Member ${actingMemberId} does not exist.`);
    }
    if (actingMember.status !== "ACTIVE" || actingMember.appRole !== "ADMIN") {
      throw new PairingEditError("Only an ACTIVE ADMIN member may edit pairings.");
    }

    const [round] = await tx
      .select({ id: championshipRounds.id })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new PairingEditError(
        `Championship round ${championshipRoundId} does not exist.`
      );
    }

    const existingGroups = await tx
      .select({ id: roundGroups.id, status: roundGroups.status })
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, championshipRoundId));
    if (existingGroups.length === 0) {
      throw new PairingEditError("This round has no groups to edit.");
    }
    if (existingGroups.some((g) => g.status === "SUBMITTED")) {
      throw new PairingEditError(
        "Cannot edit pairings — at least one group in this round has already submitted."
      );
    }

    const existingGroupIds = new Set(existingGroups.map((g) => g.id));
    for (const a of assignments) {
      if (!existingGroupIds.has(a.roundGroupId)) {
        throw new PairingEditError(
          `Group ${a.roundGroupId} does not belong to this round.`
        );
      }
    }

    const existingPlayerRows = await tx
      .select({
        id: roundGroupPlayers.id,
        championshipPlayerId: roundGroupPlayers.championshipPlayerId,
      })
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, championshipRoundId));

    const existingPlayerIds = new Set(
      existingPlayerRows.map((r) => r.championshipPlayerId)
    );
    for (const a of assignments) {
      if (!existingPlayerIds.has(a.championshipPlayerId)) {
        throw new PairingEditError(
          `Championship player ${a.championshipPlayerId} is not part of this round.`
        );
      }
    }
    if (assignments.length !== existingPlayerRows.length) {
      throw new PairingEditError(
        "Every player currently in this round must be included in the update."
      );
    }

    const rowIdByPlayerId = new Map(
      existingPlayerRows.map((r) => [r.championshipPlayerId, r.id])
    );

    for (const a of assignments) {
      const rowId = rowIdByPlayerId.get(a.championshipPlayerId)!;
      await tx
        .update(roundGroupPlayers)
        .set({
          roundGroupId: a.roundGroupId,
          cartNumber: a.cartNumber,
          position: a.position,
        })
        .where(eq(roundGroupPlayers.id, rowId));
    }

    // Keep any hole_scores already recorded for a reassigned player
    // pointed at their NEW group — hole_scores.roundGroupId is
    // denormalized purely for display/authorization convenience (see
    // src/db/schema/hole-scores.ts), never trusted for scoring, but it
    // must still be kept in sync so it doesn't silently reference a
    // group the player is no longer actually in.
    for (const a of assignments) {
      await tx
        .update(holeScores)
        .set({ roundGroupId: a.roundGroupId, updatedAt: new Date() })
        .where(
          and(
            eq(holeScores.championshipRoundId, championshipRoundId),
            eq(holeScores.championshipPlayerId, a.championshipPlayerId)
          )
        );
    }
  });
}
