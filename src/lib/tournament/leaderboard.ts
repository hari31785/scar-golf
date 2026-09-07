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

/** One row of the read-only leaderboard for a championship. */
export type LeaderboardEntry = {
  championshipPlayerId: string;
  memberId: string;
  frozenHandicap: number | null;
  completedRounds: number;
  cumulativeGross: number;
  cumulativeNet: number;
  position: number;
};

/**
 * Builds a read-only leaderboard for one championship, from submitted
 * scorecards only. Purely a query/aggregation service — does not write
 * anything.
 *
 * Per ACTIVE participant:
 *   completedRounds = number of championship rounds with a submitted
 *     scorecard for that player
 *   cumulativeGross = sum of submitted grossTotal
 *   cumulativeNet = cumulativeGross - (frozenHandicap * completedRounds)
 *
 * WITHDRAWN/DISQUALIFIED participants never appear.
 *
 * Sort order:
 *   1. players with completedRounds > 0 come before players with
 *      completedRounds === 0 (so someone who hasn't played yet never
 *      outranks anyone who has, since a 0/0/0 line isn't a real score),
 *   2. within each of those two buckets: lowest cumulativeNet first,
 *      then lowest cumulativeGross, then championshipPlayerId
 *      ascending (deterministic tiebreak with no ranking effect).
 *
 * Position uses competition ranking ("1,1,3"): two players tie for the
 * same position only if BOTH cumulativeNet AND cumulativeGross are
 * identical; the next distinct score's position skips ahead by the
 * number of players tied ahead of it. Zero-round players are ranked
 * within their own bucket the same way (they will typically all tie at
 * whatever position their bucket starts at, since they all show 0/0).
 */

/**
 * A ranking input row — the minimum fields needed to apply the
 * championship's competition-ranking rules (used by both the read-only
 * leaderboard below and championship finalization — see
 * src/lib/tournament/finalize.ts — so the ranking math is never
 * duplicated).
 */
export type StandingsRow = {
  championshipPlayerId: string;
  completedRounds: number;
  cumulativeGross: number;
  cumulativeNet: number;
};

/**
 * Sorts and assigns competition-ranking ("1,1,3") positions to a set of
 * standings rows, using the SAME rules everywhere they matter for this
 * championship:
 *   1. players with completedRounds > 0 come before players with
 *      completedRounds === 0,
 *   2. within each of those two buckets: lowest cumulativeNet first,
 *      then lowest cumulativeGross, then championshipPlayerId ascending
 *      (deterministic tiebreak with no ranking effect),
 *   3. two players tie for the same position only if BOTH
 *      cumulativeNet AND cumulativeGross are identical.
 *
 * Pure function — no I/O. Does not mutate the input array.
 */
export function rankStandings<T extends StandingsRow>(
  rows: T[]
): (T & { position: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const aHasPlayed = a.completedRounds > 0;
    const bHasPlayed = b.completedRounds > 0;
    if (aHasPlayed !== bHasPlayed) return aHasPlayed ? -1 : 1;
    if (a.cumulativeNet !== b.cumulativeNet) return a.cumulativeNet - b.cumulativeNet;
    if (a.cumulativeGross !== b.cumulativeGross) return a.cumulativeGross - b.cumulativeGross;
    return a.championshipPlayerId < b.championshipPlayerId
      ? -1
      : a.championshipPlayerId > b.championshipPlayerId
        ? 1
        : 0;
  });

  const result: (T & { position: number })[] = [];
  let currentPosition = 0;
  let rank = 0;
  let prevNet: number | null = null;
  let prevGross: number | null = null;
  for (const row of sorted) {
    rank += 1;
    if (prevNet === null || row.cumulativeNet !== prevNet || row.cumulativeGross !== prevGross) {
      currentPosition = rank;
    }
    prevNet = row.cumulativeNet;
    prevGross = row.cumulativeGross;
    result.push({ ...row, position: currentPosition });
  }

  return result;
}

