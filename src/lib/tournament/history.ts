import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipPlayers,
  championshipRounds,
  championshipRoundHoles,
  holeScores,
  scorecardSubmissions,
  members,
  playedRounds,
} from "@/db/schema";

/** One card's worth of summary data for the /history list. */
export type HistoryChampionshipSummary = {
  championshipId: string;
  year: number;
  name: string;
  championDisplayName: string | null;
  startDate: string | null;
  endDate: string | null;
  participantCount: number;
  /**
   * A short comma-free summary of the distinct course names/cities used
   * across this championship's rounds (e.g. "Pebble Beach, Spyglass
   * Hill"), or null if no round has a course snapshot recorded.
   */
  locationSummary: string | null;
};

/**
 * Counts distinct championship YEARS a member has actually played,
 * counting only:
 *   - real in-app championships that have reached COMPLETED status
 *     (an ACTIVE/DRAFT/in-progress championship is deliberately
 *     excluded — it hasn't finished, so it shouldn't count as "played"
 *     yet), and
 *   - years present in their imported historical rounds
 *     (`played_rounds` with source = HISTORICAL_IMPORT), which cover
 *     championships played before this app existed.
 *
 * Deduplicates by YEAR (not by row) so a year that has both an
 * imported round and a real completed championship record is only
 * counted once.
 */
export async function getChampionshipsPlayedCountForMember(
  memberId: string
): Promise<number> {
  const completedChampionshipRows = await db
    .select({ year: championships.year })
    .from(championshipPlayers)
    .innerJoin(championships, eq(championships.id, championshipPlayers.championshipId))
    .where(
      and(
        eq(championshipPlayers.memberId, memberId),
        eq(championships.status, "COMPLETED")
      )
    );

  const historicalRows = await db
    .select({ playedAt: playedRounds.playedAt })
    .from(playedRounds)
    .where(
      and(
        eq(playedRounds.memberId, memberId),
        eq(playedRounds.source, "HISTORICAL_IMPORT")
      )
    );

  const years = new Set<number>();
  for (const row of completedChampionshipRows) years.add(row.year);
  for (const row of historicalRows) years.add(new Date(row.playedAt).getFullYear());

  return years.size;
}

/**
 * Lists all COMPLETED championships, newest year first. Read-only —
 * does not touch scoring/finalization data.
 */
export async function listCompletedChampionships(): Promise<
  HistoryChampionshipSummary[]
> {
  const completed = await db
    .select({
      id: championships.id,
      year: championships.year,
      name: championships.name,
      startDate: championships.startDate,
      endDate: championships.endDate,
      championMemberId: championships.championMemberId,
    })
    .from(championships)
    .where(eq(championships.status, "COMPLETED"))
    .orderBy(desc(championships.year));

  if (completed.length === 0) return [];

  const championshipIds = completed.map((c) => c.id);

  const allPlayers = await db
    .select({
      championshipId: championshipPlayers.championshipId,
      participantStatus: championshipPlayers.participantStatus,
    })
    .from(championshipPlayers)
    .where(inArray(championshipPlayers.championshipId, championshipIds));

  const participantCountByChampionship = new Map<string, number>();
  for (const p of allPlayers) {
    if (p.participantStatus !== "ACTIVE") continue;
    participantCountByChampionship.set(
      p.championshipId,
      (participantCountByChampionship.get(p.championshipId) ?? 0) + 1
    );
  }

  const allRounds = await db
    .select({
      championshipId: championshipRounds.championshipId,
      courseName: championshipRounds.courseName,
      courseCity: championshipRounds.courseCity,
    })
    .from(championshipRounds)
    .where(inArray(championshipRounds.championshipId, championshipIds));

  const locationsByChampionship = new Map<string, string[]>();
  for (const r of allRounds) {
    if (!r.courseName) continue;
    const label = r.courseCity ? `${r.courseName} (${r.courseCity})` : r.courseName;
    const list = locationsByChampionship.get(r.championshipId) ?? [];
    if (!list.includes(label)) list.push(label);
    locationsByChampionship.set(r.championshipId, list);
  }

  const championMemberIds = completed
    .map((c) => c.championMemberId)
    .filter((id): id is string => id !== null);
  const championMembers =
    championMemberIds.length > 0
      ? await db
          .select({ id: members.id, displayName: members.displayName })
          .from(members)
          .where(inArray(members.id, championMemberIds))
      : [];
  const championDisplayNameById = new Map(
    championMembers.map((m) => [m.id, m.displayName])
  );

  return completed.map((c) => ({
    championshipId: c.id,
    year: c.year,
    name: c.name,
    championDisplayName: c.championMemberId
      ? (championDisplayNameById.get(c.championMemberId) ?? null)
      : null,
    startDate: c.startDate ? c.startDate.toISOString() : null,
    endDate: c.endDate ? c.endDate.toISOString() : null,
    participantCount: participantCountByChampionship.get(c.id) ?? 0,
    locationSummary:
      (locationsByChampionship.get(c.id) ?? []).join(", ") || null,
  }));
}

