import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  roundGroups,
  roundGroupPlayers,
  holeScores,
  members,
} from "@/db/schema";
import { isValidGrossScore, isValidHoleNumber } from "./completeness";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolves the actual round-group membership row for a championship
 * player in a round, straight from the database. Never trust a
 * client-supplied group id for authorization — always re-derive this.
 */
async function findGroupMembership(
  tx: Tx,
  championshipRoundId: string,
  championshipPlayerId: string
) {
  const [row] = await tx
    .select({
      roundGroupId: roundGroupPlayers.roundGroupId,
      groupStatus: roundGroups.status,
    })
    .from(roundGroupPlayers)
    .innerJoin(roundGroups, eq(roundGroups.id, roundGroupPlayers.roundGroupId))
    .where(
      and(
        eq(roundGroupPlayers.championshipRoundId, championshipRoundId),
        eq(roundGroupPlayers.championshipPlayerId, championshipPlayerId)
      )
    )
    .limit(1);
  return row ?? null;
}

export class ScoreAuthorizationError extends Error {}

/**
 * Saves/updates the authoritative gross score for one hole for one
 * championship player, enforcing all scoring authorization rules.
 *
 * NORMAL PLAYER path (actingMemberId's own championship-player row is
 * not ADMIN):
 *  - actingMemberId must itself be an ACTIVE participant in this
 *    championship,
 *  - actingMemberId's own round-group membership for this round must
 *    exist and be the SAME group as the target player's,
 *  - the target player must actually belong to that group for this
 *    round (re-derived from the DB, never trusted from the caller),
 *  - that group must not already be SUBMITTED,
 *  - the championship must be ACTIVE,
 *  - the round must not be COMPLETE,
 *  - the target player's participantStatus must be ACTIVE.
 *
 * ADMIN path: bypasses all of the group/ownership checks above, but
 * writing a score for a player whose round-group is already SUBMITTED
 * must go through the correction/audit path instead (see
 * src/lib/tournament/scoring/correction.ts) — this function refuses
 * that case outright so admins cannot silently overwrite submitted data.
 *
 * On the very first valid score saved for a round, the round's status
 * transitions NOT_STARTED -> IN_PROGRESS (COMPLETE never regresses).
 */
export async function saveHoleScore(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
  holeNumber: number;
  grossScore: number;
  actingMemberId: string;
}): Promise<{ holeScoreId: string }> {
  const {
    championshipRoundId,
    championshipPlayerId,
    holeNumber,
    grossScore,
    actingMemberId,
  } = params;

  if (!isValidHoleNumber(holeNumber)) {
    throw new ScoreAuthorizationError(
      `Invalid hole number ${holeNumber} — must be between 1 and 18.`
    );
  }
  if (!isValidGrossScore(grossScore)) {
    throw new ScoreAuthorizationError(
      `Invalid gross score ${grossScore} for hole ${holeNumber}.`
    );
  }

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select({
        status: championshipRounds.status,
        championshipId: championshipRounds.championshipId,
      })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new Error(`Championship round ${championshipRoundId} does not exist.`);
    }
    if (round.status === "COMPLETE") {
      throw new ScoreAuthorizationError(
        "Cannot save a score — this round is already COMPLETE."
      );
    }

    const [championship] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, round.championshipId))
      .limit(1);
    if (!championship || championship.status !== "ACTIVE") {
      throw new ScoreAuthorizationError(
        "Cannot save a score — championship is not ACTIVE."
      );
    }

    const [targetPlayer] = await tx
      .select({
        id: championshipPlayers.id,
        participantStatus: championshipPlayers.participantStatus,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, championshipPlayerId))
      .limit(1);
    if (!targetPlayer) {
      throw new Error(`Championship player ${championshipPlayerId} does not exist.`);
    }
    if (targetPlayer.participantStatus !== "ACTIVE") {
      throw new ScoreAuthorizationError(
        `Cannot save a score — target participant status is ${targetPlayer.participantStatus}, not ACTIVE.`
      );
    }

    const [actingMember] = await tx
      .select({ appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember) {
      throw new Error(`Member ${actingMemberId} does not exist.`);
    }
    const isAdmin = actingMember.appRole === "ADMIN";

    const targetGroupMembership = await findGroupMembership(
      tx,
      championshipRoundId,
      championshipPlayerId
    );
    if (!targetGroupMembership) {
      throw new ScoreAuthorizationError(
        "Target player is not assigned to any group for this round."
      );
    }

    if (isAdmin) {
      if (targetGroupMembership.groupStatus === "SUBMITTED") {
        throw new ScoreAuthorizationError(
          "This group has already submitted — use the admin correction path instead of saveHoleScore."
        );
      }
    } else {
      // Acting member must themselves be an ACTIVE participant.
      const [actingParticipant] = await tx
        .select({
          id: championshipPlayers.id,
          participantStatus: championshipPlayers.participantStatus,
        })
        .from(championshipPlayers)
        .where(
          and(
            eq(championshipPlayers.championshipId, round.championshipId),
            eq(championshipPlayers.memberId, actingMemberId)
          )
        )
        .limit(1);
      if (!actingParticipant || actingParticipant.participantStatus !== "ACTIVE") {
        throw new ScoreAuthorizationError(
          "Acting member is not an active participant in this championship."
        );
      }

      const actingGroupMembership = await findGroupMembership(
        tx,
        championshipRoundId,
        actingParticipant.id
      );
      if (
        !actingGroupMembership ||
        actingGroupMembership.roundGroupId !== targetGroupMembership.roundGroupId
      ) {
        throw new ScoreAuthorizationError(
          "Acting member does not belong to the same group as the target player for this round."
        );
      }
      if (targetGroupMembership.groupStatus === "SUBMITTED") {
        throw new ScoreAuthorizationError(
          "Cannot edit — this group's scorecard has already been submitted."
        );
      }
    }

    const [existing] = await tx
      .select({ id: holeScores.id })
      .from(holeScores)
      .where(
        and(
          eq(holeScores.championshipRoundId, championshipRoundId),
          eq(holeScores.championshipPlayerId, championshipPlayerId),
          eq(holeScores.holeNumber, holeNumber)
        )
      )
      .limit(1);

    let holeScoreId: string;
    if (existing) {
      await tx
        .update(holeScores)
        .set({ grossScore, updatedAt: new Date() })
        .where(eq(holeScores.id, existing.id));
      holeScoreId = existing.id;
    } else {
      const [inserted] = await tx
        .insert(holeScores)
        .values({
          championshipRoundId,
          championshipPlayerId,
          roundGroupId: targetGroupMembership.roundGroupId,
          holeNumber,
          grossScore,
          createdByMemberId: actingMemberId,
        })
        .returning({ id: holeScores.id });
      holeScoreId = inserted.id;
    }

    if (round.status === "NOT_STARTED") {
      await tx
        .update(championshipRounds)
        .set({ status: "IN_PROGRESS", updatedAt: new Date() })
        .where(eq(championshipRounds.id, championshipRoundId));
    }

    return { holeScoreId };
  });
}
