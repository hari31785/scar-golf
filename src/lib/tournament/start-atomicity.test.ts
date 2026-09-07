import "dotenv/config";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the handicap service BEFORE importing startChampionship, so the
// mock is used inside src/lib/tournament/start.ts. Only this test file
// uses a mocked handicap calculation — every other tournament test uses
// the real engine against real (test-created) played_rounds data.
vi.mock("@/lib/handicap/service", () => ({
  calculateHandicapForMember: vi.fn(async (memberId: string) => {
    if (memberId === FAILING_MEMBER_ID) {
      throw new Error("Simulated handicap calculation failure for testing atomicity.");
    }
    return {
      actualRoundsUsed: [],
      paddingRoundsAdded: [],
      differentials: [],
      selectedLowest8: [],
      rawAverageLowest8: 0,
      roundedHandicap: 5,
      maxHandicap: 18,
      finalHandicap: 5,
    };
  }),
}));

import { db } from "@/db";
import { championships, members, championshipPlayers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDraftChampionship } from "./create";
import { addPlayerToChampionship } from "./enrollment";
import { startChampionship } from "./start";

function testYear(): number {
  return 93000 + Math.floor(Math.random() * 900);
}

function testEmail(): string {
  return `scar-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

let FAILING_MEMBER_ID = "";

const createdChampionshipIds: string[] = [];
const createdMemberIds: string[] = [];

afterEach(async () => {
  for (const id of createdChampionshipIds.splice(0)) {
    await db.delete(championships).where(eq(championships.id, id));
  }
  for (const id of createdMemberIds.splice(0)) {
    await db.delete(members).where(eq(members.id, id));
  }
  FAILING_MEMBER_ID = "";
});

async function makeActiveMember() {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Golfer",
      displayName: "Test Golfer",
      email: testEmail(),
      membershipType: "ASSOCIATE",
      status: "ACTIVE",
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  createdMemberIds.push(inserted.id);
  return inserted.id;
}

describe("startChampionship — atomicity", () => {
  it("F: if any participant's handicap calculation fails, nothing is partially frozen and the championship stays DRAFT", async () => {
    const goodMemberId = await makeActiveMember();
    const badMemberId = await makeActiveMember();
    FAILING_MEMBER_ID = badMemberId;

    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `Atomic Test ${year}`,
    });
    createdChampionshipIds.push(championshipId);

    await addPlayerToChampionship({ championshipId, memberId: goodMemberId });
    await addPlayerToChampionship({ championshipId, memberId: badMemberId });

    await expect(startChampionship(championshipId)).rejects.toThrow();

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("DRAFT");

    const players = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    for (const p of players) {
      expect(p.frozenHandicap).toBeNull();
      expect(p.membershipTypeSnapshot).toBeNull();
    }
  });
});
