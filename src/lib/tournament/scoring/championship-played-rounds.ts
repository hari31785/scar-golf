import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { championshipRounds, playedRounds } from "@/db/schema";

/**
 * Bridges submitted/corrected championship scores into `played_rounds`
 * so they ultimately feed future handicap calculations (see
 * src/lib/handicap/service.ts, which simply reads every `played_rounds`
 * row for a member).
 *
 * ARCHITECTURE CHOICE — read this before changing this file:
 *
 * `played_rounds` was designed as an immutable historical ledger for
 * HISTORICAL_IMPORT rows (see the doc comment on that table) — those
 * rows must never be rewritten once imported. Championship-derived
 * rows are different in kind: they represent a LIVE, evolving
 * authoritative score (a group submission can later be corrected by an
 * admin — see src/lib/tournament/scoring/correction.ts), and the
 * product requirement is explicit that "future handicards reflect the
 * corrected final gross score" without creating duplicate rows.
 *
 * Rather than bolt on a second "current score" table (which the spec
 * explicitly asked us to avoid for hole_scores, and which would apply
 * equally poorly here), we chose: **CHAMPIONSHIP-sourced `played_rounds`
 * rows are explicitly reconcilable in place**, identified deterministically
 * by `sourceRef`, and updated via upsert (insert .. onConflictDoUpdate)
 * scoped to `source = 'CHAMPIONSHIP'`. This is a narrow, explicit
 * exception to the general immutability rule — HISTORICAL_IMPORT rows
 * are never touched by this function or any other code path, and this
 * function will never create/update a row with any other source.
 *
 * `sourceRef` format: `championship:<championshipId>:round:<roundNumber>:player:<championshipPlayerId>`
 * — fully deterministic, so retries (e.g. a submission retried after a
 * network blip) are always safe and never create duplicates.
 */
export function championshipPlayedRoundSourceRef(params: {
  championshipId: string;
  roundNumber: number;
  championshipPlayerId: string;
}): string {
  return `championship:${params.championshipId}:round:${params.roundNumber}:player:${params.championshipPlayerId}`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Idempotently creates or updates the `played_rounds` row derived from a
 * championship player's (now-complete) scorecard for one round. Must be
 * called within the same transaction as the group submission / admin
 * correction that produced the new `grossTotal`, so the historical
 * record and the authoritative championship score never diverge.
 */
export async function upsertChampionshipPlayedRound(
  tx: Tx,
  params: {
    memberId: string;
    championshipRoundId: string;
    championshipPlayerId: string;
    grossTotal: number;
  }
): Promise<void> {
  const { memberId, championshipRoundId, championshipPlayerId, grossTotal } =
    params;

  const [round] = await tx
    .select({
      championshipId: championshipRounds.championshipId,
      roundNumber: championshipRounds.roundNumber,
      playedDate: championshipRounds.playedDate,
      courseName: championshipRounds.courseName,
      courseCity: championshipRounds.courseCity,
      courseRating: championshipRounds.courseRating,
      slope: championshipRounds.slope,
      par: championshipRounds.par,
    })
    .from(championshipRounds)
    .where(eq(championshipRounds.id, championshipRoundId))
    .limit(1);

  if (!round) {
    throw new Error(
      `Championship round ${championshipRoundId} does not exist.`
    );
  }
  if (round.courseRating === null || round.slope === null) {
    throw new Error(
      `Championship round ${championshipRoundId} is missing course rating/slope — cannot record a played round.`
    );
  }

  const sourceRef = championshipPlayedRoundSourceRef({
    championshipId: round.championshipId,
    roundNumber: round.roundNumber,
    championshipPlayerId,
  });

  const playedAt = round.playedDate ?? new Date();

  await tx
    .insert(playedRounds)
    .values({
      memberId,
      playedAt,
      courseName: round.courseName ?? "SCAR Championship",
      courseCity: round.courseCity,
      grossScore: grossTotal,
      courseRating: round.courseRating,
      slope: round.slope,
      par: round.par,
      source: "CHAMPIONSHIP",
      importedAt: null,
      sourceRef,
    })
    .onConflictDoUpdate({
      target: playedRounds.sourceRef,
      set: {
        grossScore: grossTotal,
        playedAt,
        courseName: round.courseName ?? "SCAR Championship",
        courseCity: round.courseCity,
        courseRating: round.courseRating,
        slope: round.slope,
        par: round.par,
      },
    });
}
