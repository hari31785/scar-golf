import "server-only";

import { db, type DbTransaction } from "@/db";
import { championships, championshipPlayers, championshipRounds, members } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateHandicapForMember } from "@/lib/handicap/service";
import { validateRoundIsReadyToStart } from "@/lib/tournament/course-setup";

export class ChampionshipStartError extends Error {}


/**
 * Starts a DRAFT championship, transitioning it to ACTIVE.
 *
 * At start time, for every participant:
 *   1. The real `calculateHandicapForMember()` service is called (the
 *      same live handicap engine used everywhere else in the app — see
 *      src/lib/handicap/service.ts) and its `finalHandicap` (already
 *      ROUNDUP'd and capped) is stored in `championship_players.frozenHandicap`.
 *   2. The participant's current `members.membershipType` is snapshotted
 *      into `membershipTypeSnapshot`.
 *
 * From this point on, `frozenHandicap` must NEVER be recomputed
 * automatically — all 4 rounds are scored against this frozen value,
 * regardless of any later change to the member's live handicap.
 *
 * ATOMICITY: the entire operation (status check, participant check, all
 * handicap calculations, all snapshot writes, and the DRAFT -> ACTIVE
 * transition) runs inside a single DB transaction. If any single
 * participant's handicap calculation throws, the whole transaction is
 * rolled back — the championship remains DRAFT and no partial freezing
 * occurs.
 *
 * Round 1 pairings are NOT generated here — that is a separate concern
 * (see src/lib/tournament/round1-pairing-service.ts) so this function
 * stays focused solely on the DRAFT -> ACTIVE transition and handicap
 * freezing.
 *
 * Optionally accepts an OUTER caller-supplied transaction (`tx`) so a
 * caller that also needs to perform another write atomically alongside
 * this one (e.g. generating Round 1 pairings) can compose both into a
 * single database transaction — see
 * src/lib/admin/championship-actions.ts's `startChampionshipAction`.
 * When no `tx` is given, this function opens and manages its own
 * transaction exactly as before (fully backward compatible).
 */
export async function startChampionship(
  championshipId: string,
  tx?: DbTransaction
): Promise<void> {
  const run = async (tx: DbTransaction) => {
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
        `Cannot start championship — status is ${championship.status}, not DRAFT.`
      );
    }

    const rounds = await tx
      .select({ id: championshipRounds.id })
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));

    const roundProblems: string[] = [];
    for (const round of rounds) {
      roundProblems.push(...(await validateRoundIsReadyToStart(round.id)));
    }
    if (roundProblems.length > 0) {
      throw new ChampionshipStartError(
        `Cannot start championship — round setup is incomplete or invalid: ${roundProblems.join(" ")}`
      );
    }

    const participants = await tx
      .select({
        id: championshipPlayers.id,
        memberId: championshipPlayers.memberId,
        participantStatus: championshipPlayers.participantStatus,
      })
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));

    const activeParticipants = participants.filter(
      (p) => p.participantStatus === "ACTIVE"
    );

    if (activeParticipants.length === 0) {
      throw new Error(
        "Cannot start championship — there are no active participants."
      );
    }

    for (const participant of activeParticipants) {
      // Any throw here (including inside calculateHandicapForMember)
      // propagates out of this transaction callback, causing drizzle to
      // roll back everything done so far in this transaction — no
      // partial freezing is possible.
      const handicapResult = await calculateHandicapForMember(
        participant.memberId
      );

      const [member] = await tx
        .select({ membershipType: members.membershipType })
        .from(members)
        .where(eq(members.id, participant.memberId))
        .limit(1);

      if (!member) {
        throw new Error(
          `Member ${participant.memberId} not found while starting championship.`
        );
      }

      await tx
        .update(championshipPlayers)
        .set({
          frozenHandicap: handicapResult.finalHandicap,
          membershipTypeSnapshot: member.membershipType,
        })
        .where(eq(championshipPlayers.id, participant.id));
    }

    await tx
      .update(championships)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(eq(championships.id, championshipId));
  };

  if (tx) {
    await run(tx);
  } else {
    await db.transaction(run);
  }
}
