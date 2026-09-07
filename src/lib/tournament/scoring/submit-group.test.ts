import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  championshipRounds,
  roundGroups,
  roundGroupPlayers,
  scorecardSubmissions,
  playedRounds,
  pairingGenerations,
  championships,
  championshipPlayers,
} from "@/db/schema";
import { saveHoleScore } from "./hole-score";
import { submitRoundGroup, GroupSubmissionError } from "./submit-group";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
  cleanupChampionship,
  cleanupMember,
} from "./test-helpers";

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

async function fillAllHoles(
  roundId: string,
  championshipPlayerId: string,
  actingMemberId: string,
  grossPerHole = 4
) {
  for (let hole = 1; hole <= 18; hole++) {
    await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId,
      holeNumber: hole,
      grossScore: grossPerHole,
      actingMemberId,
    });
  }
}

describe("submitRoundGroup", () => {
  it("I: incomplete active player blocks group submission", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [
      byMember.get(memberA)!.id,
      byMember.get(memberB)!.id,
    ]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    // memberB left incomplete (only 5 holes)
    for (let hole = 1; hole <= 5; hole++) {
      await saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: byMember.get(memberB)!.id,
        holeNumber: hole,
        grossScore: 4,
        actingMemberId: memberB,
      });
    }

    await expect(
      submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA })
    ).rejects.toThrow(GroupSubmissionError);

    const [group] = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.id, groupId));
    expect(group.status).not.toBe("SUBMITTED");
  });

  it("J: complete 18-hole scorecards for all active players allow submission", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [
      byMember.get(memberA)!.id,
      byMember.get(memberB)!.id,
    ]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await fillAllHoles(roundId, byMember.get(memberB)!.id, memberB);

    const result = await submitRoundGroup({
      roundGroupId: groupId,
      actingMemberId: memberA,
    });
    expect(result.roundComplete).toBe(true); // only group, both active players covered

    const [group] = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.id, groupId));
    expect(group.status).toBe("SUBMITTED");
  });

  it("K: WITHDRAWN/DISQUALIFIED participant in the group does not block submission", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const { championshipPlayers } = await import("@/db/schema");
    await db
      .update(championshipPlayers)
      .set({ participantStatus: "WITHDRAWN" })
      .where(eq(championshipPlayers.id, byMember.get(memberB)!.id));

    const groupId = await makeGroup(roundId, [
      byMember.get(memberA)!.id,
      byMember.get(memberB)!.id,
    ]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    // memberB (WITHDRAWN) has NO scores at all.

    const result = await submitRoundGroup({
      roundGroupId: groupId,
      actingMemberId: memberA,
    });
    expect(result.roundComplete).toBe(true);
  });

  it("L: submission creates exactly one scorecard_submission per ACTIVE player", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [
      byMember.get(memberA)!.id,
      byMember.get(memberB)!.id,
    ]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await fillAllHoles(roundId, byMember.get(memberB)!.id, memberB);

    await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

    const subs = await db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.championshipRoundId, roundId));
    expect(subs.length).toBe(2);
    expect(subs.every((s) => s.grossTotal === 72)).toBe(true);
  });

  it("M: submission locks normal editing", async () => {
    const memberA = await makeMember();
    createdMemberIds.push(memberA);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: byMember.get(memberA)!.id,
        holeNumber: 1,
        grossScore: 5,
        actingMemberId: memberA,
      })
    ).rejects.toThrow();
  });

  it("N: second submission attempt is rejected (idempotently safe, no duplicate rows)", async () => {
    const memberA = await makeMember();
    createdMemberIds.push(memberA);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

    await expect(
      submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA })
    ).rejects.toThrow(GroupSubmissionError);

    const subs = await db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.championshipRoundId, roundId));
    expect(subs.length).toBe(1);
  });

  it("O: first submitted group does not complete the round if other ACTIVE groups remain", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const groupA = await makeGroup(roundId, [byMember.get(memberA)!.id], 1);
    const groupB = await makeGroup(roundId, [byMember.get(memberB)!.id], 2);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);

    const result = await submitRoundGroup({
      roundGroupId: groupA,
      actingMemberId: memberA,
    });
    expect(result.roundComplete).toBe(false);

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(round.status).not.toBe("COMPLETE");
    void groupB;
  });

  it("P: final required group submission automatically marks round COMPLETE", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const groupA = await makeGroup(roundId, [byMember.get(memberA)!.id], 1);
    const groupB = await makeGroup(roundId, [byMember.get(memberB)!.id], 2);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await fillAllHoles(roundId, byMember.get(memberB)!.id, memberB);

    await submitRoundGroup({ roundGroupId: groupA, actingMemberId: memberA });
    const finalResult = await submitRoundGroup({
      roundGroupId: groupB,
      actingMemberId: memberB,
    });
    expect(finalResult.roundComplete).toBe(true);

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(round.status).toBe("COMPLETE");
  });

  it("W: championship played_rounds integration is idempotent (no duplicates on retry)", async () => {
    const memberA = await makeMember();
    createdMemberIds.push(memberA);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));

    const rows = await db
      .select()
      .from(playedRounds)
      .where(
        and(eq(playedRounds.memberId, memberA), eq(playedRounds.source, "CHAMPIONSHIP"))
      );
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.memberId).toBe(memberA);
    expect(row.source).toBe("CHAMPIONSHIP");
    expect(row.grossScore).toBe(72);
    expect(row.courseName).toBe(round.courseName);
    expect(row.courseRating).toBe(round.courseRating);
    expect(row.slope).toBe(round.slope);
    expect(row.par).toBe(round.par);
    expect(row.playedAt).toBeInstanceOf(Date);
    expect(row.sourceRef).toBeTruthy();
    expect(row.sourceRef).toContain(championshipId);
    expect(row.sourceRef).toContain(byMember.get(memberA)!.id);

    // Retry the same idempotent upsert directly (simulating a retried
    // submission path) — must not create a duplicate row.
    const { upsertChampionshipPlayedRound } = await import(
      "./championship-played-rounds"
    );
    await db.transaction(async (tx) => {
      await upsertChampionshipPlayedRound(tx, {
        memberId: memberA,
        championshipRoundId: roundId,
        championshipPlayerId: byMember.get(memberA)!.id,
        grossTotal: 72,
      });
    });

    const rowsAfterRetry = await db
      .select()
      .from(playedRounds)
      .where(
        and(eq(playedRounds.memberId, memberA), eq(playedRounds.source, "CHAMPIONSHIP"))
      );
    expect(rowsAfterRetry.length).toBe(1);
    expect(rowsAfterRetry[0].id).toBe(row.id);
  });

  it("authorization: a member who does not belong to the group and is not admin is rejected", async () => {
    const memberA = await makeMember();
    const outsider = await makeMember();
    createdMemberIds.push(memberA, outsider);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, outsider]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);

    await expect(
      submitRoundGroup({ roundGroupId: groupId, actingMemberId: outsider })
    ).rejects.toThrow(GroupSubmissionError);

    const [group] = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.id, groupId));
    expect(group.status).not.toBe("SUBMITTED");
  });

  it("authorization: an ADMIN who does not belong to the group can submit it", async () => {
    const memberA = await makeMember();
    const admin = await makeMember({ appRole: "ADMIN" });
    createdMemberIds.push(memberA, admin);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);

    const result = await submitRoundGroup({
      roundGroupId: groupId,
      actingMemberId: admin,
    });
    expect(result.roundComplete).toBe(true);

    const [group] = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.id, groupId));
    expect(group.status).toBe("SUBMITTED");
    expect(group.submittedByMemberId).toBe(admin);
    expect(group.submittedAt).toBeInstanceOf(Date);
  });

  it("stores correct submittedAt/submittedByMemberId on each scorecard_submissions row", async () => {
    const memberA = await makeMember();
    createdMemberIds.push(memberA);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [byMember.get(memberA)!.id]);

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

    const [submission] = await db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.championshipRoundId, roundId),
          eq(
            scorecardSubmissions.championshipPlayerId,
            byMember.get(memberA)!.id
          )
        )
      );
    expect(submission.submittedByMemberId).toBe(memberA);
    expect(submission.submittedAt).toBeInstanceOf(Date);
  });

  it("atomicity: an incomplete active player leaves no partial scorecard_submissions rows and group stays un-submitted", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const groupId = await makeGroup(roundId, [
      byMember.get(memberA)!.id,
      byMember.get(memberB)!.id,
    ]);

    // memberA complete, memberB incomplete.
    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: byMember.get(memberB)!.id,
      holeNumber: 1,
      grossScore: 4,
      actingMemberId: memberB,
    });

    await expect(
      submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA })
    ).rejects.toThrow(GroupSubmissionError);

    const subs = await db
      .select()
      .from(scorecardSubmissions)
      .where(eq(scorecardSubmissions.championshipRoundId, roundId));
    expect(subs.length).toBe(0);

    const [group] = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.id, groupId));
    expect(group.status).not.toBe("SUBMITTED");
  });
});

