"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { championshipPlayers } from "@/db/schema";
import { getCurrentMember } from "@/lib/current-member";
import { getRoundHoleDetail, type RoundHoleDetail } from "@/lib/tournament/history";

export type RoundHoleDetailResult =
  | { ok: true; holes: RoundHoleDetail[] }
  | { ok: false; error: string };

/**
 * Loads the 18-hole breakdown for one of the CURRENT member's own
 * rounds, for the "Championships Played" drill-down's third level.
 *
 * Authorization: re-derives ownership server-side by checking the
 * requested `championshipPlayerId` actually belongs to the
 * authenticated member — never trusts the client-supplied id alone,
 * since this is called directly from a client component.
 */
export async function getRoundHoleDetailAction(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
}): Promise<RoundHoleDetailResult> {
  const current = await getCurrentMember();
  if (!current) {
    return { ok: false, error: "Not signed in." };
  }

  const [player] = await db
    .select({ memberId: championshipPlayers.memberId })
    .from(championshipPlayers)
    .where(eq(championshipPlayers.id, params.championshipPlayerId))
    .limit(1);

  if (!player || player.memberId !== current.member.id) {
    return { ok: false, error: "Not authorized to view this round." };
  }

  const holes = await getRoundHoleDetail(params);
  return { ok: true, holes };
}