/** One row of the final standings table for a completed championship. */
export type HistoryStandingRow = {
  championshipPlayerId: string;
  memberId: string;
  displayName: string;
  finalPosition: number | null;
  frozenHandicap: number | null;
  cumulativeGross: number;
  cumulativeNet: number;
};

/** One round/course snapshot row for a completed championship. */
export type HistoryRoundRow = {
  roundNumber: number;
  courseName: string | null;
  courseCity: string | null;
  teeName: string | null;
  teeColor: string | null;
  courseRating: number | null;
  slope: number | null;
  par: number | null;
  yardage: number | null;
  playedDate: string | null;
};

export type HistoryChampionshipDetail =
  | { state: "not-found" }
  | {
      state: "found";
      championshipId: string;
      year: number;
      name: string;
      championDisplayName: string | null;
      standings: HistoryStandingRow[];
      rounds: HistoryRoundRow[];
    };

/**
 * Full detail for one COMPLETED championship: final standings (using
 * the persisted `finalPosition` — never recalculated here) and the 4
 * frozen round/course snapshots, in round-number order.
 *
 * Read-only. Does not recompute finalPosition, frozenHandicap, or any
 * course data — everything shown is exactly what was persisted at
 * finalization/round-setup time.
 */
export async function getChampionshipHistoryDetail(
  championshipId: string
): Promise<HistoryChampionshipDetail> {
  const [championship] = await db
    .select({
      id: championships.id,
      year: championships.year,
      name: championships.name,
      status: championships.status,
      championMemberId: championships.championMemberId,
    })
    .from(championships)
    .where(eq(championships.id, championshipId))
    .limit(1);

  if (!championship || championship.status !== "COMPLETED") {
    return { state: "not-found" };
  }

  const players = await db
    .select({
      id: championshipPlayers.id,
      memberId: championshipPlayers.memberId,
      participantStatus: championshipPlayers.participantStatus,
      frozenHandicap: championshipPlayers.frozenHandicap,
      finalPosition: championshipPlayers.finalPosition,
    })
    .from(championshipPlayers)
    .where(eq(championshipPlayers.championshipId, championshipId));

  const activePlayers = players.filter((p) => p.participantStatus === "ACTIVE");

  const rounds = await db
    .select({ id: championshipRounds.id })
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));
  const roundIds = rounds.map((r) => r.id);

  const activePlayerIds = activePlayers.map((p) => p.id);
  const allSubmissions =
    roundIds.length > 0 && activePlayerIds.length > 0
      ? await db
          .select({
            championshipPlayerId: scorecardSubmissions.championshipPlayerId,
            grossTotal: scorecardSubmissions.grossTotal,
          })
          .from(scorecardSubmissions)
          .where(inArray(scorecardSubmissions.championshipRoundId, roundIds))
      : [];

  const submissionsByPlayer = new Map<string, number[]>();
  for (const sub of allSubmissions) {
    if (!activePlayerIds.includes(sub.championshipPlayerId)) continue;
    const list = submissionsByPlayer.get(sub.championshipPlayerId) ?? [];
    list.push(sub.grossTotal);
    submissionsByPlayer.set(sub.championshipPlayerId, list);
  }

  const memberIds = activePlayers.map((p) => p.memberId);
  const memberRows =
    memberIds.length > 0
      ? await db
          .select({ id: members.id, displayName: members.displayName })
          .from(members)
          .where(inArray(members.id, memberIds))
      : [];
  const displayNameByMemberId = new Map(
    memberRows.map((m) => [m.id, m.displayName])
  );

  const standings: HistoryStandingRow[] = activePlayers
    .map((player) => {
      const grossScores = submissionsByPlayer.get(player.id) ?? [];
      const completedRounds = grossScores.length;
      const cumulativeGross = grossScores.reduce((sum, g) => sum + g, 0);
      const cumulativeNet =
        completedRounds === 0
          ? 0
          : cumulativeGross - (player.frozenHandicap ?? 0) * completedRounds;

      return {
        championshipPlayerId: player.id,
        memberId: player.memberId,
        displayName: displayNameByMemberId.get(player.memberId) ?? "Unknown",
        // Prefer the persisted finalPosition (set at finalization time)
        // — never recomputed here.
        finalPosition: player.finalPosition,
        frozenHandicap: player.frozenHandicap,
        cumulativeGross,
        cumulativeNet,
      };
    })
    // Sort by persisted finalPosition when present (nulls last), purely
    // for stable/sensible display order — does not alter any stored
    // value.
    .sort((a, b) => {
      if (a.finalPosition === null && b.finalPosition === null) return 0;
      if (a.finalPosition === null) return 1;
      if (b.finalPosition === null) return -1;
      return a.finalPosition - b.finalPosition;
    });

  const roundRows = await db
    .select({
      roundNumber: championshipRounds.roundNumber,
      courseName: championshipRounds.courseName,
      courseCity: championshipRounds.courseCity,
      teeName: championshipRounds.teeName,
      teeColor: championshipRounds.teeColor,
      courseRating: championshipRounds.courseRating,
      slope: championshipRounds.slope,
      par: championshipRounds.par,
      yardage: championshipRounds.yardage,
      playedDate: championshipRounds.playedDate,
    })
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId))
    .orderBy(asc(championshipRounds.roundNumber));

  return {
    state: "found",
    championshipId: championship.id,
    year: championship.year,
    name: championship.name,
    championDisplayName: championship.championMemberId
      ? (displayNameByMemberId.get(championship.championMemberId) ?? null)
      : null,
    standings,
    rounds: roundRows.map((r) => ({
      roundNumber: r.roundNumber,
      courseName: r.courseName,
      courseCity: r.courseCity,
      teeName: r.teeName,
      teeColor: r.teeColor,
      courseRating: r.courseRating,
      slope: r.slope,
      par: r.par,
      yardage: r.yardage,
      playedDate: r.playedDate ? r.playedDate.toISOString() : null,
    })),
  };
}