export async function getChampionshipLeaderboard(
  championshipId: string
): Promise<LeaderboardEntry[]> {
  const players = await db
    .select({
      id: championshipPlayers.id,
      memberId: championshipPlayers.memberId,
      participantStatus: championshipPlayers.participantStatus,
      frozenHandicap: championshipPlayers.frozenHandicap,
    })
    .from(championshipPlayers)
    .where(eq(championshipPlayers.championshipId, championshipId));

  const activePlayers = players.filter((p) => p.participantStatus === "ACTIVE");
  if (activePlayers.length === 0) return [];

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
            championshipRoundId: scorecardSubmissions.championshipRoundId,
            grossTotal: scorecardSubmissions.grossTotal,
          })
          .from(scorecardSubmissions)
          .where(
            inArray(scorecardSubmissions.championshipRoundId, roundIds)
          )
      : [];

  const submissionsByPlayer = new Map<string, { grossTotal: number }[]>();
  for (const sub of allSubmissions) {
    if (!activePlayerIds.includes(sub.championshipPlayerId)) continue;
    const list = submissionsByPlayer.get(sub.championshipPlayerId) ?? [];
    list.push({ grossTotal: sub.grossTotal });
    submissionsByPlayer.set(sub.championshipPlayerId, list);
  }

  const rows = activePlayers.map((player) => {
    const playerSubmissions = submissionsByPlayer.get(player.id) ?? [];
    const completedRounds = playerSubmissions.length;
    const cumulativeGross = playerSubmissions.reduce((sum, s) => sum + s.grossTotal, 0);
    const cumulativeNet =
      completedRounds === 0
        ? 0
        : cumulativeGross - (player.frozenHandicap ?? 0) * completedRounds;

    return {
      championshipPlayerId: player.id,
      memberId: player.memberId,
      frozenHandicap: player.frozenHandicap,
      completedRounds,
      cumulativeGross,
      cumulativeNet,
    };
  });

  return rankStandings(rows);
}

/** One leaderboard row with the player's display name attached. */
export type LeaderboardDisplayEntry = LeaderboardEntry & { displayName: string };

export type LeaderboardPageData =
  | { state: "no-active-championship" }
  | {
      state: "found";
      championshipName: string;
      year: number;
      /** e.g. "Round 2 of 4", or null once the tournament is complete. */
      roundNumber: number | null;
      totalRounds: number;
      tournamentComplete: boolean;
      entries: LeaderboardDisplayEntry[];
    };

/**
 * Read-only composition for the leaderboard page: finds the current
 * ACTIVE championship, derives simple round context (current round
 * number vs total, or "tournament complete"), and attaches each
 * player's display name to the existing, unmodified
 * `getChampionshipLeaderboard` ranking/ordering. Does not reimplement
 * any sorting/ranking/aggregation — purely a thin read composition for
 * the UI.
 */
export async function getLeaderboardPageData(): Promise<LeaderboardPageData> {
  const [championship] = await db
    .select({
      id: championships.id,
      name: championships.name,
      year: championships.year,
    })
    .from(championships)
    .where(eq(championships.status, "ACTIVE"))
    .orderBy(desc(championships.createdAt))
    .limit(1);

  if (!championship) {
    return { state: "no-active-championship" };
  }

  const rounds = await db
    .select({ roundNumber: championshipRounds.roundNumber, status: championshipRounds.status })
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championship.id))
    .orderBy(asc(championshipRounds.roundNumber));

  const totalRounds = rounds.length;
  const inProgressRound = rounds.find((r) => r.status === "IN_PROGRESS");
  const earliestNotStarted = rounds.find((r) => r.status === "NOT_STARTED");
  const currentRound = inProgressRound ?? earliestNotStarted;
  const tournamentComplete = !currentRound;

  const entries = await getChampionshipLeaderboard(championship.id);

  const memberIds = entries.map((e) => e.memberId);
  const memberRows =
    memberIds.length > 0
      ? await db
          .select({ id: members.id, displayName: members.displayName })
          .from(members)
          .where(inArray(members.id, memberIds))
      : [];
  const displayNameByMemberId = new Map(memberRows.map((m) => [m.id, m.displayName]));

  return {
    state: "found",
    championshipName: championship.name,
    year: championship.year,
    roundNumber: currentRound ? currentRound.roundNumber : null,
    totalRounds,
    tournamentComplete,
    entries: entries.map((e) => ({
      ...e,
      displayName: displayNameByMemberId.get(e.memberId) ?? "Unknown",
    })),
  };
}
