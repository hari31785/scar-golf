import "dotenv/config";
import { describe, it, expect, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { championships, championshipRounds, championshipPlayers } from "@/db/schema";
import {
  createPlayoffSession,
  recordPlayoffHole,
  getPlayoffSessionState,
} from "@/lib/tournament/playoff";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  cleanupChampionship,
  cleanupMember,
} from "@/lib/tournament/scoring/test-helpers";

/**
 * Focused playoff coverage (A + B from the task spec). Does not
 * duplicate handicap-engine or finalize.ts ranking tests — sets up the
 * "awaiting playoff" state directly (Round 4 COMPLETE, two players tied
 * at finalPosition = 1) rather than re-running full 4-round scoring,
 * since that flow is already covered elsewhere.
 */

const cleanupIds: { championshipId?: string; memberIds: string[] } = {
  memberIds: [],
};

afterEach(async () => {
  if (cleanupIds.championshipId) {
    await cleanupChampionship(cleanupIds.championshipId);
    cleanupIds.championshipId = undefined;
  }
  for (const id of cleanupIds.memberIds) {
    await cleanupMember(id);
  }
  cleanupIds.memberIds = [];
});

async function setupTiedChampionship() {
  const memberA = await makeMember();
  const memberB = await makeMember();
  cleanupIds.memberIds.push(memberA, memberB);

  const { championshipId, players } = await makeActiveChampionshipWithPlayers([
    memberA,
    memberB,
  ]);
  cleanupIds.championshipId = championshipId;

  // Simulate "awaiting playoff": Round 4 COMPLETE, both players tied at
  // finalPosition = 1. Deliberately bypasses full 4-round scoring (that
  // flow is covered by other tests) — only the playoff service itself is
  // under test here.
  await db
    .update(championshipRounds)
    .set({ status: "COMPLETE" })
    .where(
      and(
        eq(championshipRounds.championshipId, championshipId),
        eq(championshipRounds.roundNumber, 4)
      )
    );

  for (const player of players) {
    await db
      .update(championshipPlayers)
      .set({ finalPosition: 1 })
      .where(eq(championshipPlayers.id, player.id));
  }

  return { championshipId, players };
}

describe("playoff", () => {
  it("A. tied playoff hole -> championship remains ACTIVE, no champion", async () => {
    const { championshipId, players } = await setupTiedChampionship();

    const { playoffSessionId } = await createPlayoffSession({
      championshipId,
      championshipPlayerIds: players.map((p) => p.id),
      createdByMemberId: players[0].memberId,
    });

    const result = await recordPlayoffHole({
      playoffSessionId,
      scores: players.map((p) => ({ championshipPlayerId: p.id, grossScore: 4 })),
    });

    expect(result.outcome).toBe("tied");
    expect(result.winnerChampionshipPlayerId).toBeNull();

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId))
      .limit(1);
    expect(championship.status).toBe("ACTIVE");
    expect(championship.championMemberId).toBeNull();

    const session = await getPlayoffSessionState(championshipId);
    expect(session.state).toBe("in-progress");
  }, 30000);

  it("B. unique playoff-hole winner -> champion set, championship COMPLETED", async () => {
    const { championshipId, players } = await setupTiedChampionship();

    const { playoffSessionId } = await createPlayoffSession({
      championshipId,
      championshipPlayerIds: players.map((p) => p.id),
      createdByMemberId: players[0].memberId,
    });

    const [winner, ...rest] = players;
    const result = await recordPlayoffHole({
      playoffSessionId,
      scores: [
        { championshipPlayerId: winner.id, grossScore: 3 },
        ...rest.map((p) => ({ championshipPlayerId: p.id, grossScore: 5 })),
      ],
    });

    expect(result.outcome).toBe("winner");
    expect(result.winnerChampionshipPlayerId).toBe(winner.id);

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId))
      .limit(1);
    expect(championship.status).toBe("COMPLETED");
    expect(championship.championMemberId).toBe(winner.memberId);

    const session = await getPlayoffSessionState(championshipId);
    expect(session.state).toBe("resolved");
  }, 30000);
});
