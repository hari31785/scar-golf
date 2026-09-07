import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema/members";
import { passkey as passkeyTable } from "@/db/schema/auth";
import { invites } from "@/db/schema/invites";
import { and, isNull, gt } from "drizzle-orm";

export type AdminMemberRow = {
  id: string;
  displayName: string;
  membershipType: "PERMANENT" | "ASSOCIATE";
  appRole: "PLAYER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  passkeyCount: number;
  outstandingInvite: { id: string; expiresAt: string } | null;
};

/**
 * Builds the full member roster for the admin members page.
 *
 * Deliberately returns ONLY display-safe fields: no credential IDs,
 * public keys, token hashes, or other sensitive auth internals. Passkey
 * state is reduced to a plain count, and invite state is reduced to
 * "does an outstanding one exist, and when does it expire".
 */
export async function listAdminMembers(): Promise<AdminMemberRow[]> {
  const allMembers = await db
    .select()
    .from(members)
    .orderBy(members.displayName);

  const passkeyCounts = await db
    .select({
      userId: passkeyTable.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(passkeyTable)
    .groupBy(passkeyTable.userId);
  const countByAuthUserId = new Map(
    passkeyCounts.map((row) => [row.userId, row.count])
  );

  const outstanding = await db
    .select({
      id: invites.id,
      memberId: invites.memberId,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(
      and(
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date())
      )
    );

  // Only one invite is ever meant to be outstanding per member (creating a
  // new one revokes prior ones), but reduce defensively to the newest in
  // case of any edge case.
  const latestOutstandingByMember = new Map<string, (typeof outstanding)[number]>();
  for (const invite of outstanding) {
    const existing = latestOutstandingByMember.get(invite.memberId);
    if (!existing || invite.createdAt > existing.createdAt) {
      latestOutstandingByMember.set(invite.memberId, invite);
    }
  }

  return allMembers.map((member) => {
    const outstandingInvite = latestOutstandingByMember.get(member.id);
    return {
      id: member.id,
      displayName: member.displayName,
      membershipType: member.membershipType,
      appRole: member.appRole,
      status: member.status,
      passkeyCount: member.authUserId
        ? (countByAuthUserId.get(member.authUserId) ?? 0)
        : 0,
      outstandingInvite: outstandingInvite
        ? {
            id: outstandingInvite.id,
            expiresAt: outstandingInvite.expiresAt.toISOString(),
          }
        : null,
    };
  });
}
