import "dotenv/config";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roundGroups, members } from "@/db/schema";
import { setRoundGroupTeeTimes, TeeTimeUpdateError } from "./tee-times";
import {
  makeMember,
  makeActiveChampionshipWithPlayers,
  makeGroup,
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

async function makeAdminMember() {
  const [inserted] = await db
    .insert(members)
    .values({
      firstName: "Test",
      lastName: "Admin",
      displayName: "Test Admin",
      email: `scar-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
      membershipType: "ASSOCIATE",
      status: "ACTIVE",
      appRole: "ADMIN",
      joinedAt: new Date(),
    })
    .returning({ id: members.id });
  return inserted.id;
}

describe("setRoundGroupTeeTimes", () => {
  it("ADMIN can update tee times for existing groups", async () => {
    const memberIds = [await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    const groupId = await makeGroup(roundId, players.map((p) => p.id));
    const adminId = await makeAdminMember();
    createdMemberIds.push(adminId);

    await setRoundGroupTeeTimes({
      championshipRoundId: roundId,
      actingMemberId: adminId,
      updates: [{ roundGroupId: groupId, teeTime: "2026-05-01T08:10:00.000Z" }],
    });

    const [group] = await db.select().from(roundGroups).where(eq(roundGroups.id, groupId));
    expect(group.teeTime?.toISOString()).toBe("2026-05-01T08:10:00.000Z");
  });

  it("rejects a non-ADMIN acting member and leaves the tee time unchanged", async () => {
    const memberIds = [await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    const groupId = await makeGroup(roundId, players.map((p) => p.id));
    const nonAdminId = await makeMember();
    createdMemberIds.push(nonAdminId);

    await expect(
      setRoundGroupTeeTimes({
        championshipRoundId: roundId,
        actingMemberId: nonAdminId,
        updates: [{ roundGroupId: groupId, teeTime: "2026-05-01T08:10:00.000Z" }],
      })
    ).rejects.toThrow(TeeTimeUpdateError);

    const [group] = await db.select().from(roundGroups).where(eq(roundGroups.id, groupId));
    expect(group.teeTime).toBeNull();
  });

  it("rejects a nonexistent group", async () => {
    const memberIds = [await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    const adminId = await makeAdminMember();
    createdMemberIds.push(adminId);

    await expect(
      setRoundGroupTeeTimes({
        championshipRoundId: roundId,
        actingMemberId: adminId,
        updates: [{ roundGroupId: "00000000-0000-0000-0000-000000000000", teeTime: "2026-05-01T08:10:00.000Z" }],
      })
    ).rejects.toThrow(TeeTimeUpdateError);
  });

  it("batch update is atomic — one invalid group rolls back all updates in the batch", async () => {
    const memberIds = [await makeMember(), await makeMember(), await makeMember(), await makeMember()];
    createdMemberIds.push(...memberIds);
    const { championshipId, roundId, players } = await makeActiveChampionshipWithPlayers(memberIds);
    createdChampionshipIds.push(championshipId);

    const groupA = await makeGroup(roundId, [players[0].id, players[1].id], 1);
    const groupB = await makeGroup(roundId, [players[2].id, players[3].id], 2);
    const adminId = await makeAdminMember();
    createdMemberIds.push(adminId);

    await expect(
      setRoundGroupTeeTimes({
        championshipRoundId: roundId,
        actingMemberId: adminId,
        updates: [
          { roundGroupId: groupA, teeTime: "2026-05-01T08:10:00.000Z" },
          { roundGroupId: "00000000-0000-0000-0000-000000000000", teeTime: "2026-05-01T08:20:00.000Z" },
        ],
      })
    ).rejects.toThrow(TeeTimeUpdateError);

    const [group] = await db.select().from(roundGroups).where(eq(roundGroups.id, groupA));
    expect(group.teeTime).toBeNull();
    const [group2] = await db.select().from(roundGroups).where(eq(roundGroups.id, groupB));
    expect(group2.teeTime).toBeNull();
  });
});
