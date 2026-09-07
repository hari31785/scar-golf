import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  championshipRounds,
  scorecardSubmissions,
  scoreAuditLog,
  holeScores,
  playedRounds,
} from "@/db/schema";
import { saveHoleScore } from "./hole-score";
import { submitRoundGroup } from "./submit-group";
import {
  correctSubmittedHoleScore,
  CorrectionAuthorizationError,
} from "./correction";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
  cleanupChampionship,
  cleanupMember,
} from "./test-helpers";
import { calculateHandicapForMember } from "@/lib/handicap/service";

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

async function setupSubmittedSoloGroup() {
  const memberA = await makeMember();
  const adminId = await makeMember({ appRole: "ADMIN" });
  createdMemberIds.push(memberA, adminId);
  const { championshipId, roundId, players } =
    await makeActiveChampionshipWithPlayers([memberA]);
  createdChampionshipIds.push(championshipId);
  const player = players.find((p) => p.memberId === memberA)!;
  const groupId = await makeGroup(roundId, [player.id]);

  await fillAllHoles(roundId, player.id, memberA);
  await submitRoundGroup({ roundGroupId: groupId, actingMemberId: memberA });

  const [holeOne] = await db
    .select()
    .from(holeScores)
    .where(
      and(
        eq(holeScores.championshipRoundId, roundId),
        eq(holeScores.championshipPlayerId, player.id),
        eq(holeScores.holeNumber, 1)
      )
    );

  return { memberA, adminId, championshipId, roundId, player, holeOne };
}

describe("correctSubmittedHoleScore", () => {
  it("Q: admin correction after submission succeeds", async () => {
    const { adminId, holeOne } = await setupSubmittedSoloGroup();

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 7,
      actingMemberId: adminId,
      reason: "Scorer error",
    });

    const [updated] = await db
      .select()
      .from(holeScores)
      .where(eq(holeScores.id, holeOne.id));
    expect(updated.grossScore).toBe(7);
  });

  it("R: normal player correction after submission fails", async () => {
    const { memberA, holeOne } = await setupSubmittedSoloGroup();

    await expect(
      correctSubmittedHoleScore({
        holeScoreId: holeOne.id,
        newGrossScore: 7,
        actingMemberId: memberA,
      })
    ).rejects.toThrow(CorrectionAuthorizationError);
  });

  it("S: audit row records original/new score, admin, timestamp, reason", async () => {
    const { adminId, holeOne, roundId, player } = await setupSubmittedSoloGroup();

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 6,
      actingMemberId: adminId,
      reason: "Marker miscount",
    });

    const [log] = await db
      .select()
      .from(scoreAuditLog)
      .where(
        and(
          eq(scoreAuditLog.championshipRoundId, roundId),
          eq(scoreAuditLog.championshipPlayerId, player.id),
          eq(scoreAuditLog.holeNumber, 1)
        )
      );
    expect(log.originalGrossScore).toBe(4);
    expect(log.newGrossScore).toBe(6);
    expect(log.changedByMemberId).toBe(adminId);
    expect(log.reason).toBe("Marker miscount");
    expect(log.changedAt).toBeInstanceOf(Date);
  });

  it("T: multiple corrections create multiple audit rows and preserve history", async () => {
    const { adminId, holeOne, roundId, player } = await setupSubmittedSoloGroup();

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 5,
      actingMemberId: adminId,
    });
    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 6,
      actingMemberId: adminId,
    });

    const logs = await db
      .select()
      .from(scoreAuditLog)
      .where(
        and(
          eq(scoreAuditLog.championshipRoundId, roundId),
          eq(scoreAuditLog.championshipPlayerId, player.id),
          eq(scoreAuditLog.holeNumber, 1)
        )
      );
    expect(logs.length).toBe(2);
    expect(logs.map((l) => [l.originalGrossScore, l.newGrossScore])).toEqual([
      [4, 5],
      [5, 6],
    ]);
  });

  it("U: scorecard grossTotal updates after admin correction", async () => {
    const { adminId, holeOne, roundId, player } = await setupSubmittedSoloGroup();

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 9, // was 4, +5
      actingMemberId: adminId,
    });

    const [submission] = await db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.championshipRoundId, roundId),
          eq(scorecardSubmissions.championshipPlayerId, player.id)
        )
      );
    expect(submission.grossTotal).toBe(72 - 4 + 9);
  });

  it("V: correcting an already-COMPLETE round does not reopen it, and preserves submission metadata", async () => {
    const { adminId, holeOne, roundId, player } = await setupSubmittedSoloGroup();

    const [submissionBefore] = await db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.championshipRoundId, roundId),
          eq(scorecardSubmissions.championshipPlayerId, player.id)
        )
      );

    const [roundBefore] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(roundBefore.status).toBe("COMPLETE");

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 8,
      actingMemberId: adminId,
    });

    const [roundAfter] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(roundAfter.status).toBe("COMPLETE");

    const [submissionAfter] = await db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.championshipRoundId, roundId),
          eq(scorecardSubmissions.championshipPlayerId, player.id)
        )
      );
    expect(submissionAfter.submittedAt.getTime()).toBe(
      submissionBefore.submittedAt.getTime()
    );
    expect(submissionAfter.submittedByMemberId).toBe(
      submissionBefore.submittedByMemberId
    );
  });

  it("X: corrected championship score is reflected in future handicap history without touching HISTORICAL_IMPORT rows", async () => {
    const { adminId, memberA, holeOne, roundId, player } =
      await setupSubmittedSoloGroup();
    void roundId;
    void player;

    // Seed a HISTORICAL_IMPORT row for the same member to prove it's untouched.
    await db.insert(playedRounds).values({
      memberId: memberA,
      playedAt: new Date("2020-01-01"),
      courseName: "Old Historical Course",
      grossScore: 100,
      courseRating: 70.0,
      slope: 120,
      source: "HISTORICAL_IMPORT",
      sourceRef: `x-test-historical:${memberA}`,
    });

    const before = await calculateHandicapForMember(memberA);
    void before;

    await correctSubmittedHoleScore({
      holeScoreId: holeOne.id,
      newGrossScore: 1, // dramatically lowers the championship round's gross total
      actingMemberId: adminId,
    });

    // The corrected gross total must be reflected in the CHAMPIONSHIP
    // played_rounds row that future handicap calculations read from.
    // (finalHandicap itself is not asserted here — it can legitimately
    // stay unchanged if capped by maxHandicap on both sides of the
    // correction, so the played_rounds row is the reliable signal that
    // the correction was actually reconciled into handicap history.)
    const championshipRows = await db
      .select()
      .from(playedRounds)
      .where(
        and(
          eq(playedRounds.memberId, memberA),
          eq(playedRounds.source, "CHAMPIONSHIP")
        )
      );
    expect(championshipRows.length).toBe(1);
    expect(championshipRows[0].grossScore).toBe(69); // 18 holes of 4, one corrected to 1: 72 - 4 + 1

    const historicalRows = await db
      .select()
      .from(playedRounds)
      .where(
        and(
          eq(playedRounds.memberId, memberA),
          eq(playedRounds.source, "HISTORICAL_IMPORT")
        )
      );
    expect(historicalRows.length).toBe(1);
    expect(historicalRows[0].grossScore).toBe(100);
  });
});
