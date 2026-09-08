import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema/members";
import { playedRounds } from "@/db/schema/rounds";
import { calculateHandicapForMember } from "@/lib/handicap/service";
import { computeDifferential } from "@/lib/handicap/calculate";

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

export type MemberDirectoryRow = {
  memberId: string;
  displayName: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  appRole: "PLAYER" | "ADMIN";
  finalHandicap: number;
};

/**
 * Read-only member directory for the user-facing /members page. Lists
 * every ACTIVE member (regardless of whether they have an
 * authUserId/passkey yet), sorted by name. Handicap comes from the
 * same existing `calculateHandicapForMember()` engine used by
 * /handicaps — never recomputed here.
 */
export async function listMemberDirectory(): Promise<MemberDirectoryRow[]> {
  const activeMembers = await db
    .select({
      id: members.id,
      displayName: members.displayName,
      membershipType: members.membershipType,
      appRole: members.appRole,
    })
    .from(members)
    .where(eq(members.status, "ACTIVE"))
    .orderBy(asc(members.displayName));

  return Promise.all(
    activeMembers.map(async (member) => {
      const result = await calculateHandicapForMember(member.id);
      return {
        memberId: member.id,
        displayName: member.displayName,
        membershipType: member.membershipType,
        appRole: member.appRole,
        finalHandicap: result.finalHandicap,
      };
    })
  );
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
};export type HistoricalRoundDisplay = {
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

export type ImportedRoundDisplay = {
  id: string;
  memberId: string;
  displayName: string;
  playedAt: string;
  courseName: string;
  courseCity: string | null;
  grossScore: number;
  courseRating: number;
  slope: number;
  differential: number;
};

/**
 * Read-only list of every historically-imported played round (source
 * `HISTORICAL_IMPORT`, i.e. brought in from the legacy SCAR Excel
 * workbook), newest first, joined with the member's display name for
 * the /history page. Never recalculates handicaps — the differential
 * shown here is computed with the same pure, existing
 * `computeDifferential()` formula used by the handicap engine, applied
 * directly to each row's own snapshot values.
 */
export async function listImportedHistoricalRounds(): Promise<
  ImportedRoundDisplay[]
> {
  const rows = await db
    .select({
      id: playedRounds.id,
      memberId: playedRounds.memberId,
      displayName: members.displayName,
      playedAt: playedRounds.playedAt,
      courseName: playedRounds.courseName,
      courseCity: playedRounds.courseCity,
      grossScore: playedRounds.grossScore,
      courseRating: playedRounds.courseRating,
      slope: playedRounds.slope,
    })
    .from(playedRounds)
    .innerJoin(members, eq(playedRounds.memberId, members.id))
    .where(eq(playedRounds.source, "HISTORICAL_IMPORT"))
    .orderBy(desc(playedRounds.playedAt));

  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    displayName: r.displayName,
    playedAt: r.playedAt.toISOString(),
    courseName: r.courseName,
    courseCity: r.courseCity,
    grossScore: r.grossScore,
    courseRating: r.courseRating,
    slope: r.slope,
    differential: computeDifferential({
      grossScore: r.grossScore,
      courseRating: r.courseRating,
      slope: r.slope,
    }),
  }));
}

/**
 * ---------------------------------------------------------------------
 * Read-only presentation grouping for imported historical rounds.
 *
 * Historical imported data has no dedicated championship id, so these
 * pure functions build a HISTORY > CHAMPIONSHIP YEAR > COURSE/ROUND >
 * MEMBER hierarchy purely for display, from the same rows already
 * returned by `listImportedHistoricalRounds()`. Nothing here writes to
 * the database or invents a championship record — grouping key is
 * (playedAt, courseName, courseCity) so repeated plays at the same
 * course on different dates are never merged.
 * ---------------------------------------------------------------------
 */

function importedRoundGroupKey(r: ImportedRoundDisplay): string {
  return `${r.playedAt}|${r.courseName}|${r.courseCity ?? ""}`;
}

