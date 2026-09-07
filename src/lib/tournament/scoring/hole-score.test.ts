import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { holeScores, championshipRounds, championshipPlayers } from "@/db/schema";
import { saveHoleScore, ScoreAuthorizationError } from "./hole-score";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
  cleanupChampionship,
  cleanupMember,
} from "./test-helpers";

/**
 * One shared minimal fixture for the whole file: a single championship,
 * a single round, 3 ACTIVE participants + 1 admin + 1 outsider (never
 * enrolled). Group 1 = players 0 & 1 (teammates). Group 2 = player 2
 * (a different group, for the "other group" case).
 */
let memberIds: string[];
let adminId: string;
let outsiderId: string;
let championshipId: string;
let roundId: string;
let byMember: Map<string, { id: string; memberId: string }>;

beforeAll(async () => {
  memberIds = [await makeMember(), await makeMember(), await makeMember()];
  adminId = await makeMember({ appRole: "ADMIN" });
  outsiderId = await makeMember();

  const result = await makeActiveChampionshipWithPlayers(memberIds);
  championshipId = result.championshipId;
  roundId = result.roundId;
  byMember = new Map(result.players.map((p) => [p.memberId, p]));

  await makeGroup(
    roundId,
    [byMember.get(memberIds[0])!.id, byMember.get(memberIds[1])!.id],
    1
  );
  await makeGroup(roundId, [byMember.get(memberIds[2])!.id], 2);
});

afterAll(async () => {
  await cleanupChampionship(championshipId);
  for (const id of [...memberIds, adminId, outsiderId]) {
    await cleanupMember(id);
  }
});

describe("saveHoleScore authorization", () => {
  it("1: player in a group can save their own hole score", async () => {
    const target = byMember.get(memberIds[0])!;
    const { holeScoreId } = await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: target.id,
      holeNumber: 1,
      grossScore: 4,
      actingMemberId: memberIds[0],
    });

    const [row] = await db
      .select()
      .from(holeScores)
      .where(eq(holeScores.id, holeScoreId));
    expect(row.grossScore).toBe(4);
  });

  it("2: player in a group can save a teammate's hole score", async () => {
    const target = byMember.get(memberIds[1])!;
    const { holeScoreId } = await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: target.id,
      holeNumber: 2,
      grossScore: 5,
      actingMemberId: memberIds[0],
    });
    expect(holeScoreId).toBeTruthy();
  });

  it("3: player in a different group is rejected", async () => {
    const target = byMember.get(memberIds[0])!;
    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 3,
        grossScore: 4,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });

  it("4: non-participant is rejected", async () => {
    const target = byMember.get(memberIds[0])!;
    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 4,
        grossScore: 4,
        actingMemberId: outsiderId,
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });

  it("5: admin override is allowed", async () => {
    const target = byMember.get(memberIds[0])!;
    const { holeScoreId } = await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: target.id,
      holeNumber: 5,
      grossScore: 3,
      actingMemberId: adminId,
    });
    expect(holeScoreId).toBeTruthy();
  });
});