/** One round's worth of drill-down detail inside a played year. */
export type MemberYearRoundDetail = {
  roundNumber: number;
  courseName: string | null;
  courseCity: string | null;
  score: number;
  playedDate: string | null;
  /**
   * Present only for real, in-app rounds (never for imported historical
   * rows) — lets the UI fetch the hole-by-hole breakdown on demand via
   * `getRoundHoleDetailAction`. Null means "detailed score is
   * unavailable for this round" (e.g. a historical/workbook import).
   */
  championshipRoundId: string | null;
  championshipPlayerId: string | null;
};

/**
 * One year a member actually played, for the "Championships Played"
 * drill-down modal on the dashboard. Mirrors the same COMPLETED-only +
 * historical-import rule as `getChampionshipsPlayedCountForMember` —
 * this is the detail view behind that same stat, so the two must never
 * drift apart.
 *
 * `cumulativeScore` is:
 *   - net (gross - frozenHandicap * roundsPlayed) for a real COMPLETED
 *     championship, matching how the leaderboard/history pages already
 *     define "net" everywhere else, or
 *   - gross (plain sum of recorded scores) for an imported historical
 *     year, since those rows have no per-round handicap context.
 * `scoreType` tells the UI which one it's showing so it's never
 * mislabeled.
 */
export type MemberChampionshipYear = {
  year: number;
  championshipId: string | null;
  championshipName: string | null;
  scoreType: "net" | "gross";
  cumulativeScore: number;
  roundsPlayed: number;
  rounds: MemberYearRoundDetail[];
};

