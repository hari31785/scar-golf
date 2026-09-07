import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { championshipPlayers, championshipRounds } from "@/db/schema";
import { getChampionshipLeaderboard } from "./leaderboard";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
  cleanupChampionship,
  cleanupMember,
} from "./scoring/test-helpers";
import { scorecardSubmissions } from "@/db/schema";

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

describe("getChampionshipLeaderboard", () => {
  it("one-round cumulative gross/net calculation is correct", async () => {
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

    const player = byMember.get(memberIds[0])!;
    await insertSubmission({
      roundId: round1.id,
      championshipPlayerId: player.id,
      submittedByMemberId: memberIds[0],
      grossTotal: 90,
    });

    const leaderboard = await getChampionshipLeaderboard(championshipId);
    const entry = leaderboard.find((e) => e.championshipPlayerId === player.id)!;

    expect(entry.completedRounds).toBe(1);
    expect(entry.cumulativeGross).toBe(90);
    expect(entry.cumulativeNet).toBe(90 - player.frozenHandicap! * 1);
  });

  it("multi-round cumulative calculation applies frozen handicap once per completed round", async () => {
    const memberIds = [await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const player = players[0];

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const round2 = rounds.find((r) => r.roundNumber === 2)!;
    const round3 = rounds.find((r) => r.roundNumber === 3)!;

    await insertSubmission({ roundId: round1.id, championshipPlayerId: player.id, submittedByMemberId: memberIds[0], grossTotal: 85 });
    await insertSubmission({ roundId: round2.id, championshipPlayerId: player.id, submittedByMemberId: memberIds[0], grossTotal: 88 });
    await insertSubmission({ roundId: round3.id, championshipPlayerId: player.id, submittedByMemberId: memberIds[0], grossTotal: 92 });

    const leaderboard = await getChampionshipLeaderboard(championshipId);
    const entry = leaderboard.find((e) => e.championshipPlayerId === player.id)!;

    expect(entry.completedRounds).toBe(3);
    expect(entry.cumulativeGross).toBe(85 + 88 + 92);
    expect(entry.cumulativeNet).toBe(265 - player.frozenHandicap! * 3);
  });

  it("lowest cumulativeNet ranks first", async () => {
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

    const grossTotals = [100, 90, 70]; // last player has the clear best (lowest) score
    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({ roundId: round1.id, championshipPlayerId: player.id, submittedByMemberId: memberId, grossTotal: grossTotals[i] });
    }

    const leaderboard = await getChampionshipLeaderboard(championshipId);
    const leaderPlayerId = byMember.get(memberIds[2])!.id;

    expect(leaderboard[0].championshipPlayerId).toBe(leaderPlayerId);
    expect(leaderboard[0].position).toBe(1);
  });

  it("exact score ties use competition ranking (1,1,3)", async () => {
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

    // First two players tie exactly (same gross, and since both are
    // freshly-created members with no history their frozenHandicap
    // should also be equal -> identical cumulativeNet AND cumulativeGross).
    // Third player has a strictly worse score.
    const grossTotals = [90, 90, 100];
    for (const [i, memberId] of memberIds.entries()) {
      const player = byMember.get(memberId)!;
      await insertSubmission({ roundId: round1.id, championshipPlayerId: player.id, submittedByMemberId: memberId, grossTotal: grossTotals[i] });
    }

    const leaderboard = await getChampionshipLeaderboard(championshipId);

    expect(leaderboard[0].position).toBe(1);
    expect(leaderboard[1].position).toBe(1);
    expect(leaderboard[2].position).toBe(3);
    expect(leaderboard[0].cumulativeNet).toBe(leaderboard[1].cumulativeNet);
    expect(leaderboard[0].cumulativeGross).toBe(leaderboard[1].cumulativeGross);
    // Deterministic tiebreak ordering within the tie.
    expect(leaderboard[0].championshipPlayerId < leaderboard[1].championshipPlayerId).toBe(true);
  });

  it("zero-round ACTIVE players appear after players who have submitted rounds; WITHDRAWN/DISQUALIFIED are excluded", async () => {
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

    // Player 0 has submitted a round; player 1 has zero rounds;
    // player 2 is withdrawn (and also has zero rounds).
    const playedPlayer = byMember.get(memberIds[0])!;
    const zeroRoundPlayer = byMember.get(memberIds[1])!;
    const withdrawnPlayer = byMember.get(memberIds[2])!;

    await insertSubmission({ roundId: round1.id, championshipPlayerId: playedPlayer.id, submittedByMemberId: memberIds[0], grossTotal: 95 });

    await db
      .update(championshipPlayers)
      .set({ participantStatus: "WITHDRAWN" })
      .where(eq(championshipPlayers.id, withdrawnPlayer.id));

    const leaderboard = await getChampionshipLeaderboard(championshipId);

    expect(leaderboard.length).toBe(2);
    expect(leaderboard.map((e) => e.championshipPlayerId)).not.toContain(withdrawnPlayer.id);

    const playedIndex = leaderboard.findIndex((e) => e.championshipPlayerId === playedPlayer.id);
    const zeroIndex = leaderboard.findIndex((e) => e.championshipPlayerId === zeroRoundPlayer.id);
    expect(playedIndex).toBeLessThan(zeroIndex);

    const zeroEntry = leaderboard[zeroIndex];
    expect(zeroEntry.completedRounds).toBe(0);
    expect(zeroEntry.cumulativeGross).toBe(0);
    expect(zeroEntry.cumulativeNet).toBe(0);
  });
});
