import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { championships } from "@/db/schema/championships";
import { championshipRounds } from "@/db/schema/championship-rounds";
import { roundGroups } from "@/db/schema/round-groups";
import { roundGroupPlayers } from "@/db/schema/round-group-players";
import { championshipPlayers } from "@/db/schema/championship-players";
import { members } from "@/db/schema/members";

export type PairingPlayerRow = {
  championshipPlayerId: string;
  memberId: string;
  displayName: string;
  frozenHandicap: number | null;
  membershipType: "PERMANENT" | "ASSOCIATE" | null;
  position: number;
  /** Null for groups generated before cart assignment existed. */
  cartNumber: number | null;
};

export type PairingGroupRow = {
  roundGroupId: string;
  groupNumber: number;
  teeTime: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  players: PairingPlayerRow[];
};

/**
 * Read-only pairing summary for one championship round — used by both
 * the player-facing /pairings page and the admin tee-time editor.
 * Returns an empty array if the round has no groups yet (not generated
 * for any reason). Does not read/expose scores.
 */
export async function getRoundPairingSummary(
  championshipRoundId: string
): Promise<PairingGroupRow[]> {
  const groups = await db
    .select({
      id: roundGroups.id,
      groupNumber: roundGroups.groupNumber,
      teeTime: roundGroups.teeTime,
      status: roundGroups.status,
    })
    .from(roundGroups)
    .where(eq(roundGroups.championshipRoundId, championshipRoundId))
    .orderBy(asc(roundGroups.groupNumber));
  if (groups.length === 0) return [];

  const groupPlayerRows = await db
    .select({
      roundGroupId: roundGroupPlayers.roundGroupId,
      position: roundGroupPlayers.position,
      cartNumber: roundGroupPlayers.cartNumber,
      championshipPlayerId: championshipPlayers.id,
      memberId: members.id,
      displayName: members.displayName,
      frozenHandicap: championshipPlayers.frozenHandicap,
      membershipType: championshipPlayers.membershipTypeSnapshot,
    })
    .from(roundGroupPlayers)
    .innerJoin(
      championshipPlayers,
      eq(championshipPlayers.id, roundGroupPlayers.championshipPlayerId)
    )
    .innerJoin(members, eq(members.id, championshipPlayers.memberId))
    .where(eq(roundGroupPlayers.championshipRoundId, championshipRoundId))
    .orderBy(asc(roundGroupPlayers.position));

  const playersByGroupId = new Map<string, PairingPlayerRow[]>();
  for (const row of groupPlayerRows) {
    const list = playersByGroupId.get(row.roundGroupId) ?? [];
    list.push({
      championshipPlayerId: row.championshipPlayerId,
      memberId: row.memberId,
      displayName: row.displayName,
      frozenHandicap: row.frozenHandicap,
      membershipType: row.membershipType,
      position: row.position,
      cartNumber: row.cartNumber,
    });
    playersByGroupId.set(row.roundGroupId, list);
  }

  return groups.map((group) => ({
    roundGroupId: group.id,
    groupNumber: group.groupNumber,
    teeTime: group.teeTime ? group.teeTime.toISOString() : null,
    status: group.status,
    players: playersByGroupId.get(group.id) ?? [],
  }));
}

export type ChampionshipRoundPairings = {
  championshipRoundId: string;
  roundNumber: number;
  groups: PairingGroupRow[];
};

/**
 * Read-only pairing summary across all 4 rounds of a championship, in
 * round-number order. A round with no groups yet is included with an
 * empty `groups` array (caller decides how to render "not generated").
 */
export async function getAllRoundsPairingSummary(
  championshipId: string
): Promise<ChampionshipRoundPairings[]> {
  const rounds = await db
    .select({ id: championshipRounds.id, roundNumber: championshipRounds.roundNumber })
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId))
    .orderBy(asc(championshipRounds.roundNumber));

  const result: ChampionshipRoundPairings[] = [];
  for (const round of rounds) {
    const groups = await getRoundPairingSummary(round.id);
    result.push({ championshipRoundId: round.id, roundNumber: round.roundNumber, groups });
  }
  return result;
}

export type PairingsPageData =
  | { state: "no-active-championship" }
  | {
      state: "found";
      championshipId: string;
      championshipName: string;
      year: number;
      rounds: ChampionshipRoundPairings[];
    };

/**
 * Read-only composition for the player-facing /pairings page: finds
 * the current ACTIVE championship and its pairing summary across all
 * 4 rounds. Does not generate/regenerate anything.
 */
export async function getPairingsPageData(): Promise<PairingsPageData> {
  const [championship] = await db
    .select({ id: championships.id, name: championships.name, year: championships.year })
    .from(championships)
    .where(eq(championships.status, "ACTIVE"))
    .orderBy(desc(championships.createdAt))
    .limit(1);

  if (!championship) {
    return { state: "no-active-championship" };
  }

  const rounds = await getAllRoundsPairingSummary(championship.id);

  return {
    state: "found",
    championshipId: championship.id,
    championshipName: championship.name,
    year: championship.year,
    rounds,
  };
}
