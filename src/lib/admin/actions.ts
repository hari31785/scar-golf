"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members } from "@/db/schema/members";
import { requireAdminMember } from "@/lib/current-member";
import {
  createEnrollmentInvite,
  revokeInvite,
  revokeOutstandingInvitesForMember,
} from "@/lib/invites";

export type CreateInviteResult =
  | {
      ok: true;
      url: string;
      expiresAt: string;
      memberDisplayName: string;
    }
  | { ok: false; error: string };

/**
 * Admin-only: generates a fresh single-use enrollment invite for a member.
 *
 * Enforces, in order:
 * - the caller is an ACTIVE ADMIN member (re-checked here, independent of
 *   whatever the UI shows — this is the real authorization boundary)
 * - the target member exists and is ACTIVE
 *
 * Policy: any previously-outstanding (unused, unrevoked) invite for this
 * member is revoked first, so only the newly-generated invite is ever
 * valid. Existing passkeys are never touched.
 *
 * Returns the raw enrollment URL exactly once. It is never persisted or
 * logged anywhere — only its hash is stored (see src/lib/invites.ts).
 */
export async function createInviteAction(
  memberId: string
): Promise<CreateInviteResult> {
  try {
    const current = await requireAdminMember();

    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);

    if (!member || member.status !== "ACTIVE") {
      return { ok: false, error: "This member is not active." };
    }

    const baseUrl = process.env.BETTER_AUTH_URL;
    if (!baseUrl) {
      return { ok: false, error: "Application URL is not configured." };
    }

    await revokeOutstandingInvitesForMember(memberId);

    const { rawToken, invite } = await createEnrollmentInvite({
      memberId,
      createdByMemberId: current.member.id,
    });

    revalidatePath("/admin/members");

    return {
      ok: true,
      url: `${baseUrl}/enroll/${rawToken}`,
      expiresAt: invite.expiresAt.toISOString(),
      memberDisplayName: member.displayName,
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't create the invite. Please try again.",
    };
  }
}

export type RevokeInviteResult = { ok: true } | { ok: false; error: string };

/** Admin-only: revokes a currently-outstanding enrollment invite. */
export async function revokeInviteAction(
  inviteId: string
): Promise<RevokeInviteResult> {
  try {
    await requireAdminMember();
    await revokeInvite(inviteId);
    revalidatePath("/admin/members");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't revoke the invite." };
  }
}
