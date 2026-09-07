import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { championships, championshipRounds, championshipRoundHoles, members } from "@/db/schema";
import { createDraftChampionship } from "./create";
import {
  setRoundCourseSetup,
  setRoundHoles,
  setCompleteRoundSetup,
  validateCourseSetup,
  CourseSetupError,
  type HoleSetupInput,
} from "./course-setup";

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
  return 91000 + Math.floor(Math.random() * 900);
}

function testEmail(): string {
  return `scar-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

async function makeAdminMember() {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Admin",
      displayName: "Test Admin",
      email: testEmail(),
      membershipType: "ASSOCIATE",
      status: "ACTIVE",
      appRole: "ADMIN",
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  createdMemberIds.push(inserted.id);
  return inserted.id;
}

async function makeDraftChampionshipRound() {
  const year = testYear();
  const { championshipId } = await createDraftChampionship({
    year,
    name: `Course Setup Test ${year}`,
  });
  createdChampionshipIds.push(championshipId);

  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));
  const round1 = rounds.find((r) => r.roundNumber === 1)!;

  return { championshipId, roundId: round1.id };
}

const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const STANDARD_TOTAL_PAR = STANDARD_PARS.reduce((sum, p) => sum + p, 0); // 72

function standardHoles(): HoleSetupInput[] {
  return STANDARD_PARS.map((par, i) => ({
    holeNumber: i + 1,
    par,
    strokeIndex: i + 1,
  }));
}

describe("setRoundCourseSetup", () => {
  it("saves valid course + tee metadata", async () => {
    const { roundId } = await makeDraftChampionshipRound();

    await setRoundCourseSetup({
      championshipRoundId: roundId,
      courseSetup: {
        courseName: "Pebble Beach",
        city: "Pebble Beach, CA",
        teeName: "Blue",
        teeColor: "Blue",
        courseRating: 74.5,
        slope: 144,
        totalPar: STANDARD_TOTAL_PAR,
        yardage: 6828,
      },
    });

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));

    expect(round.courseName).toBe("Pebble Beach");
    expect(round.teeName).toBe("Blue");
    expect(round.teeColor).toBe("Blue");
    expect(round.courseRating).toBe(74.5);
    expect(round.slope).toBe(144);
    expect(round.par).toBe(STANDARD_TOTAL_PAR);
    expect(round.yardage).toBe(6828);
  });

  it("rejects a missing teeColor", async () => {
    const { roundId } = await makeDraftChampionshipRound();

    await expect(
      setRoundCourseSetup({
        championshipRoundId: roundId,
        courseSetup: {
          courseName: "Pebble Beach",
          teeName: "Blue",
          teeColor: "",
          courseRating: 74.5,
          slope: 144,
          totalPar: 72,
          yardage: 6828,
        },
      })
    ).rejects.toThrow(CourseSetupError);
  });

  it("rejects invalid rating/slope/yardage", async () => {
    const problems = validateCourseSetup({
      courseName: "Test",
      teeName: "Blue",
      teeColor: "Blue",
      courseRating: 300, // way out of range
      slope: 5, // way out of range
      totalPar: 72,
      yardage: 100, // way out of range
    });

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("Course rating"))).toBe(true);
    expect(problems.some((p) => p.includes("Slope"))).toBe(true);
    expect(problems.some((p) => p.includes("Yardage"))).toBe(true);

    const { roundId } = await makeDraftChampionshipRound();
    await expect(
      setRoundCourseSetup({
        championshipRoundId: roundId,
        courseSetup: {
          courseName: "Test",
          teeName: "Blue",
          teeColor: "Blue",
          courseRating: 300,
          slope: 5,
          totalPar: 72,
          yardage: 100,
        },
      })
    ).rejects.toThrow(CourseSetupError);
  });
});

describe("championship start requires complete valid round setup", () => {
  it("setRoundHoles rejects a hole layout whose par sum does not match the round's total par", async () => {
    const { roundId } = await makeDraftChampionshipRound();

    await setRoundCourseSetup({
      championshipRoundId: roundId,
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

    const badHoles = standardHoles();
    badHoles[0] = { ...badHoles[0], par: badHoles[0].par + 1 }; // sum now off by one

    await expect(
      setRoundHoles({ championshipRoundId: roundId, holes: badHoles })
    ).rejects.toThrow(CourseSetupError);
  });
});

describe("setCompleteRoundSetup", () => {
  it("saves course + tee metadata and the full hole layout together in one call", async () => {
    const { roundId } = await makeDraftChampionshipRound();
    const adminId = await makeAdminMember();

    await setCompleteRoundSetup({
      championshipRoundId: roundId,
      actingMemberId: adminId,
      courseSetup: {
        courseName: "Pebble Beach",
        city: "Pebble Beach, CA",
        teeName: "Blue",
        teeColor: "Blue",
        courseRating: 74.5,
        slope: 144,
        totalPar: STANDARD_TOTAL_PAR,
        yardage: 6828,
      },
      holes: standardHoles(),
    });

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(round.courseName).toBe("Pebble Beach");
    expect(round.par).toBe(STANDARD_TOTAL_PAR);

    const savedHoles = await db
      .select()
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, roundId));
    expect(savedHoles.length).toBe(18);
  });

  it("rejects invalid holes and leaves the round's course fields completely untouched", async () => {
    const { roundId } = await makeDraftChampionshipRound();
    const adminId = await makeAdminMember();

    const badHoles = standardHoles();
    badHoles[0] = { ...badHoles[0], par: badHoles[0].par + 1 }; // sum no longer matches totalPar

    await expect(
      setCompleteRoundSetup({
        championshipRoundId: roundId,
        actingMemberId: adminId,
        courseSetup: {
          courseName: "Should Not Save",
          teeName: "Blue",
          teeColor: "Blue",
          courseRating: 72.0,
          slope: 113,
          totalPar: STANDARD_TOTAL_PAR,
          yardage: 6500,
        },
        holes: badHoles,
      })
    ).rejects.toThrow(CourseSetupError);

    // Nothing was written — validation ran before any DB write.
    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(round.courseName).toBeNull();
    expect(round.par).toBeNull();

    const savedHoles = await db
      .select()
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, roundId));
    expect(savedHoles.length).toBe(0);
  });

  it("rolls back the round-level update if the hole layout is invalid on a re-save, preserving the prior saved setup", async () => {
    const { roundId } = await makeDraftChampionshipRound();
    const adminId = await makeAdminMember();

    // First, a valid combined save.
    await setCompleteRoundSetup({
      championshipRoundId: roundId,
      actingMemberId: adminId,
      courseSetup: {
        courseName: "Original Course",
        teeName: "Blue",
        teeColor: "Blue",
        courseRating: 72.0,
        slope: 113,
        totalPar: STANDARD_TOTAL_PAR,
        yardage: 6500,
      },
      holes: standardHoles(),
    });

    // Now attempt to re-save with a DIFFERENT course name but an
    // invalid hole layout — this must not partially apply the new
    // course name while leaving holes stale; the whole attempt must
    // roll back and leave the ORIGINAL saved setup unchanged.
    const badHoles = standardHoles();
    badHoles[0] = { ...badHoles[0], par: badHoles[0].par + 1 };

    await expect(
      setCompleteRoundSetup({
        championshipRoundId: roundId,
        actingMemberId: adminId,
        courseSetup: {
          courseName: "Attempted New Course",
          teeName: "White",
          teeColor: "White",
          courseRating: 71.0,
          slope: 120,
          totalPar: STANDARD_TOTAL_PAR,
          yardage: 6200,
        },
        holes: badHoles,
      })
    ).rejects.toThrow(CourseSetupError);

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    // Rolled back — still the original course, not the attempted one.
    expect(round.courseName).toBe("Original Course");
    expect(round.teeName).toBe("Blue");

    const savedHoles = await db
      .select()
      .from(championshipRoundHoles)
      .where(eq(championshipRoundHoles.championshipRoundId, roundId))
      .orderBy(championshipRoundHoles.holeNumber);
    expect(savedHoles.length).toBe(18);
    expect(savedHoles[0].par).toBe(standardHoles()[0].par); // original par, unchanged
  });

  it("rejects a non-ADMIN acting member and leaves the round unchanged", async () => {
    const { roundId } = await makeDraftChampionshipRound();

    const [nonAdmin] = await db
      .insert(members)
      .values({
        firstName: "Test",
        lastName: "Player",
        displayName: "Test Player",
        email: testEmail(),
        membershipType: "ASSOCIATE",
        status: "ACTIVE",
        appRole: "PLAYER",
        joinedAt: new Date(),
      })
      .returning({ id: members.id });
    createdMemberIds.push(nonAdmin.id);

    await expect(
      setCompleteRoundSetup({
        championshipRoundId: roundId,
        actingMemberId: nonAdmin.id,
        courseSetup: {
          courseName: "Should Not Save",
          teeName: "Blue",
          teeColor: "Blue",
          courseRating: 72.0,
          slope: 113,
          totalPar: STANDARD_TOTAL_PAR,
          yardage: 6500,
        },
        holes: standardHoles(),
      })
    ).rejects.toThrow(CourseSetupError);

    const [round] = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.id, roundId));
    expect(round.courseName).toBeNull();
  });
});
