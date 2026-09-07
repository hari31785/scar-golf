import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  championships,
  championshipRounds,
  championshipPlayers,
  members,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDraftChampionship } from "./create";

/** Test years chosen far outside any real SCAR championship year. */
function testYear(): number {
  return 90000 + Math.floor(Math.random() * 9000);
}

const createdChampionshipIds: string[] = [];

afterEach(async () => {
  for (const id of createdChampionshipIds.splice(0)) {
    await db.delete(championships).where(eq(championships.id, id));
  }
});

describe("createDraftChampionship", () => {
  it("A: produces exactly 4 championship_rounds rows numbered 1-4", async () => {
    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `Test Championship ${year}`,
    });
    createdChampionshipIds.push(championshipId);

    const rounds = await db
      .select()
      .from(championshipRounds)
      .where(eq(championshipRounds.championshipId, championshipId));

    expect(rounds).toHaveLength(4);
    expect(rounds.map((r) => r.roundNumber).sort()).toEqual([1, 2, 3, 4]);
    for (const r of rounds) {
      expect(r.status).toBe("NOT_STARTED");
    }
  });

  it("creates the championship itself as DRAFT with no players enrolled", async () => {
    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `Test Championship ${year}`,
    });
    createdChampionshipIds.push(championshipId);

    const [championship] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));
    expect(championship.status).toBe("DRAFT");

    const players = await db
      .select()
      .from(championshipPlayers)
      .where(eq(championshipPlayers.championshipId, championshipId));
    expect(players).toHaveLength(0);
  });

  it("rejects creating a second non-cancelled championship for the same year", async () => {
    const year = testYear();
    const { championshipId } = await createDraftChampionship({
      year,
      name: `First ${year}`,
    });
    createdChampionshipIds.push(championshipId);

    await expect(
      createDraftChampionship({ year, name: `Second ${year}` })
    ).rejects.toThrow();
  });
});