/**
 * Full "Championships Played" drill-down for one member: every year
 * they played (COMPLETED real championships + imported historical
 * years), newest first, each with its per-round breakdown ready to
 * render in a modal without further round-trips.
 *
 * Read-only, no writes. Deliberately excludes DRAFT/ACTIVE
 * championships — same rule as the summary count.
 */
export async function getMemberChampionshipYears(
  memberId: string
): Promise<MemberChampionshipYear[]> {
  // --- Real, COMPLETED championships this member has a player row for ---
  const completedPlayers = await db
    .select({
      championshipPlayerId: championshipPlayers.id,
      championshipId: championships.id,
      year: championships.year,
      name: championships.name,
      frozenHandicap: championshipPlayers.frozenHandicap,
    })
    .from(championshipPlayers)
    .innerJoin(championships, eq(championships.id, championshipPlayers.championshipId))
    .where(
      and(
        eq(championshipPlayers.memberId, memberId),
        eq(championships.status, "COMPLETED")
      )
    );

  const championshipPlayerIds = completedPlayers.map((p) => p.championshipPlayerId);
  const championshipIds = completedPlayers.map((p) => p.championshipId);

  const submissions =
    championshipPlayerIds.length > 0
      ? await db
          .select({
            championshipPlayerId: scorecardSubmissions.championshipPlayerId,
            championshipRoundId: scorecardSubmissions.championshipRoundId,
            grossTotal: scorecardSubmissions.grossTotal,
          })
          .from(scorecardSubmissions)
          .where(
            inArray(scorecardSubmissions.championshipPlayerId, championshipPlayerIds)
          )
      : [];

  // Round number + course/date info for every round belonging to any of
  // this member's completed championships, keyed by round id (what a
  // submission actually references).
  const roundIdToInfo = new Map(
    championshipIds.length > 0
      ? (
          await db
            .select({
              id: championshipRounds.id,
              championshipId: championshipRounds.championshipId,
              roundNumber: championshipRounds.roundNumber,
              courseName: championshipRounds.courseName,
              courseCity: championshipRounds.courseCity,
              playedDate: championshipRounds.playedDate,
            })
            .from(championshipRounds)
            .where(inArray(championshipRounds.championshipId, championshipIds))
        ).map((r) => [r.id, r] as const)
      : []
  );

  const submissionsByPlayer = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    const list = submissionsByPlayer.get(sub.championshipPlayerId) ?? [];
    list.push(sub);
    submissionsByPlayer.set(sub.championshipPlayerId, list);
  }

  const completedYears: MemberChampionshipYear[] = completedPlayers.map((p) => {
    const playerSubmissions = submissionsByPlayer.get(p.championshipPlayerId) ?? [];
    const rounds: MemberYearRoundDetail[] = playerSubmissions
      .map((sub) => {
        const info = roundIdToInfo.get(sub.championshipRoundId);
        return {
          roundNumber: info?.roundNumber ?? 0,
          courseName: info?.courseName ?? null,
          courseCity: info?.courseCity ?? null,
          score: sub.grossTotal,
          playedDate: info?.playedDate ? info.playedDate.toISOString() : null,
          championshipRoundId: sub.championshipRoundId,
          championshipPlayerId: p.championshipPlayerId,
        };
      })
      .sort((a, b) => a.roundNumber - b.roundNumber);

    const roundsPlayed = rounds.length;
    const cumulativeGross = rounds.reduce((sum, r) => sum + r.score, 0);
    const cumulativeNet =
      roundsPlayed === 0
        ? 0
        : cumulativeGross - (p.frozenHandicap ?? 0) * roundsPlayed;

    return {
      year: p.year,
      championshipId: p.championshipId,
      championshipName: p.name,
      scoreType: "net" as const,
      cumulativeScore: cumulativeNet,
      roundsPlayed,
      rounds,
    };
  });

  // --- Imported historical years (pre-app rounds) ---
  const historicalRows = await db
    .select({
      playedAt: playedRounds.playedAt,
      courseName: playedRounds.courseName,
      courseCity: playedRounds.courseCity,
      grossScore: playedRounds.grossScore,
    })
    .from(playedRounds)
    .where(
      and(
        eq(playedRounds.memberId, memberId),
        eq(playedRounds.source, "HISTORICAL_IMPORT")
      )
    );

  const historicalByYear = new Map<number, typeof historicalRows>();
  for (const row of historicalRows) {
    const year = new Date(row.playedAt).getFullYear();
    const list = historicalByYear.get(year) ?? [];
    list.push(row);
    historicalByYear.set(year, list);
  }

  const completedYearSet = new Set(completedYears.map((y) => y.year));

  const historicalYears: MemberChampionshipYear[] = Array.from(
    historicalByYear.entries()
  )
    // A year already covered by a real COMPLETED championship keeps that
    // record as authoritative — never show a duplicate entry for the
    // same year.
    .filter(([year]) => !completedYearSet.has(year))
    .map(([year, rows]) => {
      const sortedRows = [...rows].sort(
        (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
      );
      const rounds: MemberYearRoundDetail[] = sortedRows.map((row, index) => ({
        roundNumber: index + 1,
        courseName: row.courseName,
        courseCity: row.courseCity,
        score: row.grossScore,
        playedDate: new Date(row.playedAt).toISOString(),
        championshipRoundId: null,
        championshipPlayerId: null,
      }));
      const cumulativeGross = rounds.reduce((sum, r) => sum + r.score, 0);

      return {
        year,
        championshipId: null,
        championshipName: null,
        scoreType: "gross" as const,
        cumulativeScore: cumulativeGross,
        roundsPlayed: rounds.length,
        rounds,
      };
    });

  return [...completedYears, ...historicalYears].sort((a, b) => b.year - a.year);
}

