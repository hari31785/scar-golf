import "server-only";

import { and, eq, inArray, lt } from "drizzle-orm";
import { db, type DbTransaction } from "@/db";
import {
  championshipPlayers,
  championshipRounds,
  pairingGenerations,
  roundGroupPlayers,
  roundGroups,
  scorecardSubmissions,
} from "@/db/schema";
import { generateNetStandingsPairing, assignCarts, type NetStandingsParticipant } from "./pairing";

export class Round2to4PairingError extends Error {}

/** One participant's cumulative-net standing at the moment pairings were generated. */
export type StandingsEntry = {
  championshipPlayerId: string;
  cumulativeGross: number;
  completedRounds: number;
  frozenHandicap: number;
  cumulativeNet: number;
};

/**
 * Generates AND persists Rounds 2-4 pairings for a championship round,
 * using cumulative NET standings through all completed prior rounds.
 *
 * Cumulative net, per ACTIVE participant:
 *   cumulativeGross = sum of that player's submitted grossTotal across
 *     every championship round with roundNumber < target roundNumber
 *   completedRounds = count of those prior rounds
 *   cumulativeNet = cumulativeGross - (frozenHandicap * completedRounds)
 *
 * Ranking: lowest cumulativeNet = leader. Ties are broken deterministically
 * by ascending championshipPlayerId (stable-sorting participants by id
 * BEFORE handing them to the net-standings pairing engine guarantees this,
 * since that engine's sort is stable and only compares cumulativeNet).
 *
 * Leaders end up in the FINAL group — this is inherited unchanged from
 * `generateNetStandingsPairing` in ./pairing.ts (not modified here).
 *
 * Safeguards (all-or-nothing — thrown inside the transaction, so a
 * rejected attempt leaves zero partial writes):
 *  - target round must be 2, 3, or 4,
 *  - the immediately preceding round must be COMPLETE,
 *  - target round must not already have any round_groups,
 *  - every ACTIVE participant must have a non-null frozenHandicap,
 *  - every ACTIVE participant must have a submitted scorecard for EVERY
 *    prior round (missing data blocks generation rather than silently
 *    under-counting someone's standing).
 */
