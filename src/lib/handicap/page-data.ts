import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema/members";
import { playedRounds } from "@/db/schema/rounds";
import { calculateHandicapForMember } from "@/lib/handicap/service";

export type HandicapListRow = {
  memberId: string;
  displayName: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  finalHandicap: number;
  roundedHandicap: number;
  capApplied: boolean;
};

/**
 * Read-only list of every ACTIVE member's current SCAR handicap, using
 * ONLY the existing `calculateHandicapForMember()` engine as the source
 * of truth — never recomputed here. Sorted handicap ascending, then
 * name, per the /handicaps page spec.
 */
export async function listActiveMemberHandicaps(): Promise<HandicapListRow[]> {
  const activeMembers = await db
    .select({
      id: members.id,
      displayName: members.displayName,
      membershipType: members.membershipType,
    })
    .from(members)
    .where(eq(members.status, "ACTIVE"))
    .orderBy(asc(members.displayName));

  const rows: HandicapListRow[] = await Promise.all(
    activeMembers.map(async (member) => {
      const result = await calculateHandicapForMember(member.id);
      return {
        memberId: member.id,
        displayName: member.displayName,
        membershipType: member.membershipType,
        finalHandicap: result.finalHandicap,
        roundedHandicap: result.roundedHandicap,
        capApplied: result.finalHandicap < result.roundedHandicap,
      };
    })
  );

  rows.sort((a, b) => {
    if (a.finalHandicap !== b.finalHandicap) return a.finalHandicap - b.finalHandicap;
    return a.displayName.localeCompare(b.displayName);
  });

  return rows;
}

export type CalculationRoundDisplay = {
  playedAt: string;
  courseName: string | null;
  grossScore: number;
  courseRating: number;
  slope: number;
  differential: number;
  isPadding: boolean;
  isUsedInLowest8: boolean;
};

export type HistoricalRoundDisplay = {
  id: string;
  playedAt: string;
  courseName: string;
  courseCity: string | null;
  grossScore: number;
  courseRating: number;
  slope: number;
  par: number | null;
};

export type HandicapDetail =
  | { state: "not-found" }
  | {
      state: "found";
      memberId: string;
      displayName: string;
      membershipType: "PERMANENT" | "ASSOCIATE";
      finalHandicap: number;
      rawAverageLowest8: number;
      roundedHandicap: number;
      maxHandicap: number;
      capApplied: boolean;
      actualRoundCount: number;
      paddingCount: number;
      calculationRounds: CalculationRoundDisplay[];
      historicalRounds: HistoricalRoundDisplay[];
    };

/**
 * Read-only full handicap detail for one member: runs the existing
 * engine once, then attaches display-only course-name lookups (the
 * engine itself only carries opaque round ids) and the member's actual
 * historical rounds newest-first. Never recalculates anything — every
 * numeric value here comes straight from
 * `HandicapCalculationResult`.
 */
export async function getMemberHandicapDetail(
  memberId: string
): Promise<HandicapDetail> {
  const [member] = await db
    .select({
      id: members.id,
      displayName: members.displayName,
      membershipType: members.membershipType,
      status: members.status,
    })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);

  if (!member || member.status !== "ACTIVE") {
    return { state: "not-found" };
  }

  const result = await calculateHandicapForMember(memberId);

  const historicalRows = await db
    .select()
    .from(playedRounds)
    .where(eq(playedRounds.memberId, memberId))
    .orderBy(asc(playedRounds.playedAt));

  const courseNameById = new Map(historicalRows.map((r) => [r.id, r.courseName]));

  // Padding rows all clone the same source round (same id), so "used"
  // status among them is tracked by count rather than by id.
  const paddingUsedCount = result.selectedLowest8.filter(
    (entry) => entry.round.isPadding
  ).length;
  let paddingUsedRemaining = paddingUsedCount;

  const allCalculationEntries = [
    ...result.differentials.filter((d) => !d.round.isPadding),
    ...result.differentials.filter((d) => d.round.isPadding),
  ];

  const calculationRounds: CalculationRoundDisplay[] = allCalculationEntries.map(
    (entry) => {
      let isUsed: boolean;
      if (entry.round.isPadding) {
        isUsed = paddingUsedRemaining > 0;
        if (isUsed) paddingUsedRemaining -= 1;
      } else {
        isUsed = result.selectedLowest8.some(
          (sel) => !sel.round.isPadding && sel.round.id === entry.round.id
        );
      }
      return {
        playedAt: entry.round.playedAt.toISOString(),
        courseName: courseNameById.get(entry.round.id) ?? null,
        grossScore: entry.round.grossScore,
        courseRating: entry.round.courseRating,
        slope: entry.round.slope,
        differential: entry.differential,
        isPadding: entry.round.isPadding,
        isUsedInLowest8: isUsed,
      };
    }
  );
  // Preserve chronological (most-recent-first) ordering for actual
  // rounds, followed by padding rows, matching how the engine builds
  // its calculation set.
  calculationRounds.sort((a, b) => {
    if (a.isPadding !== b.isPadding) return a.isPadding ? 1 : -1;
    if (a.isPadding && b.isPadding) return 0;
    return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
  });

  return {
    state: "found",
    memberId: member.id,
    displayName: member.displayName,
    membershipType: member.membershipType,
    finalHandicap: result.finalHandicap,
    rawAverageLowest8: result.rawAverageLowest8,
    roundedHandicap: result.roundedHandicap,
    maxHandicap: result.maxHandicap,
    capApplied: result.finalHandicap < result.roundedHandicap,
    actualRoundCount: result.actualRoundsUsed.length,
    paddingCount: result.paddingRoundsAdded.length,
    calculationRounds,
    historicalRounds: historicalRows
      .slice()
      .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
      .map((r) => ({
        id: r.id,
        playedAt: r.playedAt.toISOString(),
        courseName: r.courseName,
        courseCity: r.courseCity,
        grossScore: r.grossScore,
        courseRating: r.courseRating,
        slope: r.slope,
        par: r.par,
      })),
  };
}
