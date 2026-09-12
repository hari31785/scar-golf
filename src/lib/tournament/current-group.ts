import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  roundGroups,
  roundGroupPlayers,
  members,
  holeScores,
} from "@/db/schema";
import { getRoundHoles } from "./course-setup";

export type CurrentGroupPlayer = {
  championshipPlayerId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  frozenHandicap: number | null;
  participantStatus: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";
  /** True if this player has been marked as skipping THIS round only. */
  skippedRound: boolean;
  isSelf: boolean;
};

/** scores[holeNumber][championshipPlayerId] = grossScore */
export type HoleScoresByHole = Record<number, Record<string, number>>;

export type HoleLayoutEntry = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
};

export type CurrentGroupResult =
  | { state: "no-active-championship" }
  | { state: "tournament-complete"; championshipName: string; year: number }
  | { state: "not-enrolled"; championshipName: string; year: number }
  | { state: "no-group"; championshipName: string; year: number; roundNumber: number }
  | {
      state: "found";
      championshipRoundId: string;
      roundGroupId: string;
      championshipName: string;
      year: number;
      roundNumber: number;
      totalRounds: number;
      courseName: string | null;
      teeName: string | null;
      teeColor: string | null;
      courseRating: number | null;
      slope: number | null;
      totalPar: number | null;
      yardage: number | null;
      teeTime: string | null;
      groupNumber: number;
      groupStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
      players: CurrentGroupPlayer[];
      scores: HoleScoresByHole;
      /** Course-provided hole layout — never auto-fills a score. */
      holes: HoleLayoutEntry[];
    };


/**
 * Resolves everything the /score screen needs for the signed-in member,
 * in one place:
 *   1. the current ACTIVE championship (if multiple somehow exist,
 *      picks the most recently created one — an edge case the schema
 *      allows across different years but the product doesn't expect in
 *      practice),
 *   2. the "current" round within it: prefer IN_PROGRESS, otherwise the
 *      earliest NOT_STARTED round; if every round is COMPLETE, reports
 *      a tournament-complete state instead,
 *   3. the signed-in member's championship_player row and their group
 *      assignment for that round (if any),
 *   4. every player in that group, each with their frozen handicap.
 *
 * This is read-only — no writes, no score-entry logic.
 */
export async function getCurrentGroupForMember(memberId: string): Promise<CurrentGroupResult> {
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
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championship.id))
    .orderBy(asc(championshipRounds.roundNumber));

  const totalRounds = rounds.length;
  const inProgressRound = rounds.find((r) => r.status === "IN_PROGRESS");
  const earliestNotStarted = rounds.find((r) => r.status === "NOT_STARTED");
  const currentRound = inProgressRound ?? earliestNotStarted;

  if (!currentRound) {
    // Every round is COMPLETE (or there are no rounds at all, which
    // shouldn't happen for an ACTIVE championship, but is treated the
    // same as "nothing left to play").
    return {
      state: "tournament-complete",
      championshipName: championship.name,
      year: championship.year,
    };
  }

  const [player] = await db
    .select({
      id: championshipPlayers.id,
      participantStatus: championshipPlayers.participantStatus,
    })
    .from(championshipPlayers)
    .where(
      and(
        eq(championshipPlayers.championshipId, championship.id),
        eq(championshipPlayers.memberId, memberId)
      )
    )
    .limit(1);

  if (!player) {
    return {
      state: "not-enrolled",
      championshipName: championship.name,
      year: championship.year,
    };
  }

  const [myGroupAssignment] = await db
    .select({ roundGroupId: roundGroupPlayers.roundGroupId })
    .from(roundGroupPlayers)
    .where(
      and(
        eq(roundGroupPlayers.championshipRoundId, currentRound.id),
        eq(roundGroupPlayers.championshipPlayerId, player.id)
      )
    )
    .limit(1);

  if (!myGroupAssignment) {
    return {
      state: "no-group",
      championshipName: championship.name,
      year: championship.year,
      roundNumber: currentRound.roundNumber,
    };
  }

  const [group] = await db
    .select()
    .from(roundGroups)
    .where(eq(roundGroups.id, myGroupAssignment.roundGroupId))
    .limit(1);

  const groupPlayerRows = await db
    .select({
      championshipPlayerId: championshipPlayers.id,
      memberId: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      displayName: members.displayName,
      frozenHandicap: championshipPlayers.frozenHandicap,
      participantStatus: championshipPlayers.participantStatus,
      skippedRound: roundGroupPlayers.skippedRound,
    })
    .from(roundGroupPlayers)
    .innerJoin(
      championshipPlayers,
      eq(championshipPlayers.id, roundGroupPlayers.championshipPlayerId)
    )
    .innerJoin(members, eq(members.id, championshipPlayers.memberId))
    .where(eq(roundGroupPlayers.roundGroupId, group.id))
    .orderBy(asc(roundGroupPlayers.position));

  const groupPlayerIds = groupPlayerRows.map((p) => p.championshipPlayerId);
  const existingScoreRows =
    groupPlayerIds.length > 0
      ? await db
          .select({
            championshipPlayerId: holeScores.championshipPlayerId,
            holeNumber: holeScores.holeNumber,
            grossScore: holeScores.grossScore,
          })
          .from(holeScores)
          .where(
            and(
              eq(holeScores.championshipRoundId, currentRound.id),
              inArray(holeScores.championshipPlayerId, groupPlayerIds)
            )
          )
      : [];

  const scores: HoleScoresByHole = {};
  for (const row of existingScoreRows) {
    if (!scores[row.holeNumber]) scores[row.holeNumber] = {};
    scores[row.holeNumber][row.championshipPlayerId] = row.grossScore;
  }

  const holes = await getRoundHoles(currentRound.id);

  return {
    state: "found",
    championshipRoundId: currentRound.id,
    roundGroupId: group.id,
    championshipName: championship.name,
    year: championship.year,
    roundNumber: currentRound.roundNumber,
    totalRounds,
    courseName: currentRound.courseName,
    teeName: currentRound.teeName,
    teeColor: currentRound.teeColor,
    courseRating: currentRound.courseRating,
    slope: currentRound.slope,
    totalPar: currentRound.par,
    yardage: currentRound.yardage,
    teeTime: group.teeTime ? group.teeTime.toISOString() : null,
    groupNumber: group.groupNumber,
    groupStatus: group.status,
    players: groupPlayerRows.map((p) => ({
      championshipPlayerId: p.championshipPlayerId,
      memberId: p.memberId,
      firstName: p.firstName,
      lastName: p.lastName,
      displayName: p.displayName,
      frozenHandicap: p.frozenHandicap,
      participantStatus: p.participantStatus,
      skippedRound: p.skippedRound,
      isSelf: p.memberId === memberId,
    })),
    scores,
    holes,
  };
}
