import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { championships } from "@/db/schema/championships";
import { championshipRounds } from "@/db/schema/championship-rounds";
import { championshipRoundHoles } from "@/db/schema/championship-round-holes";
import { roundGroups } from "@/db/schema/round-groups";
import { roundGroupPlayers } from "@/db/schema/round-group-players";
import { championshipPlayers } from "@/db/schema/championship-players";
import { members } from "@/db/schema/members";
import { holeScores } from "@/db/schema/hole-scores";

export type ScorecardHole = { holeNumber: number; par: number };

export type ScorecardPlayerRow = {
  championshipPlayerId: string;
  memberId: string;
  displayName: string;
  /** Map of holeNumber (1-18) -> gross score, only for holes actually recorded so far. */
  scoresByHole: Record<number, number>;
  /** Count of holes with a recorded score so far. */
  thru: number;
  /** Sum of recorded gross scores so far (not just when complete). */
  runningTotal: number;
};

export type ScorecardGroupRow = {
  roundGroupId: string;
  groupNumber: number;
  teeTime: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  players: ScorecardPlayerRow[];
};

export type ChampionshipRoundScorecards = {
  championshipRoundId: string;
  roundNumber: number;
  holes: ScorecardHole[];
  groups: ScorecardGroupRow[];
};

/**
 * Read-only, everyone-can-view hole-by-hole scorecards for one
 * championship round: every group, every player, every hole score
 * recorded so far (not just fully-submitted groups — an in-progress
 * group's partial scores are shown too, "thru N"). Returns an empty
 * `groups` array if pairings haven't been generated for this round yet.
 */
export async function getRoundScorecards(
  championshipRoundId: string
): Promise<ChampionshipRoundScorecards | null> {
  const [round] = await db
    .select({ id: championshipRounds.id, roundNumber: championshipRounds.roundNumber })
    .from(championshipRounds)
    .where(eq(championshipRounds.id, championshipRoundId))
    .limit(1);
  if (!round) return null;

  const [holeRows, groupRows, groupPlayerRows, scoreRows] = await Promise.all([
    db
      .select({ holeNumber: championshipRoundHoles.holeNumber, par: championshipRoundHoles.par })
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, championshipRoundId))
      .orderBy(asc(championshipRoundHoles.holeNumber)),
    db
      .select({
        id: roundGroups.id,
        groupNumber: roundGroups.groupNumber,
        teeTime: roundGroups.teeTime,
        status: roundGroups.status,
      })
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, championshipRoundId))
      .orderBy(asc(roundGroups.groupNumber)),
    db
      .select({
        roundGroupId: roundGroupPlayers.roundGroupId,
        position: roundGroupPlayers.position,
        championshipPlayerId: championshipPlayers.id,
        memberId: members.id,
        displayName: members.displayName,
      })
      .from(roundGroupPlayers)
      .innerJoin(
        championshipPlayers,
        eq(championshipPlayers.id, roundGroupPlayers.championshipPlayerId)
      )
      .innerJoin(members, eq(members.id, championshipPlayers.memberId))
      .where(eq(roundGroupPlayers.championshipRoundId, championshipRoundId))
      .orderBy(asc(roundGroupPlayers.position)),
    db
      .select({
        championshipPlayerId: holeScores.championshipPlayerId,
        holeNumber: holeScores.holeNumber,
        grossScore: holeScores.grossScore,
      })
      .from(holeScores)
      .where(eq(holeScores.championshipRoundId, championshipRoundId)),
  ]);

  if (groupRows.length === 0) {
    return {
      championshipRoundId: round.id,
      roundNumber: round.roundNumber,
      holes: holeRows,
      groups: [],
    };
  }

  const scoresByPlayer = new Map<string, Record<number, number>>();
  for (const row of scoreRows) {
    const existing = scoresByPlayer.get(row.championshipPlayerId) ?? {};
    existing[row.holeNumber] = row.grossScore;
    scoresByPlayer.set(row.championshipPlayerId, existing);
  }

  const playersByGroupId = new Map<string, ScorecardPlayerRow[]>();
  for (const row of groupPlayerRows) {
    const scoresByHole = scoresByPlayer.get(row.championshipPlayerId) ?? {};
    const entries = Object.values(scoresByHole);
    const list = playersByGroupId.get(row.roundGroupId) ?? [];
    list.push({
      championshipPlayerId: row.championshipPlayerId,
      memberId: row.memberId,
      displayName: row.displayName,
      scoresByHole,
      thru: entries.length,
      runningTotal: entries.reduce((sum, s) => sum + s, 0),
    });
    playersByGroupId.set(row.roundGroupId, list);
  }

  const groups: ScorecardGroupRow[] = groupRows.map((group) => ({
    roundGroupId: group.id,
    groupNumber: group.groupNumber,
    teeTime: group.teeTime ? group.teeTime.toISOString() : null,
    status: group.status,
    players: playersByGroupId.get(group.id) ?? [],
  }));

  return {
    championshipRoundId: round.id,
    roundNumber: round.roundNumber,
    holes: holeRows,
    groups,
  };
}

export type ScorecardsPageData =
  | { state: "no-active-championship" }
  | {
      state: "found";
      championshipId: string;
      championshipName: string;
      year: number;
      rounds: ChampionshipRoundScorecards[];
    };

/**
 * Read-only composition for the everyone-can-view /scorecards page:
 * finds the current ACTIVE championship and returns hole-by-hole
 * scores for every round/group/player generated so far.
 */
export async function getScorecardsPageData(): Promise<ScorecardsPageData> {
  const [championship] = await db
    .select({ id: championships.id, name: championships.name, year: championships.year })
    .from(championships)
    .where(eq(championships.status, "ACTIVE"))
    .orderBy(desc(championships.createdAt))
    .limit(1);

  if (!championship) {
    return { state: "no-active-championship" };
  }

  const roundRows = await db
    .select({ id: championshipRounds.id, roundNumber: championshipRounds.roundNumber })
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championship.id))
    .orderBy(asc(championshipRounds.roundNumber));

  const rounds: ChampionshipRoundScorecards[] = [];
  for (const round of roundRows) {
    const data = await getRoundScorecards(round.id);
    if (data) rounds.push(data);
  }

  return {
    state: "found",
    championshipId: championship.id,
    championshipName: championship.name,
    year: championship.year,
    rounds,
  };
}
