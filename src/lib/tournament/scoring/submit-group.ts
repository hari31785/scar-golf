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
  scorecardSubmissions,
  members,
} from "@/db/schema";
import {
  evaluateScorecardCompleteness,
  type HoleScoreEntry,
} from "./completeness";
import { evaluateRoundCompletion } from "@/lib/tournament/round-completion";
import { upsertChampionshipPlayedRound } from "./championship-played-rounds";
import { generateAndPersistRound2to4Pairing } from "@/lib/tournament/round2to4-pairing-service";
import { finalizeChampionship } from "@/lib/tournament/finalize";

export class GroupSubmissionError extends Error {}

/**
 * Transactionally submits one group's scorecard(s) for one championship
 * round.
 *
 * Rules (see module callers for the full product spec):
 *  - actor must belong to the group OR be ADMIN,
 *  - championship must be ACTIVE,
 *  - round must not already be COMPLETE,
 *  - the group must not already be SUBMITTED,
 *  - every ACTIVE participant assigned to this group must have a
 *    complete 18-hole scorecard (WITHDRAWN/DISQUALIFIED players in the
 *    group never block submission),
 *  - if any ACTIVE player is incomplete, NOTHING submits (the whole
 *    transaction throws and rolls back).
 *
 * On success: creates one `scorecard_submissions` row per ACTIVE player
 * in the group, marks the group SUBMITTED, records submittedAt/
 * submittedByMemberId, records the corresponding CHAMPIONSHIP
 * `played_rounds` row for each submitted player (idempotent — see
 * src/lib/tournament/scoring/championship-played-rounds.ts), and
 * finally evaluates whole-round completion using REAL scorecard
 * submissions (not just this group) — if every ACTIVE championship
 * participant now has a submitted complete scorecard, the round
 * transitions to COMPLETE.
 *
 * Idempotent: calling this again for an already-SUBMITTED group throws
 * (no duplicate rows, no double-processing).
 */
