import "server-only";

import { db } from "@/db";
import type { Invite } from "@/db/schema/invites";
import {
  createEnrollmentInviteWithDb,
  validateInviteTokenWithDb,
  markInviteUsedWithDb,
  revokeInviteWithDb,
  revokeOutstandingInvitesForMemberWithDb,
  getOutstandingInviteForMemberWithDb,
  type ValidInvite,
  type OutstandingInvite,
} from "@/lib/invites-core";

export type { ValidInvite, OutstandingInvite };

/**
 * Creates a single-use passkey enrollment invite for `memberId`, using
 * the app's request-scoped DB client.
 *
 * Returns the RAW token — this is the only time it is ever available.
 * Callers are responsible for building the `/enroll/[token]` link and
 * delivering it out-of-band. Only the hash is persisted.
 *
 * See src/lib/invites-core.ts for the shared implementation (also used
 * by the standalone owner-bootstrap script).
 */
export async function createEnrollmentInvite(params: {
  memberId: string;
  createdByMemberId?: string | null;
  ttlMs?: number;
}): Promise<{ rawToken: string; invite: Invite }> {
  return createEnrollmentInviteWithDb(db, params);
}

/**
 * Validates a raw invite token from an enrollment link.
 *
 * Returns null (never throws, never distinguishes *why*) unless the token
 * corresponds to an invite that is unused, unrevoked, unexpired, and whose
 * linked member is still ACTIVE. Callers must treat null as "this link is
 * not available" with no further detail surfaced to the client.
 */
export async function validateInviteToken(
  rawToken: string
): Promise<ValidInvite | null> {
  return validateInviteTokenWithDb(db, rawToken);
}

/** Marks an invite as consumed. Idempotent-safe: only sets `usedAt` once. */
export async function markInviteUsed(inviteId: string): Promise<void> {
  return markInviteUsedWithDb(db, inviteId);
}

/**
 * Revokes a single invite, provided it hasn't already been used or
 * revoked. Idempotent-safe no-op if the invite is already consumed.
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  return revokeInviteWithDb(db, inviteId);
}

/**
 * Revokes every currently-outstanding (unused, unrevoked) invite for a
 * member. Used to enforce the "only the latest invite is valid" policy
 * whenever a new one is generated for someone who already has one
 * pending. Never touches already-used invites (enrollment history) or
 * existing passkeys.
 */
export async function revokeOutstandingInvitesForMember(
  memberId: string
): Promise<void> {
  return revokeOutstandingInvitesForMemberWithDb(db, memberId);
}

/**
 * Returns the single currently-valid outstanding invite for a member, if
 * any (unused, unrevoked, unexpired). Used by the admin members list to
 * show pending-invite state without ever exposing the token itself.
 */
export async function getOutstandingInviteForMember(
  memberId: string
): Promise<OutstandingInvite | null> {
  return getOutstandingInviteForMemberWithDb(db, memberId);
}
