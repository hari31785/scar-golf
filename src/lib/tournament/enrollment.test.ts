import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { championships, members, championshipPlayers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDraftChampionship } from "./create";
import {
  addPlayerToChampionship,
  removePlayerFromChampionship,
} from "./enrollment";

function testYear(): number {
  return 91000 + Math.floor(Math.random() * 900);
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
    await db.delete(members).where(eq(members.id, id));
  }
});

async function makeDraftChampionship() {
  const year = testYear();
  const { championshipId } = await createDraftChampionship({
    year,
    name: `Enrollment Test ${year}`,
  });
  createdChampionshipIds.push(championshipId);
  return championshipId;
}

async function makeMember(status: "ACTIVE" | "INACTIVE") {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Player",
      displayName: "Test Player",
      email: testEmail(),
      membershipType: "ASSOCIATE",
      status,
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  createdMemberIds.push(inserted.id);
  return inserted.id;
}

describe("addPlayerToChampionship", () => {
  it("B: cannot add the same member twice", async () => {
    const championshipId = await makeDraftChampionship();
    const memberId = await makeMember("ACTIVE");

    await addPlayerToChampionship({ championshipId, memberId });
    await expect(
      addPlayerToChampionship({ championshipId, memberId })
    ).rejects.toThrow();

    const rows = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(rows).toHaveLength(1);
  });

  it("C: rejects an inactive member", async () => {
    const championshipId = await makeDraftChampionship();
    const memberId = await makeMember("INACTIVE");

    await expect(
      addPlayerToChampionship({ championshipId, memberId })
    ).rejects.toThrow();

    const rows = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(rows).toHaveLength(0);
  });

  it("successfully enrolls an active member exactly once", async () => {
    const championshipId = await makeDraftChampionship();
    const memberId = await makeMember("ACTIVE");

    const { championshipPlayerId } = await addPlayerToChampionship({
      championshipId,
      memberId,
    });
    expect(championshipPlayerId).toBeTruthy();

    const [row] = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.id, championshipPlayerId));
    expect(row.participantStatus).toBe("ACTIVE");
    expect(row.frozenHandicap).toBeNull();
  });
});

describe("removePlayerFromChampionship", () => {
  it("removes a player while still DRAFT", async () => {
    const championshipId = await makeDraftChampionship();
    const memberId = await makeMember("ACTIVE");
    await addPlayerToChampionship({ championshipId, memberId });

    await removePlayerFromChampionship({ championshipId, memberId });

    const rows = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(rows).toHaveLength(0);
  });
});
