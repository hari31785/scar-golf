import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { findActiveMemberByAuthUserId, findActiveMemberByEmail } from "@/lib/members";
import type { Member } from "@/db/schema/members";

export type CurrentMember = {
  member: Member;
  authUserId: string;
};

/**
 * Resolves the currently authenticated SCAR member, re-verifying against
 * the `members` table on every call.
 *
 * Returns null if:
 * - there is no valid Better Auth session, OR
 * - the session's user no longer matches an ACTIVE SCAR member (e.g. an
 *   admin deactivated them after their session was created).
 *
 * Prefers the stable `members.authUserId` link (set on passkey
 * enrollment); falls back to email matching for any session predating
 * that link (e.g. an old OTP-era session). This is the single source of
 * truth for "is this request authorized" — always call this rather than
 * trusting a Better Auth session by itself.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const member =
    (await findActiveMemberByAuthUserId(session.user.id)) ??
    (await findActiveMemberByEmail(session.user.email));
  if (!member) {
    return null;
  }

  return { member, authUserId: session.user.id };
}

/**
 * Resolves the current SCAR member and throws unless they are an ACTIVE
 * member with the ADMIN app role.
 *
 * Intended for use at the top of every admin server action / page, in
 * addition to (not instead of) hiding admin UI/navigation from PLAYER
 * members — this is the actual enforcement layer, since server actions
 * are directly callable regardless of what the UI shows.
 */
export async function requireAdminMember(): Promise<CurrentMember> {
  const current = await getCurrentMember();
  if (!current || current.member.appRole !== "ADMIN") {
    throw new Error("Not authorized.");
  }
  return current;
}