async function roundsByNumber(championshipId: string) {
  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));
  const byNumber = new Map(rounds.map((r) => [r.roundNumber, r]));
  return byNumber;
}

describe("submitRoundGroup — automatic Round 2 pairing generation on Round 1 completion", () => {
  it("L: non-final Round 1 group submission does NOT generate Round 2 pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    const memberC = await makeMember();
    const memberD = await makeMember();
    createdMemberIds.push(memberA, memberB, memberC, memberD);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([
        memberA,
        memberB,
        memberC,
        memberD,
      ]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const group1 = await makeGroup(
      roundId,
      [byMember.get(memberA)!.id, byMember.get(memberB)!.id],
      1
    );
    await makeGroup(
      roundId,
      [byMember.get(memberC)!.id, byMember.get(memberD)!.id],
      2
    );

    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await fillAllHoles(roundId, byMember.get(memberB)!.id, memberB);
    // group 2 (C, D) left with no scores at all — round stays incomplete.

    const result = await submitRoundGroup({
      roundGroupId: group1,
      actingMemberId: memberA,
    });
    expect(result.roundComplete).toBe(false);

    const rounds = await roundsByNumber(championshipId);
    expect(rounds.get(1)!.status).not.toBe("COMPLETE");

    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBe(0);
  });

  it("M: final Round 1 group submission DOES generate Round 2 NET_STANDINGS pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const playerAId = byMember.get(memberA)!.id;
    const playerBId = byMember.get(memberB)!.id;

    const round1Group = await makeGroup(roundId, [playerAId, playerBId]);
    await fillAllHoles(roundId, playerAId, memberA);
    await fillAllHoles(roundId, playerBId, memberB);

    const r1Result = await submitRoundGroup({
      roundGroupId: round1Group,
      actingMemberId: memberA,
    });
    expect(r1Result.roundComplete).toBe(true);

    const rounds = await roundsByNumber(championshipId);
    expect(rounds.get(1)!.status).toBe("COMPLETE");

    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBeGreaterThan(0);

    const round2Generations = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, rounds.get(2)!.id));
    expect(round2Generations.length).toBe(1);
    expect(round2Generations[0].generationType).toBe("NET_STANDINGS");
  });
});