export type ImportedYearSummary = {
  year: number;
  label: string;
  /** Only set when every round that year shares the same city/state. */
  locationSummary: string | null;
  roundGroupCount: number;
};

/** Builds one card per championship year present in the imported data. */
export function buildImportedYearSummaries(
  rounds: ImportedRoundDisplay[]
): ImportedYearSummary[] {
  const byYear = new Map<number, ImportedRoundDisplay[]>();
  for (const r of rounds) {
    const year = new Date(r.playedAt).getFullYear();
    const list = byYear.get(year) ?? [];
    list.push(r);
    byYear.set(year, list);
  }

  const summaries: ImportedYearSummary[] = [];
  for (const [year, list] of byYear) {
    const cities = new Set(
      list.map((r) => r.courseCity).filter((c): c is string => !!c)
    );
    // Only claim a championship-level location when it's unambiguous —
    // never guess if a year spans multiple distinct locations.
    const locationSummary = cities.size === 1 ? [...cities][0] : null;
    const groupKeys = new Set(list.map(importedRoundGroupKey));
    summaries.push({
      year,
      label: `${year} SCAR Championship`,
      locationSummary,
      roundGroupCount: groupKeys.size,
    });
  }

  return summaries.sort((a, b) => b.year - a.year);
}

export type ImportedRoundGroupSummary = {
  /** Id of one representative `played_rounds` row for this course/round. */
  groupId: string;
  playedAt: string;
  courseName: string;
  courseCity: string | null;
  courseRating: number;
  slope: number;
  playerCount: number;
};

/** Builds one card per distinct course/round played in a given year. */
export function buildImportedRoundGroupsForYear(
  rounds: ImportedRoundDisplay[],
  year: number
): ImportedRoundGroupSummary[] {
  const yearRounds = rounds.filter(
    (r) => new Date(r.playedAt).getFullYear() === year
  );

  const groups = new Map<string, ImportedRoundDisplay[]>();
  for (const r of yearRounds) {
    const key = importedRoundGroupKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const summaries: ImportedRoundGroupSummary[] = [];
  for (const list of groups.values()) {
    const rep = list[0];
    summaries.push({
      groupId: rep.id,
      playedAt: rep.playedAt,
      courseName: rep.courseName,
      courseCity: rep.courseCity,
      courseRating: rep.courseRating,
      slope: rep.slope,
      playerCount: list.length,
    });
  }

  return summaries.sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
  );
}

export type ImportedRoundGroupDetail = {
  year: number;
  playedAt: string;
  courseName: string;
  courseCity: string | null;
  courseRating: number;
  slope: number;
  players: {
    roundId: string;
    memberId: string;
    displayName: string;
    grossScore: number;
    differential: number;
  }[];
};

/**
 * Finds every member's round for the same course/round identified by
 * `groupId` (one representative `played_rounds` row's id), sorted by
 * lowest gross first.
 */
export function buildImportedRoundGroupDetail(
  rounds: ImportedRoundDisplay[],
  groupId: string
): ImportedRoundGroupDetail | null {
  const rep = rounds.find((r) => r.id === groupId);
  if (!rep) return null;

  const key = importedRoundGroupKey(rep);
  const groupRows = rounds.filter((r) => importedRoundGroupKey(r) === key);

  const players = groupRows
    .map((r) => ({
      roundId: r.id,
      memberId: r.memberId,
      displayName: r.displayName,
      grossScore: r.grossScore,
      differential: r.differential,
    }))
    .sort((a, b) => a.grossScore - b.grossScore);

  return {
    year: new Date(rep.playedAt).getFullYear(),
    playedAt: rep.playedAt,
    courseName: rep.courseName,
    courseCity: rep.courseCity,
    courseRating: rep.courseRating,
    slope: rep.slope,
    players,
  };
}

/** Finds a single member's imported round by its `played_rounds` id. */
export function findImportedRoundById(
  rounds: ImportedRoundDisplay[],
  roundId: string
): ImportedRoundDisplay | null {
  return rounds.find((r) => r.id === roundId) ?? null;
}