export async function generateAndPersistRound2to4Pairing(params: {
  championshipRoundId: string;
  generatedByMemberId?: string;
  tx?: DbTransaction;
}): Promise<{ groupIds: string[] }> {
  const { championshipRoundId, generatedByMemberId, tx: outerTx } = params;

  const run = async (tx: DbTransaction) => {
    const [round] = await tx
      .select({
        id: championshipRounds.id,
        roundNumber: championshipRounds.roundNumber,
        championshipId: championshipRounds.championshipId,
      })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, championshipRoundId))
      .limit(1);
    if (!round) {
      throw new Error(`Championship round ${championshipRoundId} does not exist.`);
    }
    if (round.roundNumber !== 2 && round.roundNumber !== 3 && round.roundNumber !== 4) {
      throw new Round2to4PairingError(
        `generateAndPersistRound2to4Pairing only applies to rounds 2-4 (got round ${round.roundNumber}).`
      );
    }

    const existingGroups = await tx
      .select({ id: roundGroups.id })
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, championshipRoundId))
      .limit(1);
    if (existingGroups.length > 0) {
      throw new Round2to4PairingError(
        "This round already has pairings — regeneration is not allowed. Use an explicit override flow instead."
      );
    }

    // All rounds of this championship with roundNumber strictly before
    // the target round — these must ALL be completed and scored.
    const priorRounds = await tx
      .select({
        id: championshipRounds.id,
        roundNumber: championshipRounds.roundNumber,
        status: championshipRounds.status,
      })
      .from(championshipRounds)
      .where(
        and(
          eq(championshipRounds.championshipId, round.championshipId),
          lt(championshipRounds.roundNumber, round.roundNumber)
        )
      );

    const immediatelyPreceding = priorRounds.find(
      (r) => r.roundNumber === round.roundNumber - 1
    );
    if (!immediatelyPreceding || immediatelyPreceding.status !== "COMPLETE") {
      throw new Round2to4PairingError(
        `Round ${round.roundNumber - 1} must be COMPLETE before Round ${round.roundNumber} pairings can be generated.`
      );
    }

    const allPlayers = await tx
      .select({
        id: championshipPlayers.id,
        participantStatus: championshipPlayers.participantStatus,
        frozenHandicap: championshipPlayers.frozenHandicap,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, round.championshipId));

    const activePlayers = allPlayers.filter((p) => p.participantStatus === "ACTIVE");
    if (activePlayers.length === 0) {
      throw new Round2to4PairingError(
        "Cannot generate pairings — there are no active participants."
      );
    }

    for (const player of activePlayers) {
      if (player.frozenHandicap === null) {
        throw new Round2to4PairingError(
          `Active participant ${player.id} has no frozenHandicap — cannot compute standings.`
        );
      }
    }

    const priorRoundIds = priorRounds.map((r) => r.id);
    const activePlayerIds = activePlayers.map((p) => p.id);

    const submissions =
      priorRoundIds.length > 0 && activePlayerIds.length > 0
        ? await tx
            .select({
              championshipPlayerId: scorecardSubmissions.championshipPlayerId,
              championshipRoundId: scorecardSubmissions.championshipRoundId,
              grossTotal: scorecardSubmissions.grossTotal,
            })
            .from(scorecardSubmissions)
            .where(
              and(
                inArray(scorecardSubmissions.championshipRoundId, priorRoundIds),
                inArray(scorecardSubmissions.championshipPlayerId, activePlayerIds)
              )
            )
        : [];

    const submissionsByPlayer = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const list = submissionsByPlayer.get(sub.championshipPlayerId) ?? [];
      list.push(sub);
      submissionsByPlayer.set(sub.championshipPlayerId, list);
    }

    const standings: StandingsEntry[] = [];
    for (const player of activePlayers) {
      const playerSubmissions = submissionsByPlayer.get(player.id) ?? [];
      if (playerSubmissions.length !== priorRoundIds.length) {
        throw new Round2to4PairingError(
          `Active participant ${player.id} is missing a submitted scorecard for at least one prior round — cannot compute standings.`
        );
      }
      const cumulativeGross = playerSubmissions.reduce((sum, s) => sum + s.grossTotal, 0);
      const completedRounds = playerSubmissions.length;
      const frozenHandicap = player.frozenHandicap!;
      const cumulativeNet = cumulativeGross - frozenHandicap * completedRounds;
      standings.push({
        championshipPlayerId: player.id,
        cumulativeGross,
        completedRounds,
        frozenHandicap,
        cumulativeNet,
      });
    }

    // Stable-sort by championshipPlayerId ascending FIRST so that the
    // (stable) sort inside generateNetStandingsPairing — which only
    // compares cumulativeNet — preserves this order as the deterministic
    // tiebreak for equal-net participants.
    standings.sort((a, b) =>
      a.championshipPlayerId < b.championshipPlayerId
        ? -1
        : a.championshipPlayerId > b.championshipPlayerId
          ? 1
          : 0
    );

    const netStandingsParticipants: NetStandingsParticipant[] = standings.map((s) => ({
      championshipPlayerId: s.championshipPlayerId,
      participantStatus: "ACTIVE",
      cumulativeNet: s.cumulativeNet,
    }));

    const groups = generateNetStandingsPairing(netStandingsParticipants);

    const groupIds: string[] = [];
    for (const [index, groupPlayerIds] of groups.entries()) {
      const [insertedGroup] = await tx
        .insert(roundGroups)
        .values({
          championshipRoundId,
          groupNumber: index + 1,
        })
        .returning({ id: roundGroups.id });

      groupIds.push(insertedGroup.id);

      const cartNumbers = assignCarts(groupPlayerIds);
      for (const [position, championshipPlayerId] of groupPlayerIds.entries()) {
        await tx.insert(roundGroupPlayers).values({
          roundGroupId: insertedGroup.id,
          championshipRoundId,
          championshipPlayerId,
          position: position + 1,
          cartNumber: cartNumbers[position],
        });
      }
    }

    await tx.insert(pairingGenerations).values({
      championshipRoundId,
      generationType: "NET_STANDINGS",
      generatedByMemberId: generatedByMemberId ?? null,
      standingsSnapshot: standings,
    });

    return { groupIds };
  };

  if (outerTx) {
    return run(outerTx);
  }
  return db.transaction(run);
}