describe("submitRoundGroup — automatic Round 3 pairing generation on Round 2 completion", () => {
  it("O: non-final Round 2 group submission does NOT generate Round 3 pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    const memberC = await makeMember();
    const memberD = await makeMember();
    createdMemberIds.push(memberA, memberB, memberC, memberD);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([
        memberA,
        memberB,
        memberC,
        memberD,
      ]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    // Complete Round 1 with a single group covering all 4 active players so
    // Round 2 pairings auto-generate.
    const round1Group = await makeGroup(
      roundId,
      [
        byMember.get(memberA)!.id,
        byMember.get(memberB)!.id,
        byMember.get(memberC)!.id,
        byMember.get(memberD)!.id,
      ],
      1
    );
    await fillAllHoles(roundId, byMember.get(memberA)!.id, memberA);
    await fillAllHoles(roundId, byMember.get(memberB)!.id, memberB);
    await fillAllHoles(roundId, byMember.get(memberC)!.id, memberC);
    await fillAllHoles(roundId, byMember.get(memberD)!.id, memberD);

    const r1Result = await submitRoundGroup({
      roundGroupId: round1Group,
      actingMemberId: memberA,
    });
    expect(r1Result.roundComplete).toBe(true);

    const rounds = await roundsByNumber(championshipId);
    expect(rounds.get(1)!.status).toBe("COMPLETE");

    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBeGreaterThan(0);

    // Round 2 should have exactly 2 groups for 4 active players. Submit
    // only ONE of them, leaving the round incomplete.
    expect(round2Groups.length).toBeGreaterThanOrEqual(2);
    const group2A = round2Groups[0];
    const group2APlayers = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.roundGroupId, group2A.id));

    for (const gp of group2APlayers) {
      const memberId = players.find(
        (p) => p.id === gp.championshipPlayerId
      )!.memberId;
      await fillAllHoles(rounds.get(2)!.id, gp.championshipPlayerId, memberId);
    }
    // The other Round 2 group(s) are left with no scores — round stays
    // incomplete.

    const r2Result = await submitRoundGroup({
      roundGroupId: group2A.id,
      actingMemberId: memberA,
    });
    expect(r2Result.roundComplete).toBe(false);

    const roundsAfter = await roundsByNumber(championshipId);
    expect(roundsAfter.get(2)!.status).not.toBe("COMPLETE");

    const round3Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, roundsAfter.get(3)!.id));
    expect(round3Groups.length).toBe(0);
  });

  it("P: final Round 2 group submission DOES generate Round 3 NET_STANDINGS pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const playerAId = byMember.get(memberA)!.id;
    const playerBId = byMember.get(memberB)!.id;

    // Complete Round 1 -> Round 2 pairings auto-generate.
    const round1Group = await makeGroup(roundId, [playerAId, playerBId]);
    await fillAllHoles(roundId, playerAId, memberA);
    await fillAllHoles(roundId, playerBId, memberB);

    const r1Result = await submitRoundGroup({
      roundGroupId: round1Group,
      actingMemberId: memberA,
    });
    expect(r1Result.roundComplete).toBe(true);

    let rounds = await roundsByNumber(championshipId);
    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBeGreaterThan(0);

    // With only 2 active players, Round 2 will have a single group.
    const round2GroupId = round2Groups[0].id;
    await fillAllHoles(rounds.get(2)!.id, playerAId, memberA);
    await fillAllHoles(rounds.get(2)!.id, playerBId, memberB);

    const r2Result = await submitRoundGroup({
      roundGroupId: round2GroupId,
      actingMemberId: memberA,
    });
    expect(r2Result.roundComplete).toBe(true);

    rounds = await roundsByNumber(championshipId);
    expect(rounds.get(2)!.status).toBe("COMPLETE");

    const round3Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(3)!.id));
    expect(round3Groups.length).toBeGreaterThan(0);

    const round3Generations = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, rounds.get(3)!.id));
    expect(round3Generations.length).toBe(1);
    expect(round3Generations[0].generationType).toBe("NET_STANDINGS");
  });
});

