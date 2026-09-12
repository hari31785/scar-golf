import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championshipPlayers,
  championshipRounds,
  members,
  playedRounds,
  roundGroupPlayers,
  roundGroups,
  scorecardSubmissions,
} from "@/db/schema";
import { championshipPlayedRoundSourceRef } from "./championship-played-rounds";

export class RoundSkipError extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolves the actual round-group membership row for a championship
 * player in a round, straight from the database — mirrors the same
 * helper in hole-score.ts (never trust a client-supplied group id).
 */
async function findGroupMembership(
  tx: Tx,
  championshipRoundId: string,
  championshipPlayerId: string
) {
  const [row] = await tx
    .select({
      id: roundGroupPlayers.id,
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

/**
 * Marks (or un-marks) one championship player as skipping ONE specific
 * round — independent of their overall championship-wide
 * participantStatus (ACTIVE/WITHDRAWN/DISQUALIFIED). This is the
 * "DQ for this round only" control surfaced on the scoring screen and
 * in the admin panel: a player can play Round 1, skip Round 2, and
 * return for Round 3 without ever being withdrawn/disqualified from
 * the championship as a whole.
 *
 * A skipped player is excluded from this round's completion
 * requirement (see submitRoundGroup / round-completion.ts usage) so
 * their group can submit without a scorecard for them, and their
 * scoring inputs are disabled client-side.
 *
 * AUTHORIZATION: same trust boundary as saveHoleScore — an ADMIN may
 * always do this; a normal member may only do this for a player who is
 * in the SAME group as them, for this round (i.e. whoever is actually
 * scoring that foursome can mark a no-show teammate as skipping).
 *
 * NORMAL MEMBER path: refuses if that player's group has already been
 * SUBMITTED for this round (existing hole scores are left untouched —
 * a lightweight status flip, not a data-deletion operation).
 *
 * ADMIN path: may DQ a player for a round EVEN AFTER their group has
 * submitted — e.g. disqualifying a player retroactively so their score
 * no longer counts. In that case, marking `skipped: true` also:
 *  - deletes their `scorecard_submissions` row for this round (so they
 *    stop appearing as "submitted" and drop out of the leaderboard/
 *    round-completion for this round), and
 *  - deletes the corresponding CHAMPIONSHIP-sourced `played_rounds` row
 *    (via its deterministic sourceRef) so this round's score no longer
 *    feeds future handicap calculations either.
 * Their raw `hole_scores` rows are left in place (harmless, hidden by
 * the skipped flag everywhere scores are displayed) in case the DQ is
 * ever reversed. Un-skipping (skipped: false) does NOT restore a
 * deleted submission — the group/player would need to re-submit.
 */
export async function setPlayerRoundSkip(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
  actingMemberId: string;
  skipped: boolean;
}): Promise<void> {
  const { championshipRoundId, championshipPlayerId, actingMemberId, skipped } = params;

  await db.transaction(async (tx) => {
    const [round] = await tx
      .select({
        id: championshipRounds.id,
        status: championshipRounds.status,
        championshipId: championshipRounds.championshipId,
        roundNumber: championshipRounds.roundNumber,
      })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new RoundSkipError(`Championship round ${championshipRoundId} does not exist.`);
    }

    const targetMembership = await findGroupMembership(
      tx,
      championshipRoundId,
      championshipPlayerId
    );
    if (!targetMembership) {
      throw new RoundSkipError("This player is not paired for this round.");
    }

    const [actingMember] = await tx
      .select({ appRole: members.appRole })
      .from(members)
      .where(eq(members.id, actingMemberId))
      .limit(1);
    if (!actingMember) {
      throw new RoundSkipError(`Member ${actingMemberId} does not exist.`);
    }
    const isAdmin = actingMember.appRole === "ADMIN";

    if (targetMembership.groupStatus === "SUBMITTED" && !isAdmin) {
      throw new RoundSkipError(
        "This group has already submitted for this round — only an admin can change skip status now."
      );
    }

    if (!isAdmin) {
      const [actingPlayer] = await tx
        .select({ id: championshipPlayers.id })
        .from(championshipPlayers)
        .innerJoin(
          championshipRounds,
          eq(championshipRounds.championshipId, championshipPlayers.championshipId)
        )
        .where(
          and(
            eq(championshipRounds.id, championshipRoundId),
            eq(championshipPlayers.memberId, actingMemberId)
          )
        )
        .limit(1);

      const actingMembership = actingPlayer
        ? await findGroupMembership(tx, championshipRoundId, actingPlayer.id)
        : null;

      if (
        !actingMembership ||
        actingMembership.roundGroupId !== targetMembership.roundGroupId
      ) {
        throw new RoundSkipError(
          "Acting member does not belong to the same group as this player for this round."
        );
      }
    }

    await tx
      .update(roundGroupPlayers)
      .set({
        skippedRound: skipped,
        skippedRoundAt: skipped ? new Date() : null,
        skippedRoundByMemberId: skipped ? actingMemberId : null,
      })
      .where(eq(roundGroupPlayers.id, targetMembership.id));

    // Admin retroactively DQing an already-submitted player: strip
    // their score from everything that feeds standings/handicaps for
    // this round (see doc comment above).
    if (isAdmin && skipped) {
      await tx
        .delete(scorecardSubmissions)
        .where(
          and(
            eq(scorecardSubmissions.championshipRoundId, championshipRoundId),
            eq(scorecardSubmissions.championshipPlayerId, championshipPlayerId)
          )
        );

      const sourceRef = championshipPlayedRoundSourceRef({
        championshipId: round.championshipId,
        roundNumber: round.roundNumber,
        championshipPlayerId,
      });
      await tx.delete(playedRounds).where(eq(playedRounds.sourceRef, sourceRef));
    }
  });
}