/** One hole's worth of detail for the round drill-down modal. */
export type RoundHoleDetail = {
  holeNumber: number;
  par: number | null;
  strokeIndex: number | null;
  grossScore: number;
};

/**
 * Read-only 18-hole breakdown for one member's round, for the
 * "Championships Played" drill-down's third level. Only ever called
 * for real in-app rounds (the caller must have a non-null
 * `championshipRoundId`/`championshipPlayerId` from
 * `getMemberChampionshipYears` — historical/imported rounds never have
 * hole-level data and must show the "unavailable" message client-side
 * instead of calling this).
 *
 * Returns an empty array if no hole scores are recorded (defensive —
 * shouldn't happen for a submitted round, but never throws).
 */
export async function getRoundHoleDetail(params: {
  championshipRoundId: string;
  championshipPlayerId: string;
}): Promise<RoundHoleDetail[]> {
  const { championshipRoundId, championshipPlayerId } = params;

  const [scores, holeInfoRows] = await Promise.all([
    db
      .select({
        holeNumber: holeScores.holeNumber,
        grossScore: holeScores.grossScore,
      })
      .from(holeScores)
      .where(
        and(
          eq(holeScores.championshipRoundId, championshipRoundId),
          eq(holeScores.championshipPlayerId, championshipPlayerId)
        )
      )
      .orderBy(asc(holeScores.holeNumber)),
    db
      .select({
        holeNumber: championshipRoundHoles.holeNumber,
        par: championshipRoundHoles.par,
        strokeIndex: championshipRoundHoles.strokeIndex,
      })
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId)),
  ]);

  const holeInfoByNumber = new Map(
    holeInfoRows.map((h) => [h.holeNumber, h])
  );

  return scores.map((s) => {
    const info = holeInfoByNumber.get(s.holeNumber);
    return {
      holeNumber: s.holeNumber,
      par: info?.par ?? null,
      strokeIndex: info?.strokeIndex ?? null,
      grossScore: s.grossScore,
    };
  });
}