describe("submitRoundGroup — automatic Round 4 pairing generation on Round 3 completion", () => {
  it("Q: non-final Round 3 group submission does NOT generate Round 4 pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    const memberC = await makeMember();
    const memberD = await makeMember();
    const memberE = await makeMember();
    createdMemberIds.push(memberA, memberB, memberC, memberD, memberE);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([
        memberA,
        memberB,
        memberC,
        memberD,
        memberE,
      ]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const allMembers = [memberA, memberB, memberC, memberD, memberE];

    // 5 active players -> computeGroupSizes(5) = [3, 2], so every round
    // reliably splits into 2 groups. Complete Round 1 via 2 manual groups
    // (3 + 2) so Round 2 pairings auto-generate.
    const round1GroupX = await makeGroup(
      roundId,
      [
        byMember.get(memberA)!.id,
        byMember.get(memberB)!.id,
        byMember.get(memberC)!.id,
      ],
      1
    );
    const round1GroupY = await makeGroup(
      roundId,
      [byMember.get(memberD)!.id, byMember.get(memberE)!.id],
      2
    );
    for (const memberId of allMembers) {
      await fillAllHoles(roundId, byMember.get(memberId)!.id, memberId);
    }

    const r1ResultX = await submitRoundGroup({
      roundGroupId: round1GroupX,
      actingMemberId: memberA,
    });
    expect(r1ResultX.roundComplete).toBe(false);
    const r1ResultY = await submitRoundGroup({
      roundGroupId: round1GroupY,
      actingMemberId: memberD,
    });
    expect(r1ResultY.roundComplete).toBe(true);

    let rounds = await roundsByNumber(championshipId);
    expect(rounds.get(1)!.status).toBe("COMPLETE");

    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBeGreaterThanOrEqual(2);

    // Complete Round 2 (submit every auto-generated group) so Round 3
    // pairings auto-generate.
    for (const group of round2Groups) {
      const groupPlayers = await db
        .select()
        .from(roundGroupPlayers)
        .where(eq(roundGroupPlayers.roundGroupId, group.id));
      for (const gp of groupPlayers) {
        const memberId = players.find(
          (p) => p.id === gp.championshipPlayerId
        )!.memberId;
        await fillAllHoles(
          rounds.get(2)!.id,
          gp.championshipPlayerId,
          memberId
        );
      }
    }
    let lastR2Result: { roundComplete: boolean } | undefined;
    for (const group of round2Groups) {
      const groupPlayers = await db
        .select()
        .from(roundGroupPlayers)
        .where(eq(roundGroupPlayers.roundGroupId, group.id));
      const actingMemberId = players.find(
        (p) => p.id === groupPlayers[0].championshipPlayerId
      )!.memberId;
      lastR2Result = await submitRoundGroup({
        roundGroupId: group.id,
        actingMemberId,
      });
    }
    expect(lastR2Result!.roundComplete).toBe(true);

    rounds = await roundsByNumber(championshipId);
    expect(rounds.get(2)!.status).toBe("COMPLETE");

    const round3Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(3)!.id));
    expect(round3Groups.length).toBeGreaterThanOrEqual(2);

    // Submit only ONE Round 3 group, leaving the round incomplete.
    const group3A = round3Groups[0];
    const group3APlayers = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.roundGroupId, group3A.id));
    for (const gp of group3APlayers) {
      const memberId = players.find(
        (p) => p.id === gp.championshipPlayerId
      )!.memberId;
      await fillAllHoles(rounds.get(3)!.id, gp.championshipPlayerId, memberId);
    }
    // The other Round 3 group(s) are left with no scores — round stays
    // incomplete.

    const group3AActingMemberId = players.find(
      (p) => p.id === group3APlayers[0].championshipPlayerId
    )!.memberId;
    const r3Result = await submitRoundGroup({
      roundGroupId: group3A.id,
      actingMemberId: group3AActingMemberId,
    });
    expect(r3Result.roundComplete).toBe(false);

    const roundsAfter = await roundsByNumber(championshipId);
    expect(roundsAfter.get(3)!.status).not.toBe("COMPLETE");

    const round4Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, roundsAfter.get(4)!.id));
    expect(round4Groups.length).toBe(0);
  });

  it("R: final Round 3 group submission DOES generate Round 4 NET_STANDINGS pairings", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));
    const playerAId = byMember.get(memberA)!.id;
    const playerBId = byMember.get(memberB)!.id;

    // Complete Round 1 -> Round 2 pairings auto-generate.
    const round1Group = await makeGroup(roundId, [playerAId, playerBId]);
    await fillAllHoles(roundId, playerAId, memberA);
    await fillAllHoles(roundId, playerBId, memberB);

    const r1Result = await submitRoundGroup({
      roundGroupId: round1Group,
      actingMemberId: memberA,
    });
    expect(r1Result.roundComplete).toBe(true);

    let rounds = await roundsByNumber(championshipId);
    const round2Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
    expect(round2Groups.length).toBeGreaterThan(0);

    // With only 2 active players, Round 2 will have a single group.
    const round2GroupId = round2Groups[0].id;
    await fillAllHoles(rounds.get(2)!.id, playerAId, memberA);
    await fillAllHoles(rounds.get(2)!.id, playerBId, memberB);

    const r2Result = await submitRoundGroup({
      roundGroupId: round2GroupId,
      actingMemberId: memberA,
    });
    expect(r2Result.roundComplete).toBe(true);

    rounds = await roundsByNumber(championshipId);
    const round3Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(3)!.id));
    expect(round3Groups.length).toBeGreaterThan(0);

    // With only 2 active players, Round 3 will have a single group.
    const round3GroupId = round3Groups[0].id;
    await fillAllHoles(rounds.get(3)!.id, playerAId, memberA);
    await fillAllHoles(rounds.get(3)!.id, playerBId, memberB);

    const r3Result = await submitRoundGroup({
      roundGroupId: round3GroupId,
      actingMemberId: memberA,
    });
    expect(r3Result.roundComplete).toBe(true);

    rounds = await roundsByNumber(championshipId);
    expect(rounds.get(3)!.status).toBe("COMPLETE");

    const round4Groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, rounds.get(4)!.id));
    expect(round4Groups.length).toBeGreaterThan(0);

    const round4Generations = await db
      .select()
      .from(pairingGenerations)
      .where(eq(pairingGenerations.championshipRoundId, rounds.get(4)!.id));
    expect(round4Generations.length).toBe(1);
    expect(round4Generations[0].generationType).toBe("NET_STANDINGS");
  });
});
/**
 * Plays all 4 rounds for a 2-active-player championship (single group
 * per round, as already established by tests M/R above), submitting
 * each round's single group with a distinct per-player, per-round gross
 * score. Returns the championshipId and the two players' championship-
 * player rows so callers can assert on final standings.
 */
