import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { playedRounds } from "@/db/schema/rounds";
import { getMaxHandicap } from "@/lib/settings";
import {
  calculateHandicap,
  type ActualRound,
  type HandicapCalculationResult,
} from "@/lib/handicap/calculate";

/**
 * Server-side entry point: loads a member's real played SCAR rounds and
 * runs them through the pure calculation engine (see
 * src/lib/handicap/calculate.ts).
 *
 * This is the ONLY place the app should ever call to get a member's
 * handicap — never recompute it in client/UI code.
 */
export async function calculateHandicapForMember(
  memberId: string
): Promise<HandicapCalculationResult> {
  const rows = await db
    .select()
    .from(playedRounds)
    .where(eq(playedRounds.memberId, memberId));

  const actualRounds: ActualRound[] = rows.map((row) => ({
    id: row.id,
    playedAt: row.playedAt,
    grossScore: row.grossScore,
    courseRating: row.courseRating,
    slope: row.slope,
  }));

  const maxHandicap = await getMaxHandicap();

  return calculateHandicap(actualRounds, { maxHandicap });
}
