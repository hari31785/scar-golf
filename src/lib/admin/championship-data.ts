import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { championships } from "@/db/schema/championships";
import { championshipPlayers } from "@/db/schema/championship-players";
import { members } from "@/db/schema/members";

export type AdminChampionshipSummary = {
  id: string;
  year: number;
  name: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string | null;
  endDate: string | null;
  participantCount: number;
  activeParticipantCount: number;
};

export type AdminChampionshipMemberRow = {
  memberId: string;
  displayName: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  isAdded: boolean;
};

/**
 * Finds the current non-cancelled championship for a given year, if
 * one exists, along with its participant count. Read-only — never
 * creates/mutates anything (see src/lib/tournament/create.ts for
 * creation).
 */
export async function getChampionshipForYear(
  year: number
): Promise<AdminChampionshipSummary | null> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(and(eq(championships.year, year), ne(championships.status, "CANCELLED")))
    .limit(1);

  if (!championship) return null;

  const participants = await db
    .select({ id: championshipPlayers.id, participantStatus: championshipPlayers.participantStatus })
    .from(championshipPlayers)
    .where(eq(championshipPlayers.championshipId, championship.id));

  return {
    id: championship.id,
    year: championship.year,
    name: championship.name,
    status: championship.status,
    startDate: championship.startDate ? championship.startDate.toISOString() : null,
    endDate: championship.endDate ? championship.endDate.toISOString() : null,
    participantCount: participants.length,
    activeParticipantCount: participants.filter((p) => p.participantStatus === "ACTIVE").length,
  };
}

/**
 * Every ACTIVE SCAR member, each labeled with whether they are already
 * a participant in the given championship. Purely a read composition
 * for the admin UI — does not enforce DRAFT-only add/remove rules
 * (those live in src/lib/tournament/enrollment.ts and are re-checked
 * there regardless of what this returns).
 */
export async function listActiveMembersForChampionship(
  championshipId: string
): Promise<AdminChampionshipMemberRow[]> {
  const activeMembers = await db
    .select({
      id: members.id,
      displayName: members.displayName,
      membershipType: members.membershipType,
    })
    .from(members)
    .where(eq(members.status, "ACTIVE"))
    .orderBy(members.displayName);

  const participants = await db
    .select({ memberId: championshipPlayers.memberId })
    .from(championshipPlayers)
    .where(eq(championshipPlayers.championshipId, championshipId));
  const addedMemberIds = new Set(participants.map((p) => p.memberId));

  return activeMembers.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    membershipType: m.membershipType,
    isAdded: addedMemberIds.has(m.id),
  }));
}
