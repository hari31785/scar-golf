import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { championshipRounds, roundGroupPlayers, roundGroups, pairingGenerations, scorecardSubmissions } from "@/db/schema";
import {
  generateAndPersistRound2to4Pairing,
  Round2to4PairingError,
} from "./round2to4-pairing-service";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
  cleanupChampionship,
  cleanupMember,
} from "./scoring/test-helpers";

const createdChampionshipIds: string[] = [];
const createdMemberIds: string[] = [];

afterEach(async () => {
  for (const id of createdChampionshipIds.splice(0)) {
    await cleanupChampionship(id);
  }
  for (const id of createdMemberIds.splice(0)) {
    await cleanupMember(id);
  }
});

/** Marks a championship round COMPLETE directly (bypassing real scoring flow). */
async function markRoundComplete(roundId: string) {
  await db.update(championshipRounds).set({ status: "COMPLETE" }).where(eq(championshipRounds.id, roundId));
}

/** Tracks the next free groupNumber per round so throwaway groups never collide. */
const nextGroupNumberByRound = new Map<string, number>();

/** Inserts a scorecard_submissions row directly, creating a throwaway group to satisfy the FK. */
async function insertSubmission(params: {
  roundId: string;
  championshipPlayerId: string;
  submittedByMemberId: string;
  grossTotal: number;
}) {
  const groupNumber = nextGroupNumberByRound.get(params.roundId) ?? 1;
  nextGroupNumberByRound.set(params.roundId, groupNumber + 1);
  const groupId = await makeGroup(params.roundId, [params.championshipPlayerId], groupNumber);
  await db.insert(scorecardSubmissions).values({
    championshipRoundId: params.roundId,
    championshipPlayerId: params.championshipPlayerId,
    roundGroupId: groupId,
    submittedByMemberId: params.submittedByMemberId,
    grossTotal: params.grossTotal,
  });
}

