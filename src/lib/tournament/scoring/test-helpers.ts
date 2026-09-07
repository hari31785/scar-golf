import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  roundGroups,
  roundGroupPlayers,
  members,
} from "@/db/schema";
import { createDraftChampionship } from "@/lib/tournament/create";
import { addPlayerToChampionship } from "@/lib/tournament/enrollment";
import { startChampionship } from "@/lib/tournament/start";
import { setRoundCourseSetup, setRoundHoles } from "@/lib/tournament/course-setup";

export function testEmail(): string {
  return `scar-scoring-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@example.invalid`;
}

export function testYear(): number {
  return 93000 + Math.floor(Math.random() * 900);
}

export async function makeMember(opts?: {
  status?: "ACTIVE" | "INACTIVE";
  appRole?: "PLAYER" | "ADMIN";
}) {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Golfer",
      displayName: "Test Golfer",
      email: testEmail(),
      membershipType: "PERMANENT",
      status: opts?.status ?? "ACTIVE",
      appRole: opts?.appRole ?? "PLAYER",
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  return inserted.id;
}

/**
 * A standard 18-hole layout summing to par 72 (10 par-4s, 4 par-3s, 4
 * par-5s), with stroke indexes simply assigned 1-18 in hole order —
 * good enough for tests that don't care about realistic difficulty
 * ordering.
 */
const STANDARD_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const STANDARD_TOTAL_PAR = STANDARD_PARS.reduce((sum, p) => sum + p, 0); // 72

/**
 * Creates a DRAFT championship, enrolls the given active memberIds,
 * sets a complete valid course/tee + 18-hole setup on all 4 rounds
 * (required before starting, per the course-setup rules), then starts
 * it (freezing handicaps — all members must be ACTIVE). Returns the
 * championshipId and the round 1 id.
 */
export async function makeActiveChampionshipWithPlayers(memberIds: string[]) {
  const year = testYear();
  const { championshipId } = await createDraftChampionship({
    year,
    name: `Scoring Test ${year}`,
  });

  for (const memberId of memberIds) {
    await addPlayerToChampionship({ championshipId, memberId });
  }

  const draftRounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));

  for (const round of draftRounds) {
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

  await startChampionship(championshipId);

  const rounds = await db
    .select()
    .from(championshipRounds)
    .where(eq(championshipRounds.championshipId, championshipId));

  const round1 = rounds.find((r) => r.roundNumber === 1)!;

  const players = await db
    .select()
    .from(championshipPlayers)
    .where(eq(championshipPlayers.championshipId, championshipId));

  return { championshipId, roundId: round1.id, players };
}

/** Creates a single group for a round and assigns the given championship players to it. */
export async function makeGroup(
  championshipRoundId: string,
  championshipPlayerIds: string[],
  groupNumber = 1
) {
  const [group] = await db
    .insert(roundGroups)
    .values({ championshipRoundId, groupNumber })
    .returning({ id: roundGroups.id });

  for (const [i, championshipPlayerId] of championshipPlayerIds.entries()) {
    await db.insert(roundGroupPlayers).values({
      roundGroupId: group.id,
      championshipRoundId,
      championshipPlayerId,
      position: i + 1,
    });
  }

  return group.id;
}

export async function cleanupChampionship(championshipId: string) {
  await db.delete(championships).where(eq(championships.id, championshipId));
}

export async function cleanupMember(memberId: string) {
  await db.delete(members).where(eq(members.id, memberId));
}
