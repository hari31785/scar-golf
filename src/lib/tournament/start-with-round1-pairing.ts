import "server-only";

import { db } from "@/db";
import { startChampionship } from "@/lib/tournament/start";
import { generateAndPersistRound1Pairing } from "@/lib/tournament/round1-pairing-service";
import { championshipRounds } from "@/db/schema/championship-rounds";
import { roundGroups } from "@/db/schema/round-groups";
import { eq, and } from "drizzle-orm";

/**
 * Atomically starts a DRAFT championship AND ensures its Round 1
 * pairings exist, in ONE database transaction.
 *
 * Composes two existing, unmodified-in-behavior services —
 * `startChampionship` (handicap freezing + membership snapshot +
 * DRAFT -> ACTIVE transition) and `generateAndPersistRound1Pairing`
 * (Round 1 group generation/persistence) — by passing both the SAME
 * outer transaction. Neither service's own business logic/validation
 * is duplicated or reimplemented here.
 *
 * If the admin already generated Round 1 pairings ahead of time (see
 * `generateRound1PairingAction`), this skips regeneration entirely —
 * `generateAndPersistRound1Pairing` itself refuses to regenerate once
 * groups exist, so we check for that here first and simply return the
 * existing group ids instead of throwing.
 *
 * If either step throws (e.g. round setup invalid, no active
 * participants, or Round 1 pairing generation fails for any reason),
 * the whole transaction rolls back: the championship remains DRAFT and
 * no Round 1 groups are persisted. There is no possible state where the
 * championship is ACTIVE with no Round 1 pairings.
 */
export async function startChampionshipWithRound1Pairing(params: {
  championshipId: string;
  generatedByMemberId?: string;
}): Promise<{ groupIds: string[] }> {
  const { championshipId, generatedByMemberId } = params;

  return db.transaction(async (tx) => {
    await startChampionship(championshipId, tx);

    const [round1] = await tx
      .select({ id: championshipRounds.id })
      .from(championshipRounds)
      .where(
        and(
          eq(championshipRounds.championshipId, championshipId),
          eq(championshipRounds.roundNumber, 1)
        )
      )
      .limit(1);
    if (!round1) {
      throw new Error(`Championship ${championshipId} has no round 1.`);
    }

    const existingGroups = await tx
      .select({ id: roundGroups.id })
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, round1.id));
    if (existingGroups.length > 0) {
      return { groupIds: existingGroups.map((g) => g.id) };
    }

    return generateAndPersistRound1Pairing({
      championshipRoundId: round1.id,
      generatedByMemberId,
      tx,
    });
  });
}

