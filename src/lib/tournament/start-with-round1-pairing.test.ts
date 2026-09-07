import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  roundGroups,
  roundGroupPlayers,
  members,
} from "@/db/schema";
import { createDraftChampionship } from "./create";
import { addPlayerToChampionship } from "./enrollment";
import { setRoundCourseSetup, setRoundHoles } from "./course-setup";
import { startChampionshipWithRound1Pairing } from "./start-with-round1-pairing";

const createdChampionshipIds: string[] = [];
const createdMemberIds: string[] = [];

afterEach(async () => {
  for (const id of createdChampionshipIds.splice(0)) {
    await db.delete(championships).where(eq(championships.id, id));
  }
  for (const id of createdMemberIds.splice(0)) {
    await db.delete(members).where(eq(members.id, id));
  }
});

function testYear(): number {
  return 94000 + Math.floor(Math.random() * 900);
}

function testEmail(): string {
  return `scar-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

async function makeActiveMember() {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Golfer",
      displayName: "Test Golfer",
      email: testEmail(),
      membershipType: "PERMANENT",
      status: "ACTIVE",
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  createdMemberIds.push(inserted.id);
  return inserted.id;
}

const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const STANDARD_TOTAL_PAR = STANDARD_PARS.reduce((sum, p) => sum + p, 0); // 72

async function makeReadyDraftChampionship(memberIds: string[]) {
  const year = testYear();
  const { championshipId } = await createDraftChampionship({
    year,
    name: `Start+Pairing Test ${year}`,
  });
  createdChampionshipIds.push(championshipId);

  for (const memberId of memberIds) {
    await addPlayerToChampionship({ championshipId, memberId });
  }

  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));

  for (const round of rounds) {
    await setRoundCourseSetup({
      championshipRoundId: round.id,
      courseSetup: {
        courseName: "Test Course",
        teeName: "Blue",
        teeColor: "Blue",
        courseRating: 72.0,
        slope: 113,
        totalPar: STANDARD_TOTAL_PAR,
        yardage: 6500,
      },
    });
    await setRoundHoles({
      championshipRoundId: round.id,
      holes: STANDARD_PARS.map((par, i) => ({ holeNumber: i + 1, par, strokeIndex: i + 1 })),
    });
  }

  const round1 = rounds.find((r) => r.roundNumber === 1)!;
  return { championshipId, round1Id: round1.id };
}

describe("startChampionshipWithRound1Pairing", () => {
  it("starts a ready DRAFT championship and persists Round 1 groups atomically", async () => {
    const memberIds = [
      await makeActiveMember(),
      await makeActiveMember(),
      await makeActiveMember(),
      await makeActiveMember(),
    ];
    const { championshipId, round1Id } = await makeReadyDraftChampionship(memberIds);

    const result = await startChampionshipWithRound1Pairing({ championshipId });
    expect(result.groupIds.length).toBeGreaterThan(0);

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("ACTIVE");

    const players = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    for (const player of players) {
      expect(player.frozenHandicap).not.toBeNull();
    }

    const groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, round1Id));
    expect(groups.length).toBe(result.groupIds.length);

    const groupPlayers = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, round1Id));
    expect(groupPlayers.length).toBe(memberIds.length);
  });

  it("leaves the championship DRAFT with no pairings when start itself fails (no active participants)", async () => {
    const { championshipId } = await makeReadyDraftChampionship([]); // no participants at all

    await expect(
      startChampionshipWithRound1Pairing({ championshipId })
    ).rejects.toThrow();

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("DRAFT");

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));
    const round1 = rounds.find((r) => r.roundNumber === 1)!;
    const groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, round1.id));
    expect(groups.length).toBe(0);
  });

  it("rolls back the championship start (handicap freeze + ACTIVE transition) when Round 1 pairing generation fails", async () => {
    const memberIds = [await makeActiveMember(), await makeActiveMember()];
    const { championshipId, round1Id } = await makeReadyDraftChampionship(memberIds);

    // Force the pairing step to fail by pre-inserting a group for
    // Round 1 — generateAndPersistRound1Pairing rejects if the round
    // already has any groups. Start's own preconditions are otherwise
    // fully satisfied, isolating this as a pairing-step failure.
    const [preexistingGroup] = await db
      .insert(roundGroups)
      .values({ championshipRoundId: round1Id, groupNumber: 1 })
      .returning({ id: roundGroups.id });

    await expect(
      startChampionshipWithRound1Pairing({ championshipId })
    ).rejects.toThrow();

    // Rolled back: championship must still be DRAFT, and no
    // handicaps should have been frozen.
    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("DRAFT");

    const players = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    for (const player of players) {
      expect(player.frozenHandicap).toBeNull();
    }

    // Only the pre-existing (manually inserted) group remains — the
    // transaction did not add any new groups/group-players.
    const groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, round1Id));
    expect(groups.length).toBe(1);
    expect(groups[0].id).toBe(preexistingGroup.id);

    const groupPlayers = await db
      .select()
      .from(roundGroupPlayers)
      .where(
        and(
          eq(roundGroupPlayers.championshipRoundId, round1Id),
          eq(roundGroupPlayers.roundGroupId, preexistingGroup.id)
        )
      );
    expect(groupPlayers.length).toBe(0);
  });
});