export async function submitRoundGroup(params: {
  roundGroupId: string;
  actingMemberId: string;
}): Promise<{ roundComplete: boolean }> {
  const { roundGroupId, actingMemberId } = params;

  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({
        id: roundGroups.id,
        status: roundGroups.status,
        championshipRoundId: roundGroups.championshipRoundId,
      })
      .from(roundGroups)
      .where(eq(roundGroups.id, roundGroupId))
      .limit(1);
    if (!group) {
      throw new Error(`Round group ${roundGroupId} does not exist.`);
    }
    if (group.status === "SUBMITTED") {
      throw new GroupSubmissionError("This group has already been submitted.");
    }

    const [round] = await tx
      .select({
        id: championshipRounds.id,
        status: championshipRounds.status,
        championshipId: championshipRounds.championshipId,
        roundNumber: championshipRounds.roundNumber,
      })
      .from(championshipRounds)
      .where(eq(championshipRounds.id, group.championshipRoundId))
      .limit(1);
    if (!round) {
      throw new Error(`Championship round ${group.championshipRoundId} does not exist.`);
    }
    if (round.status === "COMPLETE") {
      throw new GroupSubmissionError("This round is already COMPLETE.");
    }

    const [championship] = await tx
      .select({ status: championships.status })
      .from(championships)
      .where(eq(championships.id, round.championshipId))
      .limit(1);
    if (!championship || championship.status !== "ACTIVE") {
      throw new GroupSubmissionError("Championship is not ACTIVE.");
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

    const groupPlayers = await tx
      .select({
        championshipPlayerId: roundGroupPlayers.championshipPlayerId,
        memberId: championshipPlayers.memberId,
        participantStatus: championshipPlayers.participantStatus,
      })
      .from(roundGroupPlayers)
      .innerJoin(
        championshipPlayers,
        eq(championshipPlayers.id, roundGroupPlayers.championshipPlayerId)
      )
      .where(eq(roundGroupPlayers.roundGroupId, roundGroupId));

    if (!isAdmin) {
      const belongs = groupPlayers.some(
        (p) => p.memberId === actingMemberId
      );
      if (!belongs) {
        throw new GroupSubmissionError(
          "Acting member does not belong to this group and is not an admin."
        );
      }
    }

    const activePlayers = groupPlayers.filter(
      (p) => p.participantStatus === "ACTIVE"
    );

    // Load all hole scores for these active players in this round in one
    // query, then check completeness per-player.
    const incompletePlayerIds: string[] = [];
    const grossTotals = new Map<string, number>();

    for (const player of activePlayers) {
      const scores = await tx
        .select({
          holeNumber: holeScores.holeNumber,
          grossScore: holeScores.grossScore,
        })
        .from(holeScores)
        .where(
          and(
            eq(holeScores.championshipRoundId, round.id),
            eq(holeScores.championshipPlayerId, player.championshipPlayerId)
          )
        );

      const entries: HoleScoreEntry[] = scores;
      const completeness = evaluateScorecardCompleteness(entries);
      if (!completeness.isComplete || completeness.grossTotal === null) {
        incompletePlayerIds.push(player.championshipPlayerId);
      } else {
        grossTotals.set(player.championshipPlayerId, completeness.grossTotal);
      }
    }

    if (incompletePlayerIds.length > 0) {
      throw new GroupSubmissionError(
        `Cannot submit — the following active players have incomplete scorecards: ${incompletePlayerIds.join(", ")}`
      );
    }

    const now = new Date();

    for (const player of activePlayers) {
      const grossTotal = grossTotals.get(player.championshipPlayerId)!;

      const [existingSubmission] = await tx
        .select({ id: scorecardSubmissions.id })
        .from(scorecardSubmissions)
        .where(
          and(
            eq(scorecardSubmissions.championshipRoundId, round.id),
            eq(
              scorecardSubmissions.championshipPlayerId,
              player.championshipPlayerId
            )
          )
        )
        .limit(1);

      if (!existingSubmission) {
        await tx.insert(scorecardSubmissions).values({
          championshipRoundId: round.id,
          championshipPlayerId: player.championshipPlayerId,
          roundGroupId,
          submittedByMemberId: actingMemberId,
          submittedAt: now,
          grossTotal,
        });
      }

      await upsertChampionshipPlayedRound(tx, {
        memberId: player.memberId,
        championshipRoundId: round.id,
        championshipPlayerId: player.championshipPlayerId,
        grossTotal,
      });
    }

    await tx
      .update(roundGroups)
      .set({
        status: "SUBMITTED",
        submittedAt: now,
        submittedByMemberId: actingMemberId,
        updatedAt: now,
      })
      .where(eq(roundGroups.id, roundGroupId));

    // Evaluate whole-round completion using REAL scorecard submissions
    // across the ENTIRE championship (not just this group).
    const allParticipants = await tx
      .select({
        championshipPlayerId: championshipPlayers.id,
        participantStatus: championshipPlayers.participantStatus,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, round.championshipId));

    const allSubmissions = await tx
      .select({ championshipPlayerId: scorecardSubmissions.championshipPlayerId })
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.championshipRoundId, round.id));
    const submittedIds = new Set(
      allSubmissions.map((s) => s.championshipPlayerId)
    );

    const completion = evaluateRoundCompletion(allParticipants, (id) =>
      submittedIds.has(id)
    );

    if (completion.isComplete) {
      await tx
        .update(championshipRounds)
        .set({ status: "COMPLETE", updatedAt: now })
        .where(eq(championshipRounds.id, round.id));

      // Round 1 just became COMPLETE — automatically generate Round 2's
      // NET_STANDINGS pairings in this SAME transaction, so the whole
      // thing (final submission + round completion + Round 2 pairing
      // generation) succeeds or rolls back together.
      //
      // NOTE (scope of this change): Round 1 -> Round 2, Round 2 -> Round 3,
      // and Round 3 -> Round 4 are all handled here now. Round 4 has no
      // next round to generate.
      if (
        round.roundNumber === 1 ||
        round.roundNumber === 2 ||
        round.roundNumber === 3
      ) {
        const nextRoundNumber = round.roundNumber + 1;
        const [nextRound] = await tx
          .select({ id: championshipRounds.id })
          .from(championshipRounds)
          .where(
            and(
              eq(championshipRounds.championshipId, round.championshipId),
              eq(championshipRounds.roundNumber, nextRoundNumber)
            )
          )
          .limit(1);

        if (nextRound) {
          await generateAndPersistRound2to4Pairing({
            championshipRoundId: nextRound.id,
            tx,
          });
        }
      }

      // Round 4 just became COMPLETE — automatically finalize the
      // championship in this SAME transaction (final positions +
      // champion assignment + COMPLETED transition, or a left-as-ACTIVE
      // tie awaiting Playoff Mode — see finalizeChampionship's doc
      // comment). No further round/pairing generation applies here.
      if (round.roundNumber === 4) {
        await finalizeChampionship({
          championshipId: round.championshipId,
          tx,
        });
      }
    }

    return { roundComplete: completion.isComplete };
  });
}