describe("generateAndPersistRound2to4Pairing", () => {
  it("Round 2 cumulative net calculation is correct", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;

    const grossTotals = [80, 90, 100];
    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({
        roundId: round1.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: grossTotals[i],
      });
    }
    await markRoundComplete(round1.id);

    await generateAndPersistRound2to4Pairing({ championshipRoundId: round2.id });

    const [genRow] = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, round2.id));
    expect(genRow.generationType).toBe("NET_STANDINGS");
    const snapshot = genRow.standingsSnapshot as Array<{
      championshipPlayerId: string;
      cumulativeGross: number;
      completedRounds: number;
      frozenHandicap: number;
      cumulativeNet: number;
    }>;

    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      const entry = snapshot.find((s) => s.championshipPlayerId === player.id)!;
      expect(entry.cumulativeGross).toBe(grossTotals[i]);
      expect(entry.completedRounds).toBe(1);
      expect(entry.frozenHandicap).toBe(player.frozenHandicap);
      expect(entry.cumulativeNet).toBe(grossTotals[i] - player.frozenHandicap! * 1);
    }
  });

  it("Round 3 correctly uses two prior rounds", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;
    const round3 = rounds.find((r) => r.roundNumber === 3)!;

    const round1Gross = [80, 90, 100];
    const round2Gross = [82, 88, 95];
    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({
        roundId: round1.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: round1Gross[i],
      });
      await insertSubmission({
        roundId: round2.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: round2Gross[i],
      });
    }
    await markRoundComplete(round1.id);
    await markRoundComplete(round2.id);

    await generateAndPersistRound2to4Pairing({ championshipRoundId: round3.id });

    const [genRow] = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, round3.id));
    const snapshot = genRow.standingsSnapshot as Array<{
      championshipPlayerId: string;
      cumulativeGross: number;
      completedRounds: number;
      frozenHandicap: number;
      cumulativeNet: number;
    }>;

    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      const entry = snapshot.find((s) => s.championshipPlayerId === player.id)!;
      const expectedGross = round1Gross[i] + round2Gross[i];
      expect(entry.cumulativeGross).toBe(expectedGross);
      expect(entry.completedRounds).toBe(2);
      expect(entry.cumulativeNet).toBe(expectedGross - player.frozenHandicap! * 2);
    }
  });

  it("leaders are placed in the final group", async () => {
    const memberIds = [
      await makeMember(),
      await makeMember(),
      await makeMember(),
      await makeMember(),
      await makeMember(),
    ];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;

    // Give the same frozenHandicap-adjusted gross so cumulativeNet is
    // purely driven by grossTotal (all frozenHandicaps are equal since
    // all test members have no prior history) — lowest gross => leader.
    const grossTotals = [100, 95, 90, 85, 70]; // last player is the clear leader
    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({
        roundId: round1.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: grossTotals[i],
      });
    }
    await markRoundComplete(round1.id);

    await generateAndPersistRound2to4Pairing({ championshipRoundId: round2.id });

    const groupPlayers = await db
      .select({
        groupNumber: roundGroups.groupNumber,
        championshipPlayerId: roundGroupPlayers.championshipPlayerId,
      })
      .from(roundGroupPlayers)
      .innerJoin(roundGroups, eq(roundGroups.id, roundGroupPlayers.roundGroupId))
      .where(eq(roundGroupPlayers.championshipRoundId, round2.id))
      .orderBy(roundGroups.groupNumber);

    const maxGroupNumber = Math.max(...groupPlayers.map((g) => g.groupNumber));
    const finalGroupPlayerIds = groupPlayers
      .filter((g) => g.groupNumber === maxGroupNumber)
      .map((g) => g.championshipPlayerId);

    const leaderPlayerId = byMember.get(memberIds[4])!.id;
    expect(finalGroupPlayerIds).toContain(leaderPlayerId);
  });

  it("equal-net ranking is deterministic (tiebreak by championshipPlayerId)", async () => {
    const memberIds = [await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;

    // Same gross for both -> since both members are freshly created with
    // no history, frozenHandicap should also be equal -> tied cumulativeNet.
    for (const memberId of memberIds) {
      const player = byMember.get(memberId)!;
      await insertSubmission({
        roundId: round1.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: 90,
      });
    }
    await markRoundComplete(round1.id);

    await generateAndPersistRound2to4Pairing({ championshipRoundId: round2.id });

    const [genRow] = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, round2.id));
    const snapshot = genRow.standingsSnapshot as Array<{
      championshipPlayerId: string;
      cumulativeNet: number;
    }>;
    expect(snapshot[0].cumulativeNet).toBe(snapshot[1].cumulativeNet);

    const sortedIds = [...snapshot.map((s) => s.championshipPlayerId)].sort();

    const groupPlayers = await db
      .select({
        championshipPlayerId: roundGroupPlayers.championshipPlayerId,
        position: roundGroupPlayers.position,
      })
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, round2.id))
      .orderBy(roundGroupPlayers.position);

    // With a tie, the net-standings pairing engine places the
    // lexicographically-first championshipPlayerId "worse" (earlier in
    // the worst-first-then-reversed chunking), so it ends up ordered
    // first within the group — deterministic across reruns.
    expect(groupPlayers.map((g) => g.championshipPlayerId)).toEqual(sortedIds);
  });

  it("persistence contains every ACTIVE participant exactly once and stores standingsSnapshot", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;

    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({
        roundId: round1.id,
        championshipPlayerId: player.id,
        submittedByMemberId: memberId,
        grossTotal: 80 + i,
      });
    }
    await markRoundComplete(round1.id);

    await generateAndPersistRound2to4Pairing({ championshipRoundId: round2.id });

    const rows = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, round2.id));
    expect(rows.length).toBe(memberIds.length);
    expect(new Set(rows.map((r) => r.championshipPlayerId)).size).toBe(memberIds.length);

    const [genRow] = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, round2.id));
    expect(genRow.generationType).toBe("NET_STANDINGS");
    expect(genRow.standingsSnapshot).not.toBeNull();
    expect((genRow.standingsSnapshot as unknown[]).length).toBe(memberIds.length);
  });

  it("rejects generation when the immediately preceding round is not COMPLETE", async () => {
    const memberIds = [await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round2 = rounds.find((r) => r.roundNumber === 2)!;

    // Round 1 is left at its default NOT_STARTED status.
    await expect(
      generateAndPersistRound2to4Pairing({ championshipRoundId: round2.id })
    ).rejects.toThrow(Round2to4PairingError);

    const groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, round2.id));
    expect(groups.length).toBe(0);
  });
});
