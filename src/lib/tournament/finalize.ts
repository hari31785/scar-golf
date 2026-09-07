import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db, type DbTransaction } from "@/db";
import {
  championships,
  championshipPlayers,
  championshipRounds,
  scorecardSubmissions,
} from "@/db/schema";
import { rankStandings } from "./leaderboard";

export class FinalizationError extends Error {}

/**
 * Finalizes a championship immediately after its Round 4 becomes
 * COMPLETE: computes final standings for every ACTIVE participant using
 * the SAME ranking rules as the read-only leaderboard (see
 * `rankStandings` in ./leaderboard.ts — not reimplemented here),
 * persists `championship_players.finalPosition` for every ACTIVE
 * participant, and — ONLY if there is a single, unique first-place
 * finisher — sets `championships.championMemberId` and transitions the
 * championship to COMPLETED.
 *
 * TIE AT FIRST PLACE: if two or more ACTIVE participants are tied for
 * position 1 (identical cumulativeNet AND cumulativeGross), this
 * function deliberately does NOT pick a winner. `finalPosition` is
 * still persisted for everyone (so the tie itself is visible in the
 * data), but `championMemberId` is left null and the championship
 * status is NOT changed to COMPLETED — it is left as-is (ACTIVE) so a
 * future Playoff Mode feature can resolve the tie and complete the
 * finalization. No new status value is introduced for this in-between
 * state; the existing enum (DRAFT/ACTIVE/COMPLETED/CANCELLED) already
 * expresses it adequately: "ACTIVE with all 4 rounds COMPLETE and no
 * champion yet" simply means "awaiting playoff."
 *
 * Must be called within the SAME transaction as the Round 4 final group
 * submission (see the optional `tx` parameter, following the same
 * composition pattern already used by `generateAndPersistRound2to4Pairing`
 * and `startChampionshipWithRound1Pairing`) so the final submission,
 * Round 4 COMPLETE transition, finalPosition writes, champion
 * assignment, and COMPLETED transition all succeed or roll back
 * together.
 */
export async function finalizeChampionship(params: {
  championshipId: string;
  tx?: DbTransaction;
}): Promise<{ uniqueWinnerMemberId: string | null }> {
  const { championshipId, tx: outerTx } = params;

  const run = async (tx: DbTransaction) => {
    const players = await tx
      .select({
        id: championshipPlayers.id,
        memberId: championshipPlayers.memberId,
        participantStatus: championshipPlayers.participantStatus,
        frozenHandicap: championshipPlayers.frozenHandicap,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));

    const activePlayers = players.filter(
      (p) => p.participantStatus === "ACTIVE"
    );
    if (activePlayers.length === 0) {
      throw new FinalizationError(
        "Cannot finalize — there are no active participants."
      );
    }

    const rounds = await tx
      .select({ id: championshipRounds.id })
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const roundIds = rounds.map((r) => r.id);

    const activePlayerIds = activePlayers.map((p) => p.id);
    const allSubmissions =
      roundIds.length > 0 && activePlayerIds.length > 0
        ? await tx
            .select({
              championshipPlayerId: scorecardSubmissions.championshipPlayerId,
              grossTotal: scorecardSubmissions.grossTotal,
            })
            .from(scorecardSubmissions)
            .where(inArray(scorecardSubmissions.championshipRoundId, roundIds))
        : [];

    const submissionsByPlayer = new Map<string, { grossTotal: number }[]>();
    for (const sub of allSubmissions) {
      if (!activePlayerIds.includes(sub.championshipPlayerId)) continue;
      const list = submissionsByPlayer.get(sub.championshipPlayerId) ?? [];
      list.push({ grossTotal: sub.grossTotal });
      submissionsByPlayer.set(sub.championshipPlayerId, list);
    }

    const rows = activePlayers.map((player) => {
      const playerSubmissions = submissionsByPlayer.get(player.id) ?? [];
      const completedRounds = playerSubmissions.length;
      const cumulativeGross = playerSubmissions.reduce(
        (sum, s) => sum + s.grossTotal,
        0
      );
      const cumulativeNet =
        completedRounds === 0
          ? 0
          : cumulativeGross - (player.frozenHandicap ?? 0) * completedRounds;

      return {
        championshipPlayerId: player.id,
        memberId: player.memberId,
        completedRounds,
        cumulativeGross,
        cumulativeNet,
      };
    });

    const ranked = rankStandings(rows);

    // Persist finalPosition for every ACTIVE participant.
    for (const row of ranked) {
      await tx
        .update(championshipPlayers)
        .set({ finalPosition: row.position })
        .where(eq(championshipPlayers.id, row.championshipPlayerId));
    }

    const firstPlaceRows = ranked.filter((r) => r.position === 1);
    const uniqueWinner =
      firstPlaceRows.length === 1 ? firstPlaceRows[0] : null;

    if (uniqueWinner) {
      await tx
        .update(championships)
        .set({
          championMemberId: uniqueWinner.memberId,
          status: "COMPLETED",
          updatedAt: new Date(),
        })
        .where(eq(championships.id, championshipId));

      return { uniqueWinnerMemberId: uniqueWinner.memberId };
    }

    // Tied first place: leave championMemberId null and status
    // unchanged (NOT COMPLETED) — awaiting a future Playoff Mode
    // feature to resolve the tie. finalPosition has already been
    // persisted above for all participants (including the tied ones).
    return { uniqueWinnerMemberId: null };
  };

  if (outerTx) {
    return run(outerTx);
  }
  return db.transaction(run);
}
