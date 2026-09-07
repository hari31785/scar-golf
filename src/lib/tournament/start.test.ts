import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  championships,
  members,
  championshipPlayers,
  championshipRounds,
  playedRounds,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDraftChampionship } from "./create";
import { addPlayerToChampionship } from "./enrollment";
import { startChampionship } from "./start";
import { calculateHandicapForMember } from "@/lib/handicap/service";
import { setRoundCourseSetup, setRoundHoles } from "./course-setup";

function testYear(): number {
  return 92000 + Math.floor(Math.random() * 900);
}

function testEmail(): string {
  return `scar-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

const createdChampionshipIds: string[] = [];
const createdMemberIds: string[] = [];

afterEach(async () => {
  for (const id of createdChampionshipIds.splice(0)) {
    await db.delete(championships).where(eq(championships.id, id));
  }
  for (const id of createdMemberIds.splice(0)) {
    // played_rounds cascade-delete with the member.
    await db.delete(members).where(eq(members.id, id));
  }
});

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

/** Inserts 20 identical, deterministic rounds -> differential 18 for every round -> final handicap 18. */
async function seedTwentyRounds(memberId: string, baseDate = new Date("2024-01-01")) {
  const rows = Array.from({ length: 20 }, (_, i) => {
    const playedAt = new Date(baseDate);
    playedAt.setDate(playedAt.getDate() + i);
    return {
      memberId,
      playedAt,
      courseName: "Test Course",
      grossScore: 90,
      courseRating: 72.0,
      slope: 113,
      source: "HISTORICAL_IMPORT" as const,
    };
  });
  await db.insert(playedRounds).values(rows);
}

async function makeDraftChampionshipWithParticipant(memberId: string) {
  const year = testYear();
  const { championshipId } = await createDraftChampionship({
    year,
    name: `Start Test ${year}`,
  });
  createdChampionshipIds.push(championshipId);
  await addPlayerToChampionship({ championshipId, memberId });
  await seedCompleteRoundSetup(championshipId);
  return championshipId;
}

const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const STANDARD_TOTAL_PAR = STANDARD_PARS.reduce((sum, p) => sum + p, 0); // 72

/** Sets a complete, valid course/tee + 18-hole setup on all 4 rounds of a DRAFT championship. */
async function seedCompleteRoundSetup(championshipId: string) {
  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));

  for (const round of rounds) {
    await setRoundCourseSetup({
      championshipRoundId: round.id,
      courseSetup: {
        courseName: "Test Course",
        city: "Test City",
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
      holes: STANDARD_PARS.map((par, i) => ({
        holeNumber: i + 1,
        par,
        strokeIndex: i + 1,
      })),
    });
  }
}


describe("startChampionship", () => {
  it("D: freezes the currently-calculated live handicap into championship_players.frozenHandicap", async () => {
    const memberId = await makeActiveMember();
    await seedTwentyRounds(memberId);
    const championshipId = await makeDraftChampionshipWithParticipant(memberId);

    const liveBefore = await calculateHandicapForMember(memberId);
    await startChampionship(championshipId);

    const [row] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));

    expect(row.frozenHandicap).toBe(liveBefore.finalHandicap);
    expect(row.frozenHandicap).toBe(18);
  });

  it("E: frozen handicap remains unchanged even after new historical rounds change the live handicap", async () => {
    const memberId = await makeActiveMember();
    await seedTwentyRounds(memberId);
    const championshipId = await makeDraftChampionshipWithParticipant(memberId);

    await startChampionship(championshipId);
    const [before] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    const frozenAtStart = before.frozenHandicap;

    // Add a brand-new, much lower-scoring round — this changes the
    // member's LIVE handicap but must NOT touch the already-frozen value.
    await db.insert(playedRounds).values({
      memberId,
      playedAt: new Date("2024-06-01"),
      courseName: "New Course",
      grossScore: 65,
      courseRating: 72.0,
      slope: 113,
      source: "HISTORICAL_IMPORT",
    });

    const liveAfter = await calculateHandicapForMember(memberId);
    expect(liveAfter.finalHandicap).not.toBe(frozenAtStart);

    const [after] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(after.frozenHandicap).toBe(frozenAtStart);
  });

  it("G: cannot start an already-ACTIVE championship", async () => {
    const memberId = await makeActiveMember();
    await seedTwentyRounds(memberId);
    const championshipId = await makeDraftChampionshipWithParticipant(memberId);

    await startChampionship(championshipId);
    await expect(startChampionship(championshipId)).rejects.toThrow();

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("ACTIVE");
  });

  it("H: stores a membership type snapshot at start time", async () => {
    const memberId = await makeActiveMember(); // PERMANENT
    await seedTwentyRounds(memberId);
    const championshipId = await makeDraftChampionshipWithParticipant(memberId);

    await startChampionship(championshipId);

    const [row] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(row.membershipTypeSnapshot).toBe("PERMANENT");
  });

  it("rejects starting a championship with zero active participants", async () => {
    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `Empty ${year}`,
    });
    createdChampionshipIds.push(championshipId);

    await expect(startChampionship(championshipId)).rejects.toThrow();
  });

  it("rejects starting a championship when round course/tee or hole setup is incomplete", async () => {
    const memberId = await makeActiveMember();
    await seedTwentyRounds(memberId);
    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `Incomplete Setup ${year}`,
    });
    createdChampionshipIds.push(championshipId);
    await addPlayerToChampionship({ championshipId, memberId });
    // Deliberately do NOT call seedCompleteRoundSetup — rounds have no
    // course/tee/hole data at all.

    await expect(startChampionship(championshipId)).rejects.toThrow();

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("DRAFT");
  });
});
