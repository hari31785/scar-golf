/**
 * Core enrollment-invite logic, parameterized by an injected DB client.
 *
 * Deliberately does NOT import "server-only" so it can be safely used
 * both from the Next.js server runtime (via src/lib/invites.ts, which
 * wraps these functions with the app's `@/db` client) and from
 * standalone Node/tsx scripts (via src/db/script-client.ts's `scriptDb`,
 * e.g. src/db/bootstrap/owner.ts). This avoids ever duplicating the
 * security-sensitive token generation/hashing logic between the two.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, desc } from "drizzle-orm";
import type { db as AppDb } from "@/db";
import { invites, type Invite } from "@/db/schema/invites";
import { members, type Member } from "@/db/schema/members";

// Structural type: matches both the app's drizzle db instance and the
// standalone script's, without importing either (which would pull in
// "server-only" transitively for the app one).
type DbLike = Pick<typeof AppDb, "select" | "insert" | "update">;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Generates a cryptographically random, URL-safe raw invite token. */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hashes a raw token for storage/lookup. Never store the raw token itself. */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a single-use passkey enrollment invite for `memberId`.
 *
 * Returns the RAW token — this is the only time it is ever available.
 * Callers are responsible for building the `/enroll/[token]` link and
 * delivering it out-of-band. Only the hash is persisted.
 */
export async function createEnrollmentInviteWithDb(
  db: DbLike,
  params: {
    memberId: string;
    createdByMemberId?: string | null;
    ttlMs?: number;
  }
): Promise<{ rawToken: string; invite: Invite }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS));

  const [invite] = await db
    .insert(invites)
    .values({
      memberId: params.memberId,
      tokenHash,
      expiresAt,
      createdByMemberId: params.createdByMemberId ?? null,
    })
    .returning();

  return { rawToken, invite };
}

export type ValidInvite = {
  invite: Invite;
  member: Member;
};

/**
 * Validates a raw invite token from an enrollment link.
 *
 * Returns null (never throws, never distinguishes *why*) unless the token
 * corresponds to an invite that is unused, unrevoked, unexpired, and whose
 * linked member is still ACTIVE. Callers must treat null as "this link is
 * not available" with no further detail surfaced to the client.
 */
export async function validateInviteTokenWithDb(
  db: DbLike,
  rawToken: string
): Promise<ValidInvite | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const rows = await db
    .select({ invite: invites, member: members })
    .from(invites)
    .innerJoin(members, eq(invites.memberId, members.id))
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        eq(members.status, "ACTIVE")
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.invite.expiresAt.getTime() <= Date.now()) return null;

  return row;
}

/** Marks an invite as consumed. Idempotent-safe: only sets `usedAt` once. */
export async function markInviteUsedWithDb(
  db: DbLike,
  inviteId: string
): Promise<void> {
  await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)));
}

/**
 * Revokes a single invite, provided it hasn't already been used or
 * revoked. Idempotent-safe no-op if the invite is already consumed.
 */
export async function revokeInviteWithDb(
  db: DbLike,
  inviteId: string
): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.id, inviteId),
        isNull(invites.usedAt),
        isNull(invites.revokedAt)
      )
    );
}

/**
 * Revokes every currently-outstanding (unused, unrevoked) invite for a
 * member. Used to enforce the "only the latest invite is valid" policy
 * whenever a new one is generated for someone who already has one
 * pending. Never touches already-used invites (enrollment history) or
 * existing passkeys.
 */
export async function revokeOutstandingInvitesForMemberWithDb(
  db: DbLike,
  memberId: string
): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.memberId, memberId),
        isNull(invites.usedAt),
        isNull(invites.revokedAt)
      )
    );
}

export type OutstandingInvite = {
  id: string;
  expiresAt: Date;
};

/**
 * Returns the single currently-valid outstanding invite for a member, if
 * any (unused, unrevoked, unexpired).
 */
export async function getOutstandingInviteForMemberWithDb(
  db: DbLike,
  memberId: string
): Promise<OutstandingInvite | null> {
  const rows = await db
    .select({ id: invites.id, expiresAt: invites.expiresAt })
    .from(invites)
    .where(
      and(
        eq(invites.memberId, memberId),
        isNull(invites.usedAt),
        isNull(invites.revokedAt)
      )
    )
    .orderBy(desc(invites.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}