describe("saveHoleScore validation (reuses shared fixture, uses solo player 2 / group 2)", () => {
  it("hole number must be 1-18", async () => {
    const target = byMember.get(memberIds[2])!;
    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 0,
        grossScore: 4,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 19,
        grossScore: 4,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });

  it("gross score must be a positive reasonable integer", async () => {
    const target = byMember.get(memberIds[2])!;
    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 6,
        grossScore: 0,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 6,
        grossScore: -3,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 6,
        grossScore: 21,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });

  it("saving the same player/hole again before submission updates the existing row instead of duplicating it", async () => {
    const target = byMember.get(memberIds[2])!;
    const first = await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: target.id,
      holeNumber: 7,
      grossScore: 4,
      actingMemberId: memberIds[2],
    });
    const second = await saveHoleScore({
      championshipRoundId: roundId,
      championshipPlayerId: target.id,
      holeNumber: 7,
      grossScore: 6,
      actingMemberId: memberIds[2],
    });
    expect(second.holeScoreId).toBe(first.holeScoreId);

    const rows = await db
      .select()
      .from(holeScores)
      .where(
        and(
          eq(holeScores.championshipRoundId, roundId),
          eq(holeScores.championshipPlayerId, target.id),
          eq(holeScores.holeNumber, 7)
        )
      );
    expect(rows.length).toBe(1);
    expect(rows[0].grossScore).toBe(6);
  });

  it("DISQUALIFIED target participant cannot receive new normal scores", async () => {
    const target = byMember.get(memberIds[2])!;
    await db
      .update(championshipPlayers)
      .set({ participantStatus: "DISQUALIFIED" })
      .where(eq(championshipPlayers.id, target.id));

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 8,
        grossScore: 4,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });

  it("WITHDRAWN target participant cannot receive new normal scores", async () => {
    const target = byMember.get(memberIds[2])!;
    await db
      .update(championshipPlayers)
      .set({ participantStatus: "WITHDRAWN" })
      .where(eq(championshipPlayers.id, target.id));

    await expect(
      saveHoleScore({
        championshipRoundId: roundId,
        championshipPlayerId: target.id,
        holeNumber: 8,
        grossScore: 4,
        actingMemberId: memberIds[2],
      })
    ).rejects.toThrow(ScoreAuthorizationError);
  });
});

describe("saveHoleScore round status lifecycle (isolated fixture — order-sensitive)", () => {
  let lifecycleMemberId: string;
  let lifecycleChampionshipId: string;
  let lifecycleRoundId: string;
  let lifecyclePlayerId: string;

  beforeAll(async () => {
    lifecycleMemberId = await makeMember();
    const result = await makeActiveChampionshipWithPlayers([lifecycleMemberId]);
    lifecycleChampionshipId = result.championshipId;
    lifecycleRoundId = result.roundId;
    lifecyclePlayerId = result.players[0].id;
    await makeGroup(lifecycleRoundId, [lifecyclePlayerId], 1);
  });

  afterAll(async () => {
    await cleanupChampionship(lifecycleChampionshipId);
    await cleanupMember(lifecycleMemberId);
  });

  it("saving the first valid score transitions NOT_STARTED -> IN_PROGRESS", async () => {
    const [before] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, lifecycleRoundId));
    expect(before.status).toBe("NOT_STARTED");

    await saveHoleScore({
      championshipRoundId: lifecycleRoundId,
      championshipPlayerId: lifecyclePlayerId,
      holeNumber: 1,
      grossScore: 4,
      actingMemberId: lifecycleMemberId,
    });

    const [after] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, lifecycleRoundId));
    expect(after.status).toBe("IN_PROGRESS");
  });

  it("an IN_PROGRESS round stays IN_PROGRESS when more scores are saved", async () => {
    await saveHoleScore({
      championshipRoundId: lifecycleRoundId,
      championshipPlayerId: lifecyclePlayerId,
      holeNumber: 2,
      grossScore: 5,
      actingMemberId: lifecycleMemberId,
    });

    const [after] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, lifecycleRoundId));
    expect(after.status).toBe("IN_PROGRESS");
  });

  it("a COMPLETE round rejects normal score entry and never regresses to IN_PROGRESS", async () => {
    await db
      .update(championshipRounds)
      .set({ status: "COMPLETE" })
      .where(eq(championshipRounds.id, lifecycleRoundId));

    await expect(
      saveHoleScore({
        championshipRoundId: lifecycleRoundId,
        championshipPlayerId: lifecyclePlayerId,
        holeNumber: 3,
        grossScore: 4,
        actingMemberId: lifecycleMemberId,
      })
    ).rejects.toThrow(ScoreAuthorizationError);

    const [after] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, lifecycleRoundId));
    expect(after.status).toBe("COMPLETE");
  });
});
