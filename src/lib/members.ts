import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, type Member } from "@/db/schema/members";
import { normalizeEmail } from "@/lib/normalize-email";

export { normalizeEmail };

/**
 * Looks up an ACTIVE SCAR member by their linked Better Auth user id.
 *
 * Preferred over `findActiveMemberByEmail` whenever a stable auth user id
 * is available (i.e. for any session created via passkey enrollment),
 * since it doesn't depend on email staying in sync between the two
 * tables. Returns null for unlinked/unknown/inactive users.
 */
export async function findActiveMemberByAuthUserId(
  authUserId: string
): Promise<Member | null> {
  const rows = await db
    .select()
    .from(members)
    .where(
      and(eq(members.authUserId, authUserId), eq(members.status, "ACTIVE"))
    )
    .limit(2);

  if (rows.length !== 1) {
    return null;
  }

  return rows[0];
}

/**
 * Looks up an ACTIVE SCAR member by (normalized) email.
 *
 * Returns the member row only if there is exactly one ACTIVE member with
 * that email. Returns null for unknown emails, inactive members, or any
 * ambiguous state — callers must treat null as "not authorized" and must
 * not leak which case occurred.
 */
export async function findActiveMemberByEmail(
  email: string
): Promise<Member | null> {
  const normalized = normalizeEmail(email);

  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.email, normalized), eq(members.status, "ACTIVE")))
    .limit(2);

  if (rows.length !== 1) {
    return null;
  }

  return rows[0];
}

/** Derives display initials (e.g. "Srikanth Mamidala" -> "SM"). */
export function getInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0).toUpperCase();
  const last = lastName.trim().charAt(0).toUpperCase();
  return `${first}${last}` || "?";
}
