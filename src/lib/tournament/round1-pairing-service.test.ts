import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  championshipPlayers,
  members,
  roundGroupPlayers,
  roundGroups,
} from "@/db/schema";
import {
  generateAndPersistRound1Pairing,
  Round1PairingError,
  generateRound1Groups,
} from "./round1-pairing-service";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  cleanupChampionship,
  cleanupMember,
} from "./scoring/test-helpers";

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

/** makeMember always inserts PERMANENT; this flips a member to ASSOCIATE afterward. */
async function makeAssociateMember() {
  const id = await makeMember();
  await db
    .update(members)
    .set({ membershipType: "ASSOCIATE" })
    .where(eq(members.id, id));
  return id;
}

describe("generateAndPersistRound1Pairing", () => {
  it("4 founders => first group contains all 4 founders", async () => {
    const permanentIds = [await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    const associateIds = [await makeAssociateMember(), await makeAssociateMember()];
    createdMemberIds.push(...permanentIds, ...associateIds);

    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers([...permanentIds, ...associateIds]);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    await generateAndPersistRound1Pairing({ championshipRoundId: roundId });

    const groupPlayers = await db
      .select({
        groupNumber: roundGroups.groupNumber,
        championshipPlayerId: roundGroupPlayers.championshipPlayerId,
      })
      .from(roundGroupPlayers)
      .innerJoin(roundGroups, eq(roundGroups.id, roundGroupPlayers.roundGroupId))
      .where(eq(roundGroupPlayers.championshipRoundId, roundId))
      .orderBy(roundGroups.groupNumber);

    const founderPlayerIds = new Set(permanentIds.map((m) => byMember.get(m)!.id));
    const group1 = groupPlayers.filter((g) => g.groupNumber === 1).map((g) => g.championshipPlayerId);

    expect(group1.length).toBe(4);
    expect(new Set(group1)).toEqual(founderPlayerIds);
  });

  it("every ACTIVE player is persisted exactly once", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    await generateAndPersistRound1Pairing({ championshipRoundId: roundId });

    const rows = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, roundId));

    expect(rows.length).toBe(players.length);
    const uniquePlayerIds = new Set(rows.map((r) => r.championshipPlayerId));
    expect(uniquePlayerIds.size).toBe(players.length);
  });

  it("WITHDRAWN/DISQUALIFIED participants are excluded from persistence", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId, players } =
      await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);
    const byMember = new Map(players.map((p) => [p.memberId, p]));

    const withdrawnPlayer = byMember.get(memberIds[0])!;
    await db
      .update(championshipPlayers)
      .set({ participantStatus: "WITHDRAWN" })
      .where(eq(championshipPlayers.id, withdrawnPlayer.id));

    await generateAndPersistRound1Pairing({ championshipRoundId: roundId });

    const rows = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, roundId));

    const persistedIds = rows.map((r) => r.championshipPlayerId);
    expect(persistedIds).not.toContain(withdrawnPlayer.id);
    expect(rows.length).toBe(2); // 3 total - 1 withdrawn
  });

  it("retrying generation for a round that already has pairings is rejected (no duplicates)", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId } =
      await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    await generateAndPersistRound1Pairing({ championshipRoundId: roundId });

    await expect(
      generateAndPersistRound1Pairing({ championshipRoundId: roundId })
    ).rejects.toThrow(Round1PairingError);

    const rows = await db
      .select()
      .from(roundGroupPlayers)
      .where(eq(roundGroupPlayers.championshipRoundId, roundId));
    expect(rows.length).toBe(3); // unchanged, no duplicates

    const groups = await db
      .select()
      .from(roundGroups)
      .where(eq(roundGroups.championshipRoundId, roundId));
    expect(groups.length).toBe(1); // unchanged, no duplicate groups
  });

  it("3 founders => first group contains founders + exactly 1 associate", () => {
    const founders = ["f1", "f2", "f3"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "PERMANENT" as const,
    }));
    const associates = ["a1", "a2", "a3"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "ASSOCIATE" as const,
    }));

    const groups = generateRound1Groups([...founders, ...associates], "round-3f");
    const firstGroup = groups[0];

    expect(firstGroup.length).toBe(4);
    expect(founders.every((f) => firstGroup.includes(f.championshipPlayerId))).toBe(true);
    const associatesInFirstGroup = firstGroup.filter((id) => id.startsWith("a"));
    expect(associatesInFirstGroup.length).toBe(1);
  });

  it("2 founders => first group contains founders + exactly 2 associates", () => {
    const founders = ["f1", "f2"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "PERMANENT" as const,
    }));
    const associates = ["a1", "a2", "a3", "a4"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "ASSOCIATE" as const,
    }));

    const groups = generateRound1Groups([...founders, ...associates], "round-2f");
    const firstGroup = groups[0];

    expect(firstGroup.length).toBe(4);
    expect(founders.every((f) => firstGroup.includes(f.championshipPlayerId))).toBe(true);
    const associatesInFirstGroup = firstGroup.filter((id) => id.startsWith("a"));
    expect(associatesInFirstGroup.length).toBe(2);
  });

  it("remaining groups are deterministically randomized and every ACTIVE player appears exactly once", () => {
    const founders = ["f1", "f2"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "PERMANENT" as const,
    }));
    const associates = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "ASSOCIATE" as const,
    }));
    const allIds = [...founders, ...associates].map((p) => p.championshipPlayerId);

    const groupsRun1 = generateRound1Groups([...founders, ...associates], "round-remaining");
    const groupsRun2 = generateRound1Groups([...founders, ...associates], "round-remaining");

    // Every ACTIVE player appears exactly once across all groups.
    const flatIds = groupsRun1.flat();
    expect(flatIds.length).toBe(allIds.length);
    expect(new Set(flatIds).size).toBe(allIds.length);
    expect(new Set(flatIds)).toEqual(new Set(allIds));

    // The remaining (non-first) groups are deterministic across runs.
    expect(groupsRun2.slice(1)).toEqual(groupsRun1.slice(1));
  });

  it("rerunning the pure Round 1 grouping with identical inputs produces identical output", () => {
    const founders = ["f1", "f2", "f3", "f4"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "PERMANENT" as const,
    }));
    const associates = ["a1", "a2", "a3"].map((id) => ({
      championshipPlayerId: id,
      membershipTypeSnapshot: "ASSOCIATE" as const,
    }));

    const run1 = generateRound1Groups([...founders, ...associates], "round-rerun");
    const run2 = generateRound1Groups([...founders, ...associates], "round-rerun");

    expect(run2).toEqual(run1);
  });
});