async function playAllFourRounds(
  memberA: string,
  memberB: string,
  roundId: string,
  championshipId: string,
  players: { id: string; memberId: string }[],
  grossPerHoleA: number,
  grossPerHoleB: number
) {
  const byMember = new Map(players.map((p) => [p.memberId, p]));
  const playerAId = byMember.get(memberA)!.id;
  const playerBId = byMember.get(memberB)!.id;

  const round1Group = await makeGroup(roundId, [playerAId, playerBId]);
  await fillAllHoles(roundId, playerAId, memberA, grossPerHoleA);
  await fillAllHoles(roundId, playerBId, memberB, grossPerHoleB);
  const r1 = await submitRoundGroup({
    roundGroupId: round1Group,
    actingMemberId: memberA,
  });
  expect(r1.roundComplete).toBe(true);

  let rounds = await roundsByNumber(championshipId);
  const round2Groups = await db
    .select()
    .from(roundGroups)
    .where(eq(roundGroups.championshipRoundId, rounds.get(2)!.id));
  const round2GroupId = round2Groups[0].id;
  await fillAllHoles(rounds.get(2)!.id, playerAId, memberA, grossPerHoleA);
  await fillAllHoles(rounds.get(2)!.id, playerBId, memberB, grossPerHoleB);
  const r2 = await submitRoundGroup({
    roundGroupId: round2GroupId,
    actingMemberId: memberA,
  });
  expect(r2.roundComplete).toBe(true);

  rounds = await roundsByNumber(championshipId);
  const round3Groups = await db
    .select()
    .from(roundGroups)
    .where(eq(roundGroups.championshipRoundId, rounds.get(3)!.id));
  const round3GroupId = round3Groups[0].id;
  await fillAllHoles(rounds.get(3)!.id, playerAId, memberA, grossPerHoleA);
  await fillAllHoles(rounds.get(3)!.id, playerBId, memberB, grossPerHoleB);
  const r3 = await submitRoundGroup({
    roundGroupId: round3GroupId,
    actingMemberId: memberA,
  });
  expect(r3.roundComplete).toBe(true);

  rounds = await roundsByNumber(championshipId);
  const round4Groups = await db
    .select()
    .from(roundGroups)
    .where(eq(roundGroups.championshipRoundId, rounds.get(4)!.id));
  const round4GroupId = round4Groups[0].id;
  await fillAllHoles(rounds.get(4)!.id, playerAId, memberA, grossPerHoleA);
  await fillAllHoles(rounds.get(4)!.id, playerBId, memberB, grossPerHoleB);
  const r4 = await submitRoundGroup({
    roundGroupId: round4GroupId,
    actingMemberId: memberA,
  });

  return { r4, playerAId, playerBId };
}

