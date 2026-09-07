import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipPlayers,
  championshipRounds,
  scorecardSubmissions,
  members,
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