describe("submitRoundGroup — automatic championship finalization on Round 4 completion", () => {
  it("A: unique winner — Round 4 completion persists final positions, sets championMemberId, and marks the championship COMPLETED", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);

    // Both new members start with the same (default/0) frozen handicap,
    // so a lower gross score for A on every round guarantees A has a
    // strictly lower cumulative net — a unique winner.
    const { r4, playerAId, playerBId } = await playAllFourRounds(
      memberA,
      memberB,
      roundId,
      championshipId,
      players,
      3, // A: 3 per hole -> 54 gross per round
      5, // B: 5 per hole -> 90 gross per round
      );
    expect(r4.roundComplete).toBe(true);

    const rounds = await roundsByNumber(championshipId);
    expect(rounds.get(4)!.status).toBe("COMPLETE");

    const [playerARow] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, playerAId));
    const [playerBRow] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, playerBId));
    expect(playerARow.finalPosition).toBe(1);
    expect(playerBRow.finalPosition).toBe(2);

    const [champRow] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(champRow.championMemberId).toBe(memberA);
    expect(champRow.status).toBe("COMPLETED");
  });

  it("B: tied first place — no arbitrary champion is selected and the championship is left ready for Playoff Mode", async () => {
    const memberA = await makeMember();
    const memberB = await makeMember();
    createdMemberIds.push(memberA, memberB);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([memberA, memberB]);
    createdChampionshipIds.push(championshipId);

    // Identical gross scores every round for both players -> identical
    // cumulativeGross AND cumulativeNet (same frozenHandicap) -> tied
    // for first place.
    const { r4, playerAId, playerBId } = await playAllFourRounds(
      memberA,
      memberB,
      roundId,
      championshipId,
      players,
      4,
      4,
    );
    expect(r4.roundComplete).toBe(true);

    const rounds = await roundsByNumber(championshipId);
    expect(rounds.get(4)!.status).toBe("COMPLETE");

    // finalPosition IS still persisted for both tied participants.
    const [playerARow] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, playerAId));
    const [playerBRow] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, playerBId));
    expect(playerARow.finalPosition).toBe(1);
    expect(playerBRow.finalPosition).toBe(1);

    // No arbitrary champion picked, and the championship is NOT marked
    // COMPLETED — left ready for a future Playoff Mode to resolve.
    const [champRow] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(champRow.championMemberId).toBeNull();
    expect(champRow.status).not.toBe("COMPLETED");
  });
});